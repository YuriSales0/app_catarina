# 05 — Next Lesson Engine

The component the product's credibility rests on. If this is deterministic,
explainable and correct, the claim "learning based on evidence, not chatbot
memory" is true. If it is not, nothing else matters.

---

## Shape

Load, compute, plan — separated so the decision itself is a pure function.

```ts
// I/O boundary. Authorized, then loads exactly the inputs the core needs.
getNextLessonPlan(
  access: StudentAccess,
  subjectId: SubjectId,
  options?: { now?: Date; lessonMinutes?: number }
): Promise<NextLessonPlan>

// Pure. No database, no clock, no randomness, no network.
selectNextObjective(input: EngineInput): EngineDecision
buildLessonStructure(decision: EngineDecision, policy: LessonPolicy): NextLessonPlan
```

`EngineInput` is a plain value: the curriculum version's objectives and units,
the prerequisite edges, the student's objective states, the review rows, the
recurring error aggregate, and the last N lessons. `now` is passed in, never
read. Two calls with the same input produce the same output, which is asserted by
a property test rather than assumed.

The core never sees an LLM. There is no provider import in the module, and the
module-boundary lint rule forbids one (D14).

---

## Algorithm

Implementing the twelve steps from section 19.

### Step 1 — Load the active curriculum

Read `student_subjects.curriculum_version_id`. If unset, the enrolment is
incomplete and the engine returns a typed `NEEDS_CURRICULUM` outcome rather than
guessing. Guessing a curriculum would be exactly the kind of invented structure
the brief forbids.

### Step 2 — Candidate set

Every objective in the pinned version, joined to the student's state, defaulting
to `NOT_STARTED` where no row exists.

### Step 3 — Prerequisite evaluation

For each candidate, every `HARD` prerequisite edge must be satisfied: the
student's status on the prerequisite objective is at or above the edge's
`required_status`, on the status ordering
`NOT_STARTED < INTRODUCED < PRACTISING < DEVELOPING < PROFICIENT < MASTERED`.
Prerequisites are resolved by `lineage_id`, so evidence earned under an earlier
curriculum version still counts (D8).

`SOFT` edges do not gate; they apply a score penalty in step 8.

### Step 4 — Exclude locked objectives

A candidate failing any `HARD` prerequisite is removed from primary selection
entirely. It is not merely deprioritized. This is the brief's hardest rule and it
is enforced by set removal before scoring, so no score, however high, can
resurrect it. A separate test asserts that a locked objective never appears as
`primary_objective_id` under any input.

Also excluded from primary selection: objectives already `MASTERED` (they may
still be chosen for review), and objectives whose unit is marked inactive.

### Step 5 — Due review

From `student_objective_review`, objectives with `next_review_at <= now` in the
student's local day, ordered by how overdue they are. These become review
candidates, and an overdue `PROFICIENT` objective is also how a retention check
gets scheduled, which is what the `MASTERED` rule depends on (D6).

### Step 6 — Recurring errors

Aggregate `error_tags` over the student's evidence in the last 30 days for this
subject. A tag appearing ≥ 3 times across ≥ 2 lessons is a recurring error. Each
maps to the objectives that produced it, raising their priority.

Counting across lessons, not just attempts, matters: ten mistakes in one bad
afternoon is a bad afternoon, while three mistakes across three weeks is a
pattern.

### Steps 6–9 — Scoring

Every unlocked candidate is scored. Weights are a named, versioned constant
(`ENGINE_POLICY_V1`), not literals scattered in code.

| Component | Weight | Rationale |
| --- | --- | --- |
| Overdue review (`PROFICIENT`/`MASTERED` past due) | +50, plus 2 per day overdue, capped +30 | Retention beats new material; this is what makes mastery mean retention |
| Status `DEVELOPING` | +40 | Section 19 asks for it explicitly: finish what is started |
| Status `PRACTISING` | +30 | |
| Recurring error attached to this objective | +25 per tag, capped +50 | Unblock what is actually failing |
| Status `INTRODUCED` | +20 | |
| Status `NOT_STARTED` and next in curriculum sequence | +15 | Forward progress, but it yields to consolidation |
| Curriculum sequence position | −0.1 per position from the frontier | Prefers earlier objectives, breaking ties toward the syllabus order |
| Unsatisfied `SOFT` prerequisite | −20 each | A preference, not a gate |
| Chosen as primary in the last 2 lessons | −35 | Step 9, avoid excessive repetition |
| Chosen as primary in 3 of the last 5 lessons | −60 additional | Stronger brake on grinding |
| No successful attempt in the last 4 lessons on this objective | −25, and flags a remediation hint | Repeating a wall is not teaching |
| Difficulty more than 2 above the student's current working level | −15 | Gentle pacing guard |

Determinism requires a total order, so ties break on: score, then curriculum
sequence, then unit sequence, then `objective_id` ascending. There is no random
selection anywhere in the engine.

### Step 10 — Select the primary objective

Highest score wins. If the candidate set is empty, the engine returns a typed
outcome rather than inventing something:

- `CURRICULUM_COMPLETE` — everything is `MASTERED`.
- `BLOCKED` — unlocked candidates exist only behind unmet prerequisites that the
  student is failing; returns the blocking objectives so the parent sees why.
- `NEEDS_CURRICULUM` — no version pinned.
- `REVIEW_ONLY` — nothing new is available, but reviews are due.

### Step 11 — Lesson structure

Given the primary objective plus up to two review objectives, the planner emits
activities from a declarative template keyed on the primary objective's status:

| Primary status | Activity sequence |
| --- | --- |
| `NOT_STARTED` / `INTRODUCED` | REVIEW → EXPLANATION → PRACTICE → GAME → ASSESSMENT(short) |
| `PRACTISING` / `DEVELOPING` | REVIEW → PRACTICE → CONVERSATION → ASSESSMENT |
| `PROFICIENT` (retention check) | REVIEW → ASSESSMENT → GAME |

Durations are apportioned to `planned_lesson_minutes` (default 20 for a
seven-year-old, D-open-question 2). The structure says what kind of activity
happens and against which objective and skill. It does not contain the content;
generating the actual questions, stories and examples is the AI's job later, and
in the MVP it is the parent's, working from the instructions field.

### Step 12 — Validated plan

```ts
NextLessonPlan = {
  plan_version: 'nlp.v1',
  engine_version: 'engine.v1',
  generated_at: string,
  student_id, subject_id, curriculum_version_id,
  outcome: 'PLANNED' | 'CURRICULUM_COMPLETE' | 'BLOCKED' | 'NEEDS_CURRICULUM' | 'REVIEW_ONLY',
  primary_objective: { id, code, title, status, confidence } | null,
  review_objectives: Array<{ id, code, title, status, days_overdue }>,
  planned_duration_minutes: number,
  activities: Array<{
    sequence, activity_type, objective_id | null, skill_id | null,
    instructions, expected_evidence_count
  }>,
  rationale: EngineRationale,
  candidates_considered: number
}
```

Zod-validated before it leaves the function and again before it is persisted to
`lessons.plan_payload`.

---

## The rationale object

The Parent Explanation Layer (section 26) is not a generated paragraph. It is
this structure, rendered:

```ts
EngineRationale = {
  selected_because: Array<
    | { kind: 'DEVELOPING_CONTINUATION'; evidence_ids: string[] }
    | { kind: 'REVIEW_DUE'; days_overdue: number; last_success_at: string }
    | { kind: 'RECURRING_ERROR'; error_tag: string; occurrences: number; lesson_ids: string[] }
    | { kind: 'NEXT_IN_SEQUENCE'; unit: string; position: number }
    | { kind: 'RETENTION_CHECK'; proficient_since: string }
  >,
  prerequisites_satisfied: Array<{ objective_code: string; status: ObjectiveStatus }>,
  alternatives_rejected: Array<{ objective_code: string; reason: 'LOCKED' | 'RECENTLY_TAUGHT' | 'LOWER_PRIORITY'; blocking?: string[] }>,
  score_breakdown: Array<{ component: string; value: number }>,
  policy_version: string
}
```

So "Why subtraction today?" is answered by data: the prerequisite *Numbers ≤ 20*
is `MASTERED`, the current state is `DEVELOPING`, these three evidence rows are
why, and these two alternatives were rejected for these reasons. An LLM may later
phrase that warmly for a parent, but it phrases *this object* and may not add to
it. The UI renders the structured version underneath, always available.

---

## Interaction with state and review

The engine reads derived state; it never writes it. The write direction is
strictly one-way:

```
evidence → evaluateObjectiveState → state + transition + review schedule
                                          ↓
                                  Next Lesson Engine (read-only)
                                          ↓
                                    NextLessonPlan → lesson
```

A lesson being created never changes what the child is believed to know. Only
recorded evidence does.

---

## Tests that must pass

1. **Determinism.** Same `EngineInput` and `now`, 1000 runs, identical output.
2. **Prerequisite gate.** For every generated graph and state combination, a
   `HARD`-locked objective is never the primary objective. Property-based, not
   example-based.
3. **No LLM on the path.** A static check that the engine module's import graph
   contains no AI provider module.
4. **Repetition brake.** After the same objective is primary twice running, a
   viable alternative is chosen if one exists.
5. **Review precedence.** An overdue `PROFICIENT` objective outranks a new
   `NOT_STARTED` one.
6. **Empty-set honesty.** Each of the four non-`PLANNED` outcomes is produced by
   a fixture, and none of them fabricates an objective.
7. **Cross-version continuity.** A student whose evidence is on version 1.0.0,
   moved to 1.1.0, keeps satisfied prerequisites through `lineage_id`.
8. **Explanation completeness.** Every plan with `outcome = 'PLANNED'` has a
   non-empty `selected_because` and a `score_breakdown` that sums to the winning
   score.
