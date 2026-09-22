# Learning OS — Architecture Proposal

**Version 0.1 · Phase 0 deliverable · Status: awaiting review and approval**

This proposal answers the fourteen items required by section 41 of the product
brief before any implementation begins. Nothing here has been built yet.

## Documents

| # | Document | Brief item |
| --- | --- | --- |
| 01 | [Ambiguities and decisions](01-ambiguities-and-decisions.md) | 41.1 |
| 02 | [Data model: entities, relationships, indexes](02-data-model.md) | 41.2, 41.3, 41.4 |
| 03 | [Authorization, security and privacy](03-authorization-and-security.md) | 41.5, 41.11 |
| 04 | [Migration structure](04-migrations.md) | 41.6 |
| 05 | [Next Lesson Engine](05-next-lesson-engine.md) | 41.7 |
| 06 | [Context Pack schema](06-context-pack.md) | 41.8 |
| 07 | [Lesson Report schema](07-lesson-report.md) | 41.9 |
| 08 | [Learning Snapshot schema](08-learning-snapshot.md) | 41.10 |
| 09 | [Hallucination sources and controls](09-hallucination-controls.md) | 41.13, 41.14 |
| 10 | [Missing product requirements](10-missing-requirements.md) | 41.12 |
| 11 | [Phase plan, project structure, testing](11-phase-plan.md) | 40, 33, 36 |
| 12 | [Scope review](12-scope-review.md) | Milestones, in/out of scope, corrections to 01 to 11 |

## The one-paragraph version

Five deterministic layers own truth, and the AI sits outside all of them.
**Curriculum** declares what may be learned and in what order. **Evidence** is an
append-only ledger of what a student actually did, and nothing else is ever
allowed to become evidence. **Learning state** is not written by anyone; it is a
pure function of evidence plus a versioned rule set, recomputed on every write
and audited on every transition. The **Next Lesson Engine** is a pure function of
curriculum, prerequisites, state and review schedule, so the same inputs always
produce the same lesson target and a machine-readable reason. The **Context
Pack** is a narrow, versioned, Zod-validated projection of exactly what one
lesson needs. The AI receives a Context Pack and returns proposals; proposals
enter the system only through the same validated write paths a human would use,
and no AI output can set a learning state directly.

## The five invariants

Everything in this proposal exists to hold these. They are stated here so any
future change can be checked against them.

1. **Identity is immutable.** Authorization is resolved from `users.id`, a UUID.
   Email is a mutable contact and login attribute and is never a key, never a
   join column, and never an authorization input.
2. **Evidence is append-only.** No row in the evidence ledger is ever updated or
   deleted. Corrections and retractions are new rows that reference the old one.
   This is enforced by database privileges and triggers, not by convention.
3. **State is derived, never asserted.** `student_objective_state` is a
   materialized view of the evidence ledger under a versioned rule set. It can be
   dropped and rebuilt from the ledger at any time and must come back identical.
4. **Observed, inferred and recommended never share a table.** An observation is
   a fact about what happened. An inference is a model's opinion. A
   recommendation is a proposed action. Each has its own storage, its own
   lifecycle, and its own display treatment.
5. **Progression is deterministic.** Objective selection uses curriculum
   sequence, the prerequisite graph, derived state and the review schedule. No
   LLM call is on that path, and no LLM output can unlock an objective whose
   prerequisites are unmet.

## What is deliberately not in the MVP

Voice, real-time audio, speech-to-text, a curriculum marketplace, payments,
mobile apps, schools, certificates and adaptive testing. Each is named in
[10-missing-requirements.md](10-missing-requirements.md) or
[11-phase-plan.md](11-phase-plan.md) with the seam that keeps it cheap to add
later. The core Learning OS runs, and is useful, with no AI API key configured.

## How to review this

The decisions that would be expensive to reverse later, and therefore deserve
the most scrutiny now, are:

- Auth.js v5 with our own canonical `users` table, rather than a hosted identity
  provider ([01, D1](01-ambiguities-and-decisions.md#d1--authentication)).
- Derived state as a rebuildable projection rather than a hand-maintained row
  ([01, D5](01-ambiguities-and-decisions.md#d5--who-writes-learning-state)).
- Curriculum versions as immutable published artifacts, with student state bound
  to objective identity across versions
  ([01, D8](01-ambiguities-and-decisions.md#d8--curriculum-versioning)).
- The mastery rule requiring spaced retention rather than a single good score
  ([05](05-next-lesson-engine.md) and [02](02-data-model.md)).
- Opaque per-pack reference handles instead of raw UUIDs in anything sent to an
  AI provider ([06](06-context-pack.md)).
