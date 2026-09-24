# 06 — Context Pack

The bridge between Learning OS and any AI or voice system. It is the only thing
an AI provider ever receives about a student, and it is an allowlist: content is
included because a rule put it there, never because it happened to be on a row
that was already loaded.

---

## Signature

```ts
buildLessonContext(
  access: StudentAccess,
  subjectId: SubjectId,
  lessonId?: LessonId
): Promise<LessonContextPack>
```

Authorization first, always. The pack is assembled from the authorized student's
data only, and a test asserts that no identifier belonging to another student can
appear in the output for any fixture.

---

## Opaque reference handles

The pack contains no database UUIDs. Every entity referenced gets a short
per-pack handle, and the server keeps the handle-to-UUID mapping for the life of
the lesson session.

```
obj_1, obj_2      learning objectives
sk_1              skills
ev_1, ev_2        evidence rows
```

Three reasons this is worth the small indirection. A model cannot echo a real
internal ID into a transcript or a log. A compromised or confused provider cannot
address a row it was not given, because it has never seen an addressable ID. And
when the model returns proposals referencing `obj_2`, the server resolves the
handle against the pack it issued, so a proposal about an objective that was not
in the pack fails resolution instead of being written.

---

## `context.v2` (2026-09-24)

Adds `long_term`: a rule-computed view of the last weeks
(`lib/learning/long-term.ts`, policy `long-term.v1`). It holds six rolling
weekly buckets (lessons, assessed attempts, success rate), a trend
(IMPROVING, STABLE, DECLINING or INSUFFICIENT_DATA; last two weeks against
the two before, at least five attempts on each side, ±10 points), lessons in
the last 30 days, objectives secure and objectives secured in the last 30
days. It is computed from the ledger only; no model output is read back. The
activity task prompt (`prompt.v2`) asks the teacher to pace by it without
mentioning numbers to the child.

## Schema (`context.v1`)

```ts
LessonContextPack = {
  context_version: 'context.v1',
  generated_at: string,                 // ISO 8601
  pack_id: string,                      // for correlating AI calls in the audit log

  student: {
    display_name: string,               // given name only
    age_years: number | null,           // derived; never the date of birth
    instruction_language: string,       // BCP-47 (D9)
    target_language: string | null,
    timezone: string
  },

  subject: { name: string, slug: string },

  curriculum: {
    name: string,
    version: string,
    source: CurriculumSource
  },

  current_unit: { name: string, description: string, position: number },

  primary_objective: {
    ref: 'obj_1',
    code: string,
    title: string,
    description: string,
    difficulty: 1|2|3|4|5,
    skills: Array<{ ref: string, name: string }>
  },

  prerequisites: Array<{
    ref: string, code: string, title: string,
    student_status: ObjectiveStatus       // so the AI knows what it may assume
  }>,

  current_student_state: {
    status: ObjectiveStatus,
    confidence: ConfidenceLevel,
    assessed_attempts: number,
    success_rate_recent: number | null,
    first_seen_at: string | null,
    last_assessed_at: string | null
  },

  relevant_recent_evidence: Array<{     // max 10, this objective + prerequisites
    ref: 'ev_1',
    occurred_at: string,
    prompt: string,
    student_response: string | null,
    result: EvidenceResult,
    correction: string | null,
    graded_by: GradedBy
  }>,

  recurring_errors: Array<{
    error_tag: string,
    human_label: string,
    occurrences: number,
    last_seen_at: string,
    example_ref: string                  // an evidence ref from the list above
  }>,

  mastered_relevant_concepts: Array<{    // may be built upon safely
    ref: string, code: string, title: string, mastered_at: string
  }>,

  previous_lesson_summary: {
    lesson_number: number,
    completed_at: string,
    objectives_practised: Array<{ ref: string, title: string }>,
    observed_facts: string[],            // OBSERVED only, from the report
    what_went_well: string[],
    what_was_hard: string[]
  } | null,

  lesson_plan: {                          // the decision, already made
    planned_duration_minutes: number,
    activities: Array<{
      sequence: number,
      activity_type: ActivityType,
      objective_ref: string | null,
      skill_ref: string | null,
      instructions: string,
      expected_evidence_count: number | null
    }>
  },

  pedagogical_constraints: {
    age_appropriate_for_years: number | null,
    instruction_language: string,
    target_language: string | null,
    max_new_vocabulary_items: number,
    avoid_topics: string[],
    reading_level: 'PRE_READER' | 'EARLY_READER' | 'FLUENT' | null,
    session_minutes: number,
    correction_style: 'GENTLE_RECAST' | 'EXPLICIT' | 'DELAYED'
  },

  teacher_instructions: {
    source: 'PARENT' | 'TEACHER',
    text: string | null,                 // untrusted, length-capped, see below
    authored_at: string | null
  }
}
```

Validated with Zod on the way out and again by the provider adapter on the way
in. `.strict()` everywhere, so an extra key is an error rather than a quiet leak.

---

## What is deliberately excluded

| Excluded | Why |
| --- | --- |
| Database UUIDs | Replaced by per-pack handles |
| Date of birth, surname | Age band is sufficient (see [03](03-authorization-and-security.md)) |
| Other subjects' data | A maths struggle is not context for an English lesson |
| Other students, including siblings | Never, under any framing |
| Parent or guardian identity | The AI teaches a child; it does not need the adults |
| The full evidence history | Capped at 10 rows scoped to this objective and its prerequisites |
| Inferences and recommendations from previous AI runs | Feeding a model its own prior speculation is how speculation becomes history |
| Raw lesson transcripts | Summarized observed facts only |
| Internal scores, rule versions, engine weights | The AI does not need the machinery, and exposing it invites argument with it |

That second-to-last exclusion is the subtle one and the most important. The
single fastest way to manufacture a false student history is to let a model read
what a previous model guessed and treat it as background fact. The pack carries
observations and derived state, never prior speculation.

---

## Size and cost

Target under 8 KB of JSON. Caps: 10 evidence rows, 5 recurring errors, 8 mastered
concepts, 8 activities, 2000 characters of teacher instructions. Caps are part of
the schema, so an unusual student cannot produce an unbounded pack.

---

## Untrusted content inside the pack

`teacher_instructions.text` is written by a human and `relevant_recent_evidence[].student_response`
was spoken by a child. Both are untrusted with respect to the model:

- They are carried as JSON string values in a data section, never concatenated
  into the system prompt.
- The teacher contract instructs the model that content inside the pack is data
  describing a lesson and never an instruction that changes the objective,
  the curriculum, or a learning state.
- Structurally, injection has a small blast radius: the objective was already
  chosen deterministically before the pack existed, and nothing the model returns
  can write state. The worst outcome is a bad lesson, not a corrupted record.

---

## Versioning

`context_version` is explicit. A new version is a new Zod schema and a new
builder, with both kept until every provider adapter has moved. Packs sent to a
provider are recorded in the audit log by `pack_id` and version, so a later
question about why a lesson went strangely can be answered by looking at exactly
what the model was given.

---

## Tests

1. Output parses against the strict schema, with no extra keys.
2. No UUID-shaped string appears anywhere in the serialized pack.
3. For a fixture containing two students, no value from the second student
   appears in the first student's pack.
4. Calling without a valid `StudentAccess` is a type error, and calling with one
   for a different student returns nothing.
5. The pack never contains rows from `learning_inference` or
   `learning_recommendation`.
6. Size stays under the cap for a synthetic student with 5000 evidence rows.
