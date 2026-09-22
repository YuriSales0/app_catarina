# 11 — Phase plan, project structure and testing

## Project structure

```
/app
  (auth)/login
  (parent)/
    dashboard
    students/[studentId]
    students/[studentId]/subjects/[subjectId]
    students/[studentId]/subjects/[subjectId]/progress
    students/[studentId]/subjects/[subjectId]/next-lesson
    students/[studentId]/curriculum/[curriculumVersionId]
    lessons/[lessonId]
    lessons/[lessonId]/context
    lessons/[lessonId]/report
    snapshots/[snapshotId]
  (student)/lesson/[lessonId]          the child-facing runner, deliberately bare
  api/                                 only where a route handler is genuinely needed
/components
  ui/                                  primitives
  parent/                              analytical surfaces
  student/                             the calm, ID-free child surface
/lib
  auth/          Auth.js config, session helpers
  authorization/ requireStudentAccess, permission matrix, StudentAccess brand
  db/            client (server-only), schema/, enums, repositories
  curriculum/    version publishing, prerequisite graph, cycle checks
  learning/      evaluateObjectiveState, state policy, review scheduler
  lessons/       creation, execution, events, completion
  assessment/    grading (SYSTEM paths), error tagging
  context/       buildLessonContext
  ai/            AIProvider interface, adapters, teacher contracts. No db imports.
  audit/         audit_log writer
  env.ts         Zod-validated environment
/schemas         Zod schemas shared across layers, versioned
/types           branded IDs, shared types
/drizzle         migrations (see 04)
/scripts         migrate, seed-demo, verify-schema, rebuild-state
/tests           unit, integration, e2e
```

Rules that CI enforces rather than merely documents: business logic never lives
in a React component, `app/**` never imports `lib/db/**` directly, `lib/ai/**`
never imports `lib/db/**` or `lib/learning/**`, and anything importing the
database imports `server-only`.

---

## Milestones

The brief's twelve phases are kept with their numbering. They are grouped into
milestones so that something usable exists well before the end, and the order of
execution is stated explicitly where it differs from the numbering. The
reasoning is in [12-scope-review.md](12-scope-review.md).

| Milestone | Phases, in execution order | What becomes possible |
| --- | --- | --- |
| **M1 Foundation** | 1, 2, 3 | Deployed, secured, empty |
| **M2 First real lesson** | 4, 5, 6 | Import a curriculum, pick an unlocked objective by hand, run a lesson on paper or out loud, record evidence, see state change |
| **M3 Intelligence** | 8, 7, 9 | The engine picks and explains; snapshots accumulate; Context Packs are verified |
| **M4 Experience** | 10, 11 | Full parent dashboard and the child-facing runner |
| **M5 AI** | 12 | A text AI provider behind the seam |

Phase 8 runs before Phase 7 because the snapshot embeds the engine's review
priorities and recommendations, and a snapshot built without them would need
rebuilding.

## Phases

Each phase ends with the same gate: typecheck, lint, tests, migration
verification, and a written status report naming what was implemented, what was
skipped and what is unresolved. Nothing is skipped silently.

**Phase 1 — Initialization.** Next.js with the App Router, TypeScript strict,
Tailwind, ESLint with the boundary rules, Vitest, Playwright, Drizzle, the env
validator, CI, the `NullAIProvider`, and the observability minimum: a structured
JSON logger with a redaction allowlist, a request ID on every server action, and
a server-side error boundary. Gate: a deployed empty app on Vercel with a green
pipeline and a redacted log line per request.

**Phase 2 — Schema and migrations.** Every table from [02](02-data-model.md),
generated migrations plus the manual trigger and grant files, `verify-schema`,
and the demo seed. Gate: migrations apply to a clean database, the schema
verifier passes, and append-only tables reject updates in a test.

**Phase 3 — Authentication and authorization.** Auth.js with Google OAuth (magic
links and Apple are later providers against the same `users.id`),
`requireStudentAccess`, the permission matrix, the audit writer, and the
`authz_denied` and `auth_failure` log events. Gate: the isolation test suite —
parent A cannot reach parent B's student through any route, and unauthorized
access to an existing ID returns 404.

**Phase 4 — Students, subjects, curricula.** CRUD with authorization, the JSON
curriculum importer (used by both the demo seed and real family curricula, see
[12 §5](12-scope-review.md)), curriculum publishing and freeze, the per-subject
error-tag vocabulary, and "add a guardian by email of an existing user". Gate:
publishing freezes a version; a second parent can see the same student; the
demo and a real curriculum import through the same path.

**Phase 5 — Objective graph and knowledge state.** Prerequisite graph with cycle
detection, `evaluateObjectiveState`, the state policy, transitions, the review
scheduler. Gate: `rebuild-state` reproduces state byte-identically from the
ledger.

**Phase 6 — Evidence, lessons, lesson events.** `recordEvidence`,
`createLesson`, `startLesson`, `recordLessonEvent`, `completeLesson`,
`createLessonReport` with `generated_by = 'SYSTEM'`, `getLearningHistory`, the
manual objective picker (the parent chooses from *unlocked* objectives only;
the engine replaces this in Phase 8 and keeps it as an override), the manual
lesson runner (D10), and the minimal student subject page: objective list with
status, evidence log, and the runner. This is the end of M2. Gate: a parent can
run a lesson end to end with no AI configured, and the resulting state change is
traceable to evidence.

**Phase 7 — Learning Snapshot.** Executed after Phase 8. Generation, hashing,
the epistemic key, the timeline view, and the data export (moved here from
Phase 4 because it exports every table that now exists). Gate: regeneration is
hash-stable; export produces a complete document.

**Phase 8 — Next Lesson Engine.** The pure selector, scoring policy, rationale,
plan validation. Gate: determinism and prerequisite property tests pass.

**Phase 9 — Context Pack.** Builder, handles, strict schema, leak tests, and the
teacher contract document `teacher_contract.v1`, which needs no model to write.
Gate: no UUID and no foreign student data in any generated pack.

**Phase 10 — Parent dashboard.** Students, subjects, progress, current
objectives, recurring difficulties, recommended actions, and the "why is she
learning this?" explanation rendered from the rationale object. Gate:
accessibility audit passes; every claim on screen links to its evidence.

**Phase 11 — Lesson experience.** The child-facing runner: one large START
LESSON, one activity at a time, no IDs, no confidence scores, no dashboards.
Gate: a real lesson with a real child, which is the only test that counts here.

**Phase 12 — AI integration.** The `AIProvider` interface, one adapter, the
teacher contract, proposal validation, rejection logging. Gate: the adversarial
contract suite passes, and disabling the API key leaves the system fully
functional.

---

## The AI provider seam

Defined in Phase 1 and unused until Phase 12, so that everything before it is
built against a boundary rather than around one.

```ts
interface AIProvider {
  readonly id: string
  generateLessonActivity(pack: LessonContextPack, activity: PlannedActivity):
    Promise<Result<ActivityProposal, ProviderError>>
  evaluateResponse(pack: LessonContextPack, item: ResponseItem):
    Promise<Result<EvaluationProposal, ProviderError>>
  generateExplanation(pack: LessonContextPack, topic: ExplanationRequest):
    Promise<Result<ExplanationProposal, ProviderError>>
  generateLessonReport(pack: LessonContextPack, observed: ObservedSection):
    Promise<Result<ReportNarrativeProposal, ProviderError>>
}
```

Every return type is named `*Proposal`, which is the point: nothing a provider
returns is a fact or a write. `Result` makes provider failure an ordinary value,
so a timeout degrades the lesson rather than the record. `VoiceProvider` will be
a separate interface; voice is a transport concern and does not belong in the
same abstraction as teaching.

A `NullAIProvider` ships from Phase 1 and returns `NOT_CONFIGURED` for
everything. It is the default, which is how "the core must work without an AI
API" is kept true by construction rather than by discipline.

---

## Testing

Unit tests for pure logic (state evaluation, the engine, the review scheduler,
context building). Integration tests against a real Postgres, using a Neon branch
or a container, never mocks, since half the guarantees here are database
guarantees. End-to-end tests with Playwright for the authorization and lesson
flows.

The seven proofs required by section 36 map to named tests that CI will not let
through:

| Required proof | Test |
| --- | --- |
| 1. Parent A cannot access Parent B's student | `authorization/isolation.e2e` — every route enumerated as a non-guardian |
| 2. An objective with unmet prerequisites cannot be selected | `engine/prerequisites.property` — generated graphs and states |
| 3. AI inference cannot mark an objective MASTERED | `learning/state-from-ai-inference.spec` — inserting inferences leaves state unchanged; AI-only evidence caps below MASTERED |
| 4. Historical evidence cannot be modified | `db/evidence-append-only.spec` — UPDATE and DELETE both rejected at the database |
| 5. Student state traces back to evidence | `learning/traceability.spec` — every state row's `decided_by_evidence_ids` exists and reproduces the status |
| 6. Context Pack contains only authorized data | `context/leak.spec` — two-student fixture, no cross-references, no UUIDs |
| 7. Identity is always `user.id`, never email | `auth/identity.spec` — changing an email preserves every relationship and grants no new access |

Two further invariant tests I would add, because they guard the properties most
likely to erode over time:

- `learning/rebuild-determinism.spec` — dropping and rebuilding all derived state
  from the ledger produces identical rows.
- `arch/module-boundaries.spec` — the AI module's import graph contains no
  database or learning-engine module, and the engine's contains no AI module.
