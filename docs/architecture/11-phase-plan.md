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

## Phases

Each phase ends with the same gate: typecheck, lint, tests, migration
verification, and a written status report naming what was implemented, what was
skipped and what is unresolved. Nothing is skipped silently.

**Phase 1 — Initialization.** Next.js with the App Router, TypeScript strict,
Tailwind, ESLint with the boundary rules, Vitest, Playwright, Drizzle, the env
validator, CI. Gate: a deployed empty app on Vercel with a green pipeline.

**Phase 2 — Schema and migrations.** Every table from [02](02-data-model.md),
generated migrations plus the manual trigger and grant files, `verify-schema`,
and the demo seed. Gate: migrations apply to a clean database, the schema
verifier passes, and append-only tables reject updates in a test.

**Phase 3 — Authentication and authorization.** Auth.js with magic links,
`requireStudentAccess`, the permission matrix, the audit writer. Gate: the
isolation test suite — parent A cannot reach parent B's student through any
route, and unauthorized access to an existing ID returns 404.

**Phase 4 — Students, subjects, curricula.** CRUD with authorization, curriculum
publishing and freeze, data export. Gate: publishing freezes a version;
export produces a complete document.

**Phase 5 — Objective graph and knowledge state.** Prerequisite graph with cycle
detection, `evaluateObjectiveState`, the state policy, transitions, the review
scheduler. Gate: `rebuild-state` reproduces state byte-identically from the
ledger.

**Phase 6 — Evidence, lessons, lesson events.** `recordEvidence`,
`createLesson`, `startLesson`, `recordLessonEvent`, `completeLesson`, and the
manual lesson runner (D10). Gate: a parent can run a lesson end to end with no AI
configured, and the resulting state change is traceable to evidence.

**Phase 7 — Learning Snapshot.** Generation, hashing, the epistemic key, the
timeline view. Gate: regeneration is hash-stable.

**Phase 8 — Next Lesson Engine.** The pure selector, scoring policy, rationale,
plan validation. Gate: determinism and prerequisite property tests pass.

**Phase 9 — Context Pack.** Builder, handles, strict schema, leak tests. Gate: no
UUID and no foreign student data in any generated pack.

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
