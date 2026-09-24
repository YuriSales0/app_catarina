# Implementation status

**Branch:** `claude/amazing-bardeen-wtlj1e` · **As of:** 2026-09-24

All twelve phases of the product brief are implemented and gated. Every gate
below runs in CI (`.github/workflows/ci.yml`) against Postgres 16.

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean, module boundaries enforced |
| `pnpm test` | 133 unit and integration tests passing |
| `pnpm test:e2e` | 7 Playwright flows passing |
| `pnpm db:verify` | schema matches migrations; every FK indexed; ledger tables append-only |
| `pnpm build` | production build succeeds |

## Phases

| Phase | Milestone | What exists | Gate evidence |
| --- | --- | --- | --- |
| 1 Initialization | M1 | Next.js 16, TypeScript strict, Tailwind 4, Vitest, Playwright, Drizzle, Zod env validator, JSON logger with redaction, branded ids, ESLint module boundaries, CI | build green |
| 2 Schema | M1 | 28 tables, 3 migrations (generated + custom SQL), append-only triggers and grants, publish freeze, schema verifier | `append-only.test`, `curriculum-freeze.test` |
| 3 Auth | M1 | Auth.js v5 on our `users` table, Google OAuth + dev login, `requireStudentAccess` with branded proof, permission matrix, audit log | `authorization.test` (proofs 1, 7) |
| 4 Students and curricula | M2 | Students, guardians by email, enrolment with languages, curriculum file format + importer with lineage, Studio (paste, validate, publish), export, seed, CLI | `curriculum-import.test`, `students.test`, `parent-flows` e2e |
| 5 Knowledge state | M2 | Pure state engine with versioned policy and hysteresis, review scheduler, prerequisite unlocking by lineage, single writer, rebuild script | `state-engine.test`, `state-recompute.test` (proofs 3, 5) |
| 6 Lessons | M2 | Manual planner with prerequisite gate, activity templates, evidence with in-transaction recompute, corrections, events, SYSTEM report, runner, explanation page | `lessons.test`, `lesson-flow` e2e |
| 8 Engine | M3 | Pure deterministic selector, scoring policy, rationale, honest empty outcomes, Next lesson page | `engine.test` (proof 2, property test), `next-lesson.test` |
| 7 Snapshots | M3 | snapshot.v1 with epistemic key, canonical hash, monotonic versions, triggers at completion and pre-migration, timeline | `snapshots.test` |
| 9 Context Pack | M3 | context.v1 with opaque handles and caps, teacher contract v1, AIProvider seam, NullAIProvider, context page | `context-pack.test` (proof 6), `module-boundaries.test` |
| 10 Dashboard | M4 | Evidence-first dashboard, progress page, recommendations with outcomes | `dashboard` e2e |
| 11 Child experience | M4 | START LESSON, one activity at a time, quick marks, no ids or scores | `child-mode` e2e |
| 12 AI | M5 | OpenAI-compatible adapter, proposal application with handle resolution, consent gate, AI grading capped by policy, report narration, Studio draft generation | `openai-provider.test`, `ai-proposals.test` |

## The seven proofs required by the brief

| Proof | Test |
| --- | --- |
| Parent A cannot access Parent B's student | `tests/integration/authorization.test.ts`, `tests/e2e/parent-flows.spec.ts` |
| An objective with unmet prerequisites cannot be selected | `tests/unit/engine.test.ts` (300-trial property test), `tests/integration/lessons.test.ts` (manual path) |
| AI inference cannot mark an objective MASTERED | `tests/integration/state-recompute.test.ts`, `tests/integration/ai-proposals.test.ts` |
| Historical evidence cannot be modified | `tests/integration/append-only.test.ts` |
| Student state traces back to evidence | `tests/integration/state-recompute.test.ts` (rebuild is byte-identical; explanation view) |
| Context Pack contains only authorized data | `tests/integration/context-pack.test.ts` |
| Identity is `users.id`, never email | `tests/integration/authorization.test.ts` |

## Decisions taken autonomously

- **Curriculum content.** English Starters and English Movers follow the
  public topic, grammar and vocabulary areas of Cambridge Pre A1 Starters and
  A1 Movers. They are original content aligned to that structure, marked
  `source: FAMILY` with provenance stating the alignment; they are not official
  Cambridge material and contain no test items. 33 and 14 objectives, with
  teaching notes and a controlled error-tag vocabulary. Files in `curricula/`.
- **Sign-in.** Google OAuth is the production method; a development-only
  credentials form (`AUTH_DEV_LOGIN=true`) is refused in production by the
  environment validator.
- **State policy v1** thresholds are as proposed in decision D6, with
  hysteresis added: once PROFICIENT, an objective is held while the recent
  rate stays above 0.6 and never falls below DEVELOPING. MASTERED requires a
  retention check at least 14 days after proficiency plus a human- or
  system-graded ASSESSMENT.
- **Engine policy v1** weights are as proposed in architecture document 05,
  plus: MASTERED objectives are never the primary target, REVIEW_ONLY
  precedes CURRICULUM_COMPLETE.
- **AI processing is opt-in per student** (an `AI_PROCESSING` consent), off
  by default, owner-controlled from the student profile.
- **Local development database** is a real Postgres 16 with two roles
  (`learning_os_migrator`, `learning_os_app`) so privilege guarantees are
  exercised in tests, not emulated.
- **UX redesign (2026-09-24):** public landing page, first-steps wizard,
  child picker, one-click "today's lesson", a child lesson screen that runs
  on AI content when enabled (typed answers with an expected response are
  graded by the system, open items by the adult), "Como foi a aula" report
  and a development page. Soft palette and self-hosted Nunito/Fredoka fonts;
  stage charts use a validated one-hue ordinal ramp. Fixed on the way: AI
  activity proposals were stored as `{ proposal, packId }` but read as a bare
  proposal, so the adult lesson screen would have crashed on the first AI
  suggestion; both shapes are now read (`lib/lessons/proposal-payload.ts`).
- **Openings, conversation quality and the long view (2026-09-24):**
  - The first lesson on a curriculum version (COURSE_START) and the first
    lesson of an untouched unit (UNIT_START) begin with an ORIENTATION
    activity: how lessons work, the module's goals, and a three-item
    diagnostic before any teaching (`lib/lessons/opening.ts`, migration
    `0003`). The report turns a near-perfect or near-zero diagnostic into a
    suggestion to the family; the level never changes by itself.
  - Conversation quality per child (`students.metadata.aiQuality`,
    owner-only, audited): "Padrão" uses `OPENAI_MODEL` everywhere; "Alto"
    moves conversation, openings, open-answer grading, explanations and
    report comments to `OPENAI_MODEL_HIGH`. Checkable exercises stay on the
    economical model. Reasoning-family models get no `temperature`.
  - Context pack `context.v2` adds `long_term`, and the development page
    shows the same six-week view with its trend.
- **pnpm hoisted linker** because the isolated layout produced two copies of
  Next.js and broke the production build.

## How to run

```bash
cp .env.example .env.local            # then edit
pnpm install
pnpm db:migrate                       # generated + custom migrations
pnpm db:seed                          # catalogue curricula + DEMO parent, Catarina, Aurora
pnpm dev                              # http://localhost:3000, sign in with the dev form
pnpm check                            # typecheck + lint + test + db:verify
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e   # or without the variable where Playwright's own Chromium is installed
```

Import your own curriculum: `pnpm curriculum:import curricula/english-starters.yaml --publish`
(add `--owner you@example.com` for a private family curriculum).

## Unresolved issues and open decisions

1. **Deployed; sign-in still blocked on Google.** Vercel project `learning-os`
   (functions in `fra1`) against Neon `learning_os` in `aws-eu-central-1`.
   The production build applies migrations and loads the Starters and Movers
   catalogue (47 objectives); the runtime role cannot UPDATE the ledger
   (verified). Runbook, roles and trade-offs in `docs/DEPLOYMENT.md`.
2. **Google OAuth is not configured** (no client id/secret). The code path is
   wired; the login page shows the Google button once `AUTH_GOOGLE_ID` and
   `AUTH_GOOGLE_SECRET` are set. Until then production has no way to sign in
   (the dev login is refused in production). Steps in `docs/DEPLOYMENT.md`.
3. **The OpenAI adapter was not exercised against a live API** (no key). It is
   tested with a fake fetch for the contract, schema enforcement and every
   error path, and the proposal pipeline is tested with a scripted provider.
   First live run should use a low-cost model and `LOG_LEVEL=debug`.
4. **Mastery cannot appear in demo data** by design: the retention check needs
   14 days between proficiency and the check. It will appear naturally in real
   use, and `tests/unit/state-engine.test.ts` proves the path.
5. **Voice, speech-to-text and text-to-speech** are out of scope per the brief.
   `VoiceProvider` remains a separate future interface; lesson events already
   carry the transcript shape.
6. **Hard-delete purge** is soft delete only. `students.deleted_at` hides the
   child immediately; a purge script for the 30-day grace period is not yet
   written.
7. **Curriculum version migration** takes a PRE_MIGRATION snapshot and carries
   state by lineage, but there is no mapping-report screen listing carried,
   dropped and new objectives; the importer's result object has that data.
8. **Policy numbers need pedagogical review** (state thresholds, retention
   window, engine weights). They are versioned; a change is a new version and
   recorded state keeps the version it was decided under until rebuilt.
9. **TEACHER and VIEWER roles** exist in the enum and permission matrix with no
   dedicated screens. Postgres RLS is deferred; every student-scoped table
   already carries `student_id`.
10. **UI language is pt-BR** since the UX redesign (see `docs/ux/UX-PLAN.md`).
    Shared copy and the family-friendly labels for every enum live in
    `lib/copy/pt.ts`. The database keeps English enums. Engine and report
    texts written before the switch stay in English in stored rows; the
    Context Pack sent to a model stays in English on purpose. The technical
    screens (Curriculum Studio, Context Pack) have Portuguese titles and
    English technical content.
11. **E2E in this sandbox** needs `PW_CHROMIUM_PATH` because the preinstalled
    Chromium differs from the Playwright version's expected build. CI installs
    Playwright's own Chromium and does not need it.
