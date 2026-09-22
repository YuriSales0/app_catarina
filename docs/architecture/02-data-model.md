# 02 — Data model: entities, relationships, indexes

Conventions used throughout:

- Primary keys are UUID v7 (`uuid` column type), generated in the application so
  a write knows its own ID before the transaction commits. V7 is time-ordered,
  which keeps index locality good without leaking a sequential count.
- All timestamps are `timestamptz`, stored UTC (see D12).
- `metadata` columns are `jsonb NOT NULL DEFAULT '{}'`. They are for provenance
  and extension, never for anything the engine reads to make a decision.
- Enums are Postgres native enum types, mirrored by Zod enums and Drizzle
  `pgEnum`, with one definition module as the single source.
- Every table with a `deleted_at` is soft-deletable; the ledger tables have none.
- `is_demo boolean NOT NULL DEFAULT false` appears on every seedable table so
  demo data can be identified, filtered and deleted wholesale (section 32).

---

## Layer map

```
IDENTITY            users · accounts · sessions · verification_tokens
      │
AUTHORIZATION       student_guardians ──────────────┐
      │                                             │
SUBJECT             students · subjects · skills · student_subjects
      │
CURRICULUM          curricula · curriculum_versions · curriculum_units
                    learning_objectives · objective_prerequisites
                    objective_skills
      │
DERIVED STATE       student_objective_state  ← computed
                    student_objective_state_transition  (append-only)
                    student_objective_review  ← computed
      │
LEDGER              learning_evidence  (append-only)
                    lesson_events      (append-only)
                    audit_log          (append-only)
      │
EXECUTION           lessons · lesson_activities · lesson_reports
      │
NON-FACTUAL         learning_inference · learning_recommendation
      │
HISTORY             learning_snapshots (immutable)
```

---

## 1. Identity

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | Immutable. The only identity key in the system. |
| `email` | citext UNIQUE | Contact and login attribute. Mutable. Never a key. |
| `email_verified_at` | timestamptz null | |
| `name` | text null | |
| `platform_role` | enum `platform_role` | `USER` \| `ADMIN`, default `USER`. Grants no student access (D2). |
| `locale` | text null | BCP-47, for UI. |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz null | |

`citext` makes the uniqueness check case-insensitive, which stops
`Yuri@…` and `yuri@…` becoming two accounts pointing at one inbox.

### `accounts`, `sessions`, `verification_tokens`

Auth.js v5 standard shape, all keyed to `users.id` with
`ON DELETE CASCADE`. `accounts` is unique on `(provider, provider_account_id)`,
which is what allows Google, Apple and passwordless to attach to one unchanged
`users.id` (section 4).

**Indexes:** `users(email)` unique; `accounts(user_id)`;
`sessions(user_id)`; `sessions(expires)` for cleanup.

---

## 2. Authorization

### `student_guardians`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `student_id` | uuid FK → students | `ON DELETE CASCADE` |
| `user_id` | uuid FK → users | `ON DELETE CASCADE` |
| `role` | enum `guardian_role` | `OWNER` \| `GUARDIAN` \| `TEACHER` \| `VIEWER` |
| `invited_by_user_id` | uuid FK → users, null | For the future invite flow |
| `accepted_at` | timestamptz null | Null means a pending invitation, which grants nothing |
| `created_at` / `updated_at` | timestamptz | |
| `revoked_at` | timestamptz null | Revocation is retained, not deleted, for audit |

**Constraints.** `UNIQUE (student_id, user_id)`. A partial unique index enforces
at least one active OWNER per student:
`CREATE UNIQUE INDEX ... ON student_guardians (student_id) WHERE role = 'OWNER' AND revoked_at IS NULL`
— which also prevents the two-owner ambiguity about who may delete a child's data.

**Indexes:** `(user_id)` for "my students"; `(student_id, revoked_at)` for the
authorization check on the hot path; the partial OWNER index above.

This table is the chokepoint. Every student-scoped read and write in the system
resolves through it, and nothing else is consulted (see [03](03-authorization-and-security.md)).

---

## 3. Students and subjects

### `students`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `created_by_user_id` | uuid FK → users | Provenance only, not an access grant |
| `name` | text | Given name. No surname field: it is not needed and would be extra child PII |
| `date_of_birth` | date null | Used for age-appropriateness; nullable so a family can decline |
| `school_year` | text null | |
| `education_system` | text null | e.g. `PT-BASICO`, `UK-KS1` |
| `timezone` | text | IANA, default `Europe/Lisbon` |
| `avatar_key` | text null | An illustration choice, not an uploaded photo (see [03](03-authorization-and-security.md)) |
| `metadata` | jsonb | |
| `is_demo` | boolean | |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | |

### `subjects`

`id`, `slug` (unique, e.g. `english`, `mathematics`), `name`, `description`,
`metadata`, `is_demo`, timestamps. Global and shared. Nothing subject-specific
exists anywhere in engine code; English is data (section 6).

### `skills`

`id`, `subject_id` FK, `slug`, `name`, `description`, `metadata`, `is_demo`,
timestamps. `UNIQUE (subject_id, slug)`. Listening, Speaking and Pronunciation
are rows for the English subject; Arithmetic and Geometry are rows for
Mathematics (section 10).

### `student_subjects`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `student_id` | uuid FK | |
| `subject_id` | uuid FK | |
| `curriculum_version_id` | uuid FK null | The pinned version this child follows (D8) |
| `active` | boolean | |
| `instruction_language` | text | BCP-47 (D9) |
| `target_language` | text null | BCP-47, language subjects only (D9) |
| `target_level` | text null | e.g. `A1` |
| `goal` | text null | Free text from the parent |
| `planned_lesson_minutes` | integer | Default 20 |
| `started_at` | timestamptz | |
| `metadata` / `is_demo` / timestamps | | |

**Constraints:** `UNIQUE (student_id, subject_id)`.
**Indexes:** `(student_id, active)`, `(subject_id)`, `(curriculum_version_id)`.

---

## 4. Curriculum

The brief's three-level model is kept, with a version layer inserted between
curriculum and units so that publishing is immutable (D8).

### `curricula`

`id`, `subject_id` FK, `slug`, `name`, `description`, `source` (enum
`curriculum_source`: `OFFICIAL` \| `SCHOOL` \| `FAMILY` \| `TEACHER` \|
`TEXTBOOK` \| `IMPORTED` \| `MARKETPLACE`), `source_url` null,
`owner_user_id` null (null means a system/shared curriculum), `visibility`
(`PRIVATE` \| `SHARED` \| `PUBLIC`), `metadata`, `is_demo`, timestamps.

`owner_user_id` and `visibility` are what make a family-authored curriculum
possible without leaking it, and what a marketplace would later build on
(section 25).

### `curriculum_versions`

`id`, `curriculum_id` FK, `version` (text, e.g. `1.0.0`), `status`
(`DRAFT` \| `PUBLISHED` \| `ARCHIVED`), `published_at` null,
`published_by_user_id` null, `provenance` jsonb, `notes`, timestamps.

`UNIQUE (curriculum_id, version)`. Publishing flips status and thereafter a
trigger blocks changes to this version's units and objectives. `provenance`
records where the content came from: the textbook and page range, the URL and
retrieval date, the import job ID. Section 25 requires that the system always
know where an objective came from, and this is where that lives.

### `curriculum_units`

`id`, `curriculum_version_id` FK, `parent_unit_id` FK null (self-referencing,
for nesting), `unit_key` (stable across versions), `lineage_id` uuid, `name`,
`description`, `sequence` integer, `metadata`, timestamps.

`UNIQUE (curriculum_version_id, unit_key)`,
`UNIQUE (curriculum_version_id, parent_unit_id, sequence)`.
A `CHECK` plus an application-level cycle test prevents a unit being its own
ancestor.

### `learning_objectives`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | What evidence and state actually reference |
| `curriculum_version_id` | uuid FK | Denormalized from the unit for cheap version filtering |
| `curriculum_unit_id` | uuid FK | |
| `objective_key` | text | Stable across versions, e.g. `EN.A1.NEG.HAVE` |
| `lineage_id` | uuid | Shared by every version of this objective (D8) |
| `code` | text | Human-facing code |
| `title` | text | |
| `description` | text | |
| `sequence` | integer | Order within the unit |
| `difficulty` | smallint | 1–5, `CHECK (difficulty BETWEEN 1 AND 5)` |
| `estimated_sessions` | smallint null | Planning hint |
| `assessment_policy` | jsonb | Per-objective overrides of the state policy, null-able (D6) |
| `metadata` | jsonb | |
| timestamps | | |

`UNIQUE (curriculum_version_id, objective_key)`,
`UNIQUE (curriculum_unit_id, sequence)`.

### `objective_prerequisites`

`objective_id` FK, `prerequisite_objective_id` FK, `required_status` (enum
`objective_status`, default `PROFICIENT`), `strength` (`HARD` \| `SOFT`),
`created_at`. Composite PK on the two IDs.
`CHECK (objective_id <> prerequisite_objective_id)`.

Two additions to the brief's two-column design, both earning their place:

- `required_status` lets a curriculum say that addition needs numbers only
  *PROFICIENT*, not *MASTERED*. Without it the graph has one hard-coded
  threshold and curriculum authors cannot express normal pedagogy.
- `strength` separates a true gate (`HARD`, blocks selection) from a preference
  (`SOFT`, lowers priority but does not lock). The brief's rule that unmet
  prerequisites must never be selected applies to `HARD`, which is the default.

Cycle prevention is a recursive CTE check at write time, plus a test over every
seeded curriculum. A cycle would deadlock the Next Lesson Engine into having
nothing available, so it is checked on insert rather than discovered later.

**Indexes:** `(objective_id)`, `(prerequisite_objective_id)`.

### `objective_skills`

`objective_id` FK, `skill_id` FK, `weight` smallint. Composite PK. This is what
lets the system report progress by skill (Speaking, Grammar) as well as by
objective, which is what section 17's snapshot and the parent dashboard need.

---

## 5. Derived state

### `student_objective_state`

Computed only (D5). Never written by hand.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `student_id` | uuid FK | |
| `objective_id` | uuid FK | |
| `objective_lineage_id` | uuid | Denormalized, so progress survives a version change (D8) |
| `subject_id` | uuid FK | Denormalized for query and future RLS (D13) |
| `status` | enum `objective_status` | `NOT_STARTED` … `MASTERED` |
| `confidence` | enum `confidence_level` | `LOW` \| `MEDIUM` \| `HIGH` |
| `assessed_attempts` | integer | Inputs to the decision, stored so the UI need not recompute |
| `success_rate_recent` | numeric(4,3) null | Over the last 10 assessed attempts |
| `distinct_lesson_count` | integer | |
| `has_human_or_system_graded_evidence` | boolean | Gate for MASTERED (D7) |
| `first_seen_at` | timestamptz null | |
| `last_assessed_at` | timestamptz null | |
| `proficient_since` | timestamptz null | The clock the retention check runs against |
| `rule_version` | text | Which policy decided this |
| `decided_by_evidence_ids` | uuid[] | The exact rows behind the claim |
| `computed_at` | timestamptz | |
| `updated_at` | timestamptz | |

`UNIQUE (student_id, objective_id)`.

**Indexes:** `(student_id, subject_id, status)` for the dashboard;
`(student_id, objective_lineage_id)`; `(objective_id)`.

### `student_objective_state_transition`

Append-only. `id`, `student_id`, `objective_id`, `from_status`, `to_status`,
`from_confidence`, `to_confidence`, `rule_version`, `triggered_by_evidence_id`
FK null, `decided_by_evidence_ids` uuid[], `rationale` jsonb, `created_at`.

This is the answer to section 30. "Why is subtraction PROFICIENT?" is a single
query against this table joined to the evidence rows it names, and it returns
the transition, the date, the rule version and the attempts. No narrative
generation is involved, which is what the brief means by never answering with
unsupported AI reasoning.

**Indexes:** `(student_id, objective_id, created_at DESC)`, `(created_at)`.

### `student_objective_review`

The spaced-repetition surface (section 18). Computed alongside state.

`id`, `student_id`, `objective_id`, `subject_id`, `introduced_at`,
`last_practised_at`, `last_success_at`, `review_count`, `failure_count`,
`interval_days`, `ease` numeric null, `next_review_at`, `scheduler_version`,
`updated_at`. `UNIQUE (student_id, objective_id)`.

MVP scheduler: fixed expanding intervals of 1, 3, 7, 14, 30 and 60 days,
advancing on success and stepping back two positions on failure. `ease` and
`scheduler_version` exist so SM-2 or FSRS can be dropped in later without a
migration, which is exactly the "prepare the schema, do not over-build the
algorithm" instruction.

**Indexes:** `(student_id, next_review_at)` — the single most important index for
the Next Lesson Engine; `(next_review_at)` for any future batch job.

---

## 6. The ledger

### `learning_evidence`

Append-only, physically enforced (D3). No `updated_at`, no `deleted_at`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `student_id` | uuid FK | |
| `subject_id` | uuid FK | Denormalized |
| `lesson_id` | uuid FK null | |
| `activity_id` | uuid FK null | |
| `objective_id` | uuid FK | |
| `objective_lineage_id` | uuid | |
| `skill_id` | uuid FK null | |
| `attempt_number` | integer | |
| `prompt` | text | What the student was actually asked |
| `student_response` | text null | |
| `expected_response` | text null | |
| `result` | enum `evidence_result` | `CORRECT` \| `PARTIALLY_CORRECT` \| `INCORRECT` \| `NOT_ASSESSED` |
| `correction` | text null | |
| `evidence_type` | enum `evidence_type` | `PRACTICE` \| `ASSESSMENT` \| `OBSERVATION` \| `SELF_REPORT` \| `PARENT_REPORT` \| `CORRECTION` \| `RETRACTION` |
| `confidence` | enum `confidence_level` | How much the grader trusts this single datum |
| `graded_by` | enum `graded_by` | `SYSTEM` \| `HUMAN` \| `AI_PROVIDER` (D7) |
| `grader_ref` | jsonb | Provider, model, prompt-template version, or the grading user ID |
| `supersedes_evidence_id` | uuid FK null | Set on `CORRECTION` / `RETRACTION` |
| `error_tags` | text[] | Normalized error codes, the input to recurring-error detection |
| `metadata` | jsonb | |
| `occurred_at` | timestamptz | When the attempt happened |
| `created_at` | timestamptz | When it was recorded |

**Constraints.**
`UNIQUE (student_id, objective_id, lesson_id, activity_id, attempt_number)` so a
retried network call cannot double-count an attempt.
`CHECK (evidence_type NOT IN ('CORRECTION','RETRACTION') OR supersedes_evidence_id IS NOT NULL)`.
Trigger `evidence_is_append_only` raises on UPDATE or DELETE, and the application
role holds only `SELECT, INSERT`.

**Indexes:** `(student_id, objective_id, occurred_at DESC)` — the state engine's
read; `(student_id, subject_id, created_at DESC)` — recent activity;
`(lesson_id)`; `(supersedes_evidence_id)`; GIN on `error_tags` for recurring-error
queries.

`occurred_at` separate from `created_at` matters more than it looks: a parent
entering Saturday's paper exercises on Monday must not have them treated as
Monday's retention evidence.

### `lesson_events`

Append-only (section 15). `id`, `lesson_id` FK, `student_id` (denormalized),
`activity_id` FK null, `event_type` enum (`LESSON_STARTED`, `ACTIVITY_STARTED`,
`PROMPT_SHOWN`, `STUDENT_RESPONSE`, `CORRECTION`, `ACTIVITY_COMPLETED`,
`ASSESSMENT_RESULT`, `TEACHER_NOTE`, `LESSON_PAUSED`, `LESSON_COMPLETED`,
`LESSON_CANCELLED`, `AI_PROPOSAL_RECEIVED`, `AI_PROPOSAL_REJECTED`),
`sequence` bigint, `payload` jsonb, `occurred_at`, `created_at`.

`UNIQUE (lesson_id, sequence)`. Same append-only enforcement as evidence.
**Indexes:** `(lesson_id, sequence)`, `(student_id, occurred_at DESC)`,
`(event_type)`.

The two AI event types are there so that a rejected model proposal is still part
of the permanent record. When a model tries to assert something the system
refuses, we want that visible rather than silently dropped.

### `audit_log`

Append-only, security-facing rather than learning-facing. `id`, `actor_user_id`
null, `actor_type` (`USER` \| `SYSTEM` \| `AI_PROVIDER`), `action`,
`resource_type`, `resource_id`, `student_id` null, `result`
(`ALLOWED` \| `DENIED`), `reason`, `ip_hash`, `user_agent`, `metadata`,
`created_at`. **Indexes:** `(student_id, created_at DESC)`,
`(actor_user_id, created_at DESC)`, `(result) WHERE result = 'DENIED'`.

Denied authorization attempts are logged deliberately: for a product holding
children's data, a pattern of denials is the signal you most want to be able to
find.

---

## 7. Lesson execution

### `lessons`

`id`, `student_id` FK, `subject_id` FK, `curriculum_version_id` FK,
`primary_objective_id` FK, `lesson_number` integer, `planned_duration_minutes`,
`actual_duration_minutes` null, `status` enum (`PLANNED` \| `IN_PROGRESS` \|
`COMPLETED` \| `CANCELLED`), `plan_payload` jsonb (the NextLessonPlan that
produced it, frozen), `plan_engine_version`, `idempotency_key` null,
`created_by_user_id`, `metadata`, `is_demo`, `created_at`, `started_at` null,
`completed_at` null.

`UNIQUE (student_id, subject_id, lesson_number)` (D11);
`UNIQUE (student_id, idempotency_key)` where not null.
**Indexes:** `(student_id, subject_id, created_at DESC)`, `(status)`,
`(primary_objective_id)`.

Freezing `plan_payload` means a lesson can always be explained by the plan that
created it, even after the curriculum has moved on.

### `lesson_activities`

`id`, `lesson_id` FK, `student_id` (denormalized), `sequence` smallint,
`activity_type` enum (`REVIEW` \| `EXPLANATION` \| `PRACTICE` \| `GAME` \|
`CONVERSATION` \| `ASSESSMENT` \| `REFLECTION`), `objective_id` FK null,
`skill_id` FK null, `instructions` text, `expected_evidence_count` smallint null,
`metadata` jsonb, `created_at`.

`UNIQUE (lesson_id, sequence)`. **Indexes:** `(lesson_id, sequence)`,
`(objective_id)`.

### `lesson_reports`

One per completed lesson. `id`, `lesson_id` FK unique, `student_id`,
`schema_version`, `payload` jsonb (structure in [07](07-lesson-report.md)),
`generated_by` (`SYSTEM` \| `AI_PROVIDER` \| `HUMAN`), `generator_ref` jsonb,
`generated_at`. Immutable; a regenerated report is a new row and the newest wins
for display, with the older retained.

---

## 8. Non-factual records

### `learning_inference`

`id`, `student_id`, `subject_id`, `objective_id` null, `skill_id` null,
`lesson_id` null, `statement` text, `basis_evidence_ids` uuid[],
`source` (`RULE_ENGINE` \| `AI_PROVIDER` \| `HUMAN`), `source_ref` jsonb,
`confidence` enum, `created_at`. Append-only.

Never read by the state engine or the Next Lesson Engine. Displayed to parents
under an explicit "what this might mean" framing, never as a finding.

### `learning_recommendation`

`id`, `student_id`, `subject_id`, `kind` (`REVIEW` \| `NEXT_OBJECTIVE` \|
`ACTIVITY` \| `PACING` \| `PARENT_ACTION`), `objective_id` null,
`statement` text, `rationale` jsonb, `source` (`NEXT_LESSON_ENGINE` \|
`AI_PROVIDER` \| `HUMAN`), `source_ref` jsonb, `status` (`PROPOSED` \|
`ACCEPTED` \| `REJECTED` \| `EXPIRED`), `decided_by_user_id` null,
`decided_at` null, `created_at`.

Status is the only mutable field in either table. Recording acceptance and
rejection is what will eventually let us ask whether the engine's advice
correlates with real progress, which is the success metric section 31 asks for.

---

## 9. History

### `learning_snapshots`

`id`, `student_id`, `snapshot_version` integer (per student, monotonic),
`schema_version` text, `scope` (`STUDENT` \| `SUBJECT`), `subject_id` null,
`generated_from` jsonb, `state_payload` jsonb, `content_hash` text,
`created_at`.

`UNIQUE (student_id, snapshot_version)`. Immutable; same append-only trigger.
**Indexes:** `(student_id, created_at DESC)`.

`generated_from` records the exact inputs: rule version, engine version, the
maximum evidence `created_at` included, and the lesson IDs summarized.
`content_hash` makes regeneration verifiable — regenerating snapshot 42 from the
same inputs must produce the same hash, which is how we prove snapshots are
reproducible rather than merely stored. Details in [08](08-learning-snapshot.md).

---

## 10. Index summary

Section 28 asks for indexes on specific columns. Consolidated, plus the
composites that the actual query patterns need:

| Table | Index | Serves |
| --- | --- | --- |
| `users` | `(email)` unique | Login |
| `student_guardians` | `(user_id)` | "My students" |
| `student_guardians` | `(student_id, revoked_at)` | Every authorization check |
| `student_guardians` | partial unique `(student_id) WHERE role='OWNER'` | One owner invariant |
| `student_subjects` | `(student_id, active)` | Dashboard |
| `learning_objectives` | `(curriculum_version_id, objective_key)` unique | Version mapping |
| `learning_objectives` | `(curriculum_unit_id, sequence)` unique | Curriculum ordering |
| `objective_prerequisites` | `(objective_id)`, `(prerequisite_objective_id)` | Graph traversal both ways |
| `student_objective_state` | `(student_id, subject_id, status)` | Engine and dashboard |
| `student_objective_state` | `(student_id, objective_id)` unique | Upsert |
| `student_objective_review` | `(student_id, next_review_at)` | Due-review scan |
| `learning_evidence` | `(student_id, objective_id, occurred_at DESC)` | State computation |
| `learning_evidence` | `(student_id, subject_id, created_at DESC)` | Recent evidence |
| `learning_evidence` | GIN `(error_tags)` | Recurring errors |
| `lessons` | `(student_id, subject_id, created_at DESC)` | Lesson history |
| `lessons` | `(student_id, subject_id, lesson_number)` unique | Numbering |
| `lesson_events` | `(lesson_id, sequence)` unique | Replay |
| `learning_snapshots` | `(student_id, created_at DESC)` | Timeline |
| `audit_log` | `(student_id, created_at DESC)`, partial on `DENIED` | Investigation |

Every foreign key gets an index, since Postgres does not create one
automatically and an unindexed FK turns a parent delete into a sequential scan.

---

## 11. Enum catalogue

One module defines these once; Drizzle and Zod both derive from it, so a new
value cannot be added to the database and forgotten in validation.

```
platform_role      USER | ADMIN
guardian_role      OWNER | GUARDIAN | TEACHER | VIEWER
curriculum_source  OFFICIAL | SCHOOL | FAMILY | TEACHER | TEXTBOOK | IMPORTED | MARKETPLACE
curriculum_status  DRAFT | PUBLISHED | ARCHIVED
visibility         PRIVATE | SHARED | PUBLIC
objective_status   NOT_STARTED | INTRODUCED | PRACTISING | DEVELOPING | PROFICIENT | MASTERED
confidence_level   LOW | MEDIUM | HIGH
prerequisite_strength HARD | SOFT
evidence_result    CORRECT | PARTIALLY_CORRECT | INCORRECT | NOT_ASSESSED
evidence_type      PRACTICE | ASSESSMENT | OBSERVATION | SELF_REPORT | PARENT_REPORT | CORRECTION | RETRACTION
graded_by          SYSTEM | HUMAN | AI_PROVIDER
lesson_status      PLANNED | IN_PROGRESS | COMPLETED | CANCELLED
activity_type      REVIEW | EXPLANATION | PRACTICE | GAME | CONVERSATION | ASSESSMENT | REFLECTION
lesson_event_type  (listed in §6)
inference_source   RULE_ENGINE | AI_PROVIDER | HUMAN
recommendation_kind REVIEW | NEXT_OBJECTIVE | ACTIVITY | PACING | PARENT_ACTION
recommendation_status PROPOSED | ACCEPTED | REJECTED | EXPIRED
actor_type         USER | SYSTEM | AI_PROVIDER
```
