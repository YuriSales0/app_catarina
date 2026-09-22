# 12 — Scope review

A critical pass over the scope as proposed in documents 01 to 11, done before
any implementation so that the cuts are cheap. It answers four questions: where
the phase plan has dependency defects, whether the MVP is the right size, what I
added beyond the brief and whether it earns its place, and what the brief
requires that the plan under-scoped.

The changes this review recommends have been applied to
[11-phase-plan.md](11-phase-plan.md) and to the affected decisions in
[01](01-ambiguities-and-decisions.md). Each is listed here so it can be rejected
individually.

---

## 1. Dependency defects in the phase order

The brief's twelve phases are kept, with their numbering, because the brief's
status reporting refers to them. Execution order is adjusted in two places.

| Defect | Consequence if built as written | Fix |
| --- | --- | --- |
| Phase 6 creates lessons that need a `primary_objective_id`, but the engine that picks one is Phase 8 | Either lessons cannot be created in Phase 6, or a throwaway picker gets written | Phase 6 ships a **manual objective picker**: the parent chooses from the set of *unlocked* objectives. The prerequisite gate from Phase 5 applies to that list. Phase 8 replaces the picker with the engine and keeps the picker as an override. Net effect: the prerequisite rule is exercised by humans before a machine relies on it |
| Phase 7's snapshot contains `recommended_next_objectives` and `review_priorities`, both produced by Phase 8 | The first snapshot is built with two sections stubbed, then rebuilt | **Phase 8 is executed before Phase 7.** Numbering is unchanged; order is. The snapshot is then complete on first build and its hash stability test is meaningful |
| Data export is in Phase 4 but exports evidence, lessons, reports and snapshots from Phases 5 to 7 | The export is rewritten in every subsequent phase | Export moves to the end of Phase 7. Soft-delete columns and the `consents` table stay in Phase 2 because they are schema |
| Phase 9's Context Pack has no consumer until Phase 12 | Nothing wrong, but it means the pack is verified only by tests for three phases | Accepted. The pack is small, and the leak tests are the point. The teacher contract document is authored alongside it in Phase 9, since it needs no model to write |

---

## 2. Is the MVP the right size?

**Finding: the plan is correct but front-loaded.** As written, the first thing a
parent can *see* arrives in Phase 10, and the first lesson a child can run
arrives in Phase 11. The first use case is teaching two specific children, and
a plan that delivers nothing usable for nine phases is a risk to the project
even if every phase is sound.

**Fix: group the phases into milestones, each ending in something usable.** The
phases and their gates are unchanged; the milestones add an earlier point of
value and make the order of execution explicit.

| Milestone | Phases, in execution order | What becomes possible |
| --- | --- | --- |
| **M1 Foundation** | 1, 2, 3 | Deployed, secured, empty. Nothing to use yet, by design |
| **M2 First real lesson** | 4, 5, 6 | A parent imports a curriculum, picks an unlocked objective, runs a lesson on paper or out loud, records what happened, and sees evidence and state change on a minimal subject page |
| **M3 Intelligence** | 8, 7, 9 | The system chooses the next objective and explains why; snapshots accumulate; Context Packs are generated and verified |
| **M4 Experience** | 10, 11 | The full parent dashboard and the child-facing runner |
| **M5 AI** | 12 | A text AI provider enriches how activities are taught, behind the seam |
| Out of scope | — | Voice, speech-to-text, text-to-speech, and everything in section 4 below |

M2 is the change that matters. It requires two small additions to Phase 4 and
Phase 6, described in section 3, and it requires a real curriculum, described
in section 5.

---

## 3. What I added beyond the brief, and whether it stays

The brief says "plan for" in several places. Planning for something is a schema
decision; building it is a feature decision. Each addition is classified.

| Addition | Brief basis | Verdict | Where |
| --- | --- | --- | --- |
| `curriculum_versions` as a table, immutable when published | Brief has a `version` field only | **Keep.** The one addition that is expensive later and cheap now (D8) | Phase 2, 4 |
| `objective_key` and `lineage_id` | None | **Keep.** Without them, longitudinal history detaches on any curriculum edit | Phase 2 |
| `consents` table | Section 27, "plan for consent" | **Schema only.** No consent UI in the MVP; the parent who creates the student is recorded as consenting | Phase 2 |
| Data export | Section 27, "plan for export" | **Keep, moved to Phase 7.** Small once every table exists, and a family product should be able to hand its data back | Phase 7 |
| Hard-delete purge job | Section 27, "plan for deletion" | **Cut from MVP.** Soft delete ships; purge is a maintained script, not a scheduled job, until there is more than one family | Post-MVP |
| `audit_log` writer | Section 27, 38 | **Keep the writer, cut the UI.** Denied access must be recorded from day one; reading it is a query for now | Phase 3 |
| `learning_inference` and `learning_recommendation` tables | Section 13 mandates the distinction | **Keep.** The recommendation accept/reject UI is a single control on the dashboard | Phase 2, 10 |
| Review scheduler with fixed intervals | Section 18, "prepare the schema" | **Keep, minimal.** Six fixed intervals, no ease factor logic; the `ease` column exists and is unused | Phase 5 |
| Controlled `error_tags` vocabulary per subject | None | **Keep.** Recurring-error detection does not function without it; it is authored with the curriculum, not built as a feature | Phase 4 |
| Opaque handles in the Context Pack | None | **Keep.** Small, and it closes a real leak path | Phase 9 |
| `epistemic_key` in snapshots | Section 13, applied to the artifact | **Keep.** A few lines | Phase 7 |
| Remediation rule after repeated failure | None | **Keep.** One scoring rule plus one recommendation kind | Phase 8 |
| `avatar_key` on students | None | **Cut.** Zero value for two children whose parent knows which is which | — |
| `TEACHER` and `VIEWER` guardian roles | Section 29, "future roles" | **Enum only.** No behaviour, no UI | Phase 2 |
| `SOFT` prerequisites and `required_status` | None | **Keep.** Two columns with defaults; the demo curriculum uses `HARD` only | Phase 2 |
| Retention check required for `MASTERED` | Section 12, 18 read together | **Keep.** This is the product promise made concrete | Phase 5 |
| Guardian invitation flow | Section 5, "multiple guardians" | **Reduced.** An OWNER may add a guardian by the email of a user who has already signed in. No invitation email, no pending state in the MVP | Phase 4 |

Two things were **missing** and are added:

- **Adding a second guardian.** The brief's own example is two parents sharing
  two children. Without any way to grant access, the second parent cannot use
  the product at all. The reduced form above costs one form and one insert.
- **A curriculum authoring path.** See section 5.

---

## 4. Explicit out-of-scope list

Everything below is named so that nobody has to guess. The seam that keeps each
cheap to add later is noted.

| Out of scope for the MVP | Seam that keeps it cheap |
| --- | --- |
| Voice lessons, speech-to-text, text-to-speech | `VoiceProvider` is a separate interface; lesson events already carry the transcript shape |
| Any AI provider before Phase 12; any AI at all in M1 to M4 | `NullAIProvider` is the default from Phase 1 |
| Curriculum Studio UI and marketplace | Curricula are JSON files imported by script; `visibility` and `owner_user_id` columns exist |
| Invitation emails, pending guardians | `accepted_at` and `invited_by_user_id` columns exist |
| Child accounts and child login | `students.user_id` can be added as one nullable column |
| Lesson calendar, scheduling, reminders, notifications | "Upcoming" means "the next plan the engine would produce" |
| Payments, subscriptions | Nothing modelled, nothing blocked |
| Schools, organizations, teacher accounts | `student_guardians` generalizes; an organization table would sit above it |
| Certificates, adaptive testing, document and textbook ingestion | Curriculum provenance fields exist for ingestion to fill later |
| Analytics beyond the audit log and structured events | Events are already structured; a sink is a later choice |
| UI translation | All copy in one module from Phase 1 |
| Hard-delete purge as a scheduled job | Soft delete plus a maintained script |
| Mobile apps | Server operations are plain functions behind server actions; a mobile client would call the same services over a route layer |
| Consent management UI, retention policy enforcement | `consents` table exists; policies are documented, not automated |

---

## 5. A real curriculum is the biggest unplanned scope

The brief asks for DEMO data and forbids presenting it as real history. The
first use case is two real children. Between those two facts there is no
curriculum for Catarina and Aurora, and nobody is assigned to write one. M2
cannot happen without it.

**Proposal.** Curricula are authored as JSON files, validated by a Zod schema,
and imported by a script. The demo seed and the real curriculum use the same
importer, so the importer is not extra scope; it *is* the seed mechanism. A
family curriculum is a file under `curricula/` with `source: FAMILY` and
`is_demo: false`, and importing it publishes version 1.0.0.

Sizing, so it is a bounded task rather than an open one:

| Curriculum | Units | Objectives | Notes |
| --- | --- | --- | --- |
| English DEMO | 3 | 12 | Marked DEMO. Exists so the dashboard has something to show and tests have a fixture |
| Mathematics DEMO | 2 | 8 | Marked DEMO. Carries the exact prerequisite chain from section 9 of the brief |
| English for Catarina and Aurora | 4 to 6 | 20 to 30 | Real. `source: FAMILY`. Authored by you, with the objective list reviewed before import. Includes the error-tag vocabulary |

**NEEDS YOUR DECISION.** Who writes the real English curriculum, and from what:
a textbook you already use, a CEFR pre-A1 outline, or a list of structures you
want the children to have. I can draft it for review, but it is your children's
syllabus and the file format is designed so you can edit it without me.

---

## 6. What the brief requires that the plan under-scoped

**Observability (section 38).** The proposal mentioned it once. The minimum,
with no third-party service:

- A structured JSON logger with a redaction allowlist. `prompt`,
  `student_response`, email and names are never logged. Phase 1.
- A request ID on every server action and route, carried into every log line.
  Phase 1.
- A server-side error boundary that logs unhandled errors with the request ID.
  Phase 1.
- Named counters emitted as log events: `lesson_started`, `lesson_completed`,
  `evidence_recorded`, `state_transition`, `authz_denied`, `auth_failure`,
  `db_error`, `ai_proposal_received`, `ai_proposal_rejected`,
  `ai_provider_error`. Each is added in the phase that introduces the event.
- Vercel's own log drain is the sink. Nothing else is added until there is a
  reason.

**Server operations (section 34).** Each of the eighteen is now assigned to a
phase:

| Phase | Operations |
| --- | --- |
| 4 | `createStudent`, `getStudent`, `updateStudent`, `createSubject`, `getSubjects`, `createCurriculum`, `getCurriculum` |
| 5 | `getStudentProgress` |
| 6 | `createLesson`, `startLesson`, `recordLessonEvent`, `recordEvidence`, `completeLesson`, `createLessonReport`, `getLearningHistory` |
| 7 | `getLearningSnapshot` |
| 8 | `getNextLesson` |
| 9 | `buildLessonContext` |

**Screens (section 35).** Each of the eleven is assigned, and the one M2 needs
early is marked:

| Phase | Screens |
| --- | --- |
| 3 | 1 Login |
| 4 | 3 Student list, 4 Student profile, 6 Curriculum page |
| 6 | 5 Student subject page, **minimal form for M2**: objective list with status, manual objective picker, evidence log, lesson runner for the parent |
| 7 | 11 Learning snapshot page |
| 8 | 8 Next lesson page, with the rationale rendered |
| 9 | 9 Lesson context page |
| 6, refined in 10 | 10 Lesson report page |
| 10 | 2 Parent dashboard, 7 Progress page, and the full version of 5 |
| 11 | The child-facing runner, which is not in the list of eleven but is section 24 |

**Sign-in (section 4).** D1 chose email magic links for the MVP. Magic links
need an email-sending service, which is exactly the kind of third-party
dependency section 38 says to avoid without reason. **Revised: Google OAuth is
the MVP sign-in method.** It needs one OAuth client and no email
infrastructure, both parents almost certainly have Google accounts, and
`users.id` is unaffected by adding magic links or Apple later. D1 and the open
questions table in 01 are updated.

**Test infrastructure (section 36).** Integration tests run against a real
Postgres in a GitHub Actions service container. Vercel previews use a Neon
branch. End-to-end tests are limited to three flows in the MVP, so the suite
stays fast enough to run on every push: login, cross-parent isolation, and a
full manual lesson.

---

## 7. Summary of changes applied

1. Milestones M1 to M5 added to the phase plan; Phase 8 executes before Phase 7.
2. Phase 4 gains the JSON curriculum importer and "add guardian by email".
3. Phase 6 gains the manual objective picker and the minimal subject page.
4. Data export moves from Phase 4 to Phase 7.
5. Observability minimum added to Phase 1 and threaded through later phases.
6. Sign-in for the MVP changes from magic link to Google OAuth.
7. `avatar_key` removed from the data model; purge job moved out of the MVP.
8. Operations and screens mapped to phases.
9. Explicit out-of-scope list recorded.
10. Real curriculum authoring identified as unassigned scope needing your
    decision.
