# 08 — Learning Snapshot schema

A snapshot is the student's learning state frozen at a point in time, so that
progress can be compared across months rather than inferred from a current view
that has already moved on. Snapshots are immutable and versioned per student.

Stored in `learning_snapshots.state_payload` with
`schema_version = 'snapshot.v1'`.

---

## Reproducibility

A snapshot is not an independent record of truth; it is a *rendering* of the
ledger at a moment. So it must be reproducible: regenerating snapshot 42 from the
same inputs must yield the same bytes.

`generated_from` captures exactly what went in:

```ts
generated_from = {
  rule_version: string,            // the state policy in force (D6)
  engine_version: string,          // the Next Lesson Engine version
  snapshot_generator_version: string,
  evidence_watermark: string,      // max learning_evidence.created_at included
  evidence_count: number,
  lesson_ids: string[],            // lessons summarized
  trigger: 'LESSON_COMPLETED' | 'SCHEDULED' | 'MANUAL' | 'PRE_MIGRATION'
}
```

`content_hash` is a SHA-256 of the canonical JSON of `state_payload`. A CI test
regenerates a fixture snapshot and asserts the hash is unchanged, which catches
accidental non-determinism such as a map iteration order or an embedded
timestamp. The `PRE_MIGRATION` trigger exists so that moving a student to a new
curriculum version always takes a snapshot first, making the move reversible in
evidence terms.

---

## Payload

```ts
SnapshotPayload = {
  schema_version: 'snapshot.v1',
  snapshot_version: number,              // per student, monotonic
  student: {
    display_name: string,
    age_years: number | null,
    school_year: string | null
  },
  generated_at: string,

  subjects: Array<{
    subject: { id, name, slug },
    active: boolean,
    curriculum: { name, version, source },
    instruction_language: string,
    target_language: string | null,

    progress: {
      objectives_total: number,
      by_status: Record<ObjectiveStatus, number>,
      mastered_percent: number,          // one number among many, never the headline
      units_completed: number,
      units_total: number
    },

    current_objectives: Array<{
      objective_id, code, title,
      status, confidence,
      assessed_attempts: number,
      success_rate_recent: number | null,
      last_assessed_at: string | null,
      proficient_since: string | null
    }>,

    objective_states: Array<{            // full state, the comparable baseline
      objective_id, lineage_id, code, status, confidence, last_assessed_at
    }>,

    skill_states: Array<{
      skill_id, name,
      attempts_30d: number,
      success_rate_30d: number | null,
      trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA'
    }>,

    recurring_difficulties: Array<{      // INFERRED, labelled as such
      error_tag, human_label,
      occurrences_30d: number,
      affected_objective_ids: string[],
      first_seen_at: string,
      trend: 'IMPROVING' | 'PERSISTENT' | 'WORSENING'
    }>,

    recent_evidence_summary: {
      window_days: 30,
      total_attempts: number,
      by_result: Record<EvidenceResult, number>,
      by_grader: Record<GradedBy, number>,
      distinct_objectives: number
    },

    recent_lessons: Array<{
      lesson_id, lesson_number, completed_at,
      primary_objective: { id, title },
      attempts: number, success_rate: number
    }>,

    review_priorities: Array<{           // OBSERVED schedule, deterministic
      objective_id, code, title,
      next_review_at: string, days_overdue: number, interval_days: number
    }>,

    recommended_next_objectives: Array<{ // RECOMMENDED, labelled as such
      objective_id, code, title, reason: string
    }>
  }>,

  epistemic_key: {
    observed: string[],      // which payload paths are observed fact
    inferred: string[],      // which are inference
    recommended: string[]    // which are proposals
  }
}
```

---

## The epistemic key

`epistemic_key` is unusual and I think necessary. A snapshot is the artifact most
likely to be read out of context: exported, emailed to a teacher, fed to a future
model, compared against a snapshot from a year earlier. Without something inside
the document saying which parts are measurement and which are opinion, the
distinction the whole architecture maintains is lost at the moment the document
leaves the system.

So the payload names its own paths:

```
observed:    subjects[].progress, subjects[].objective_states,
             subjects[].recent_evidence_summary, subjects[].recent_lessons,
             subjects[].review_priorities
inferred:    subjects[].recurring_difficulties, subjects[].skill_states[].trend
recommended: subjects[].recommended_next_objectives
```

Anything consuming a snapshot, including the parent UI and any future AI, can
honour that key mechanically.

---

## Generation

- **Trigger.** After every lesson completion, plus on demand, plus before any
  curriculum version migration.
- **Scope.** `STUDENT` covers every active subject; `SUBJECT` covers one. Both
  are supported so a single-subject report does not require the whole picture.
- **Cost.** Snapshots are small and cheap. Keeping every one is the point:
  comparing snapshot 12 to snapshot 42 is the longitudinal claim the product
  makes, and a system that overwrote them would have nothing to compare.
- **Immutability.** Same append-only enforcement as the ledger. A correction
  means generating a new snapshot, never editing an old one, because an old
  snapshot is a record of what was believed then, and that is exactly its value.

---

## Tests

1. Regenerating a fixture snapshot produces an identical `content_hash`.
2. Every path named in `epistemic_key.observed` traces to evidence or derived
   state; no path under `inferred` appears under `observed`.
3. A snapshot for student A contains no reference to student B.
4. `UPDATE` and `DELETE` against `learning_snapshots` are rejected by the
   database.
5. `snapshot_version` increments monotonically per student under concurrent
   generation.
