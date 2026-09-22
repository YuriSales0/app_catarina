# 07 — Lesson Report schema

Every completed lesson produces one report. The report's structural job is to
keep observed facts, inferences and recommendations apart (section 16), so that
no consumer, human or machine, can mistake one for another.

Stored in `lesson_reports.payload` with `schema_version = 'report.v1'`.

---

## Three sections, three epistemic statuses

The report is not a flat object with a free-text note. It has three top-level
sections whose names are the guarantee:

```ts
LessonReport = {
  schema_version: 'report.v1',
  lesson_id: string,
  student_id: string,
  subject_id: string,
  lesson_number: number,
  generated_at: string,
  generated_by: 'SYSTEM' | 'AI_PROVIDER' | 'HUMAN',
  generator_ref: { provider?, model?, prompt_version?, user_id? } | null,

  observed: ObservedSection,          // facts, each traceable to evidence
  inferred: InferredSection,          // opinions, each labelled with its source
  recommended: RecommendedSection     // proposals, none of them applied
}
```

### `observed` — what happened

Every field here is computed from `learning_evidence` and `lesson_events` by
deterministic code. **The AI never writes this section.** If the AI is asked to
produce a report, its output for `observed` is discarded and replaced by the
computed values; a mismatch is logged as a provider anomaly.

```ts
ObservedSection = {
  started_at, completed_at, actual_duration_minutes,
  objectives_attempted: Array<{
    objective_id, code, title,
    attempts: number,
    correct: number, partially_correct: number, incorrect: number,
    success_rate: number,
    evidence_ids: string[]
  }>,
  skills_practised: Array<{ skill_id, name, attempt_count }>,
  vocabulary_introduced: Array<{ term, context, first_evidence_id }>,
  errors_observed: Array<{
    error_tag, human_label, count, evidence_ids: string[]
  }>,
  activities_completed: Array<{ sequence, activity_type, completed: boolean }>,
  evidence_summary: {
    total: number, by_result: Record<EvidenceResult, number>,
    by_grader: Record<GradedBy, number>
  },
  state_transitions: Array<{
    objective_id, from_status, to_status, from_confidence, to_confidence,
    transition_id, rule_version
  }>
}
```

Note `by_grader`. A parent reading a report can see at a glance how much of it
rests on a machine's judgement (D7).

### `inferred` — what it might mean

Opinions. Each carries its source, its confidence and the evidence it is reading.
Nothing here feeds the state engine or the Next Lesson Engine. Persisted
separately into `learning_inference` so it is queryable and never confused with
fact.

```ts
InferredSection = {
  statements: Array<{
    statement: string,
    about: { objective_id? , skill_id? } | null,
    basis_evidence_ids: string[],       // must be non-empty
    source: 'RULE_ENGINE' | 'AI_PROVIDER' | 'HUMAN',
    confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  }>,
  recurring_errors: Array<{
    error_tag, human_label,
    occurrences_this_lesson: number,
    occurrences_last_30_days: number,
    first_seen_at: string,
    is_recurring: boolean               // computed, not asserted by the AI
  }>,
  successful_patterns: string[],
  failed_patterns: string[],
  pronunciation_targets: Array<{        // subject-agnostic: empty for maths
    target: string, note: string, basis_evidence_ids: string[]
  }>,
  teacher_observations: string[]
}
```

`basis_evidence_ids` is required and must be non-empty. An inference with no
evidence behind it fails validation and is rejected. This is the concrete
mechanism that stops "Catarina seems tired today" from entering the record as an
observation about a child with nothing behind it.

### `recommended` — what to do next

Proposals only. Each becomes a `learning_recommendation` row with status
`PROPOSED`. Nothing in this section is applied automatically, including
`recommended_next_objective`, which the Next Lesson Engine will re-derive itself.

```ts
RecommendedSection = {
  recommended_review: Array<{ objective_id, reason, priority: 1|2|3 }>,
  recommended_next_objective: {
    objective_id, title, reason
  } | null,
  recommended_activities: Array<{ activity_type, objective_id, reason }>,
  pacing: { suggestion: 'SLOW_DOWN'|'HOLD'|'ADVANCE', reason: string } | null,
  parent_actions: Array<{ action: string, reason: string }>
}
```

The engine treating `recommended_next_objective` as advisory is deliberate: a
report is written at the end of one lesson, and the engine decides at the start
of the next, with whatever happened in between taken into account.

---

## Generation without an AI

In the MVP, `generated_by = 'SYSTEM'`. The `observed` section is computed in
full. The `inferred` section is populated by simple deterministic rules, such as
flagging an error tag that crossed the recurrence threshold. The `recommended`
section comes from the Next Lesson Engine's own rationale. The report is complete
and useful with no model involved, and Phase 12 changes only who writes the prose
in two of the three sections.

---

## Validation and persistence

- Zod-validated before insert, `.strict()`.
- Every `objective_id` must belong to the lesson's curriculum version.
- Every `evidence_id` must exist and belong to this student and this lesson.
  A report referencing evidence that does not exist is rejected outright, which
  is the check that catches a model inventing an attempt.
- Reports are immutable. Regeneration inserts a new row; the previous one is
  retained and viewable.
