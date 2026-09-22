# 01 — Architectural ambiguities and proposed decisions

The brief is unusually precise, but a specification of this size always leaves
choices that only show up when the schema is written. Each ambiguity below is
stated, then resolved with a proposed decision and the reasoning. Anything marked
**NEEDS YOUR DECISION** changes the product, not just the code, and I would
rather you settle it than have me assume.

---

## D1 — Authentication

**Ambiguity.** "A robust Next.js-compatible authentication solution" does not
name one, and the choice determines whether `users.id` is really ours.

**Decision.** Auth.js v5 (NextAuth) with the Drizzle adapter, running in our own
database, with email magic-link sign-in for the MVP.

**Reasoning.** The brief's hard requirement is that `user.id` is an immutable
internal UUID that survives an email change, the addition of Google or Apple
sign-in, and a move to passwordless. That requirement is about *who owns the
identity row*. With a hosted provider such as Clerk or Auth0, the canonical
identity lives outside our database, and our tables end up keyed on a foreign
subject string that we do not control. Auth.js keeps `users`, `accounts`,
`sessions` and `verification_tokens` in our Postgres, so `users.id` is generated
by us and never changes.

Adding a provider later is an insert into `accounts` against an existing
`users.id`. Changing an email is an update to a non-key column. Neither touches
anything downstream. Cost of the choice: we own email deliverability and session
handling. That is acceptable for a family-scale product and stays acceptable at
school scale.

**Rejected alternatives.** Clerk and Auth0: faster to start, external identity,
and a migration later would mean rewriting every `user_id`. Supabase Auth: pulls
a second Postgres into a stack that already has Neon.

---

## D2 — Two kinds of role

**Ambiguity.** Section 4 lists roles as parent, guardian, teacher and
administrator. Section 29 lists them as OWNER, GUARDIAN, TEACHER and VIEWER on
the `student_guardians` relationship. These are different things wearing the same
word.

**Decision.** Split them.

- `users.platform_role` — `USER` or `ADMIN`. Almost always `USER`. It grants
  nothing over student data; it exists for operational access to system-level
  resources such as shared curricula and audit inspection.
- `student_guardians.role` — `OWNER`, `GUARDIAN`, `TEACHER`, `VIEWER`. This is
  the only thing consulted when deciding whether a request may touch a student.

**Reasoning.** "Parent" is not an access level; it is a description of a
relationship to one child. The same person may be OWNER of their own children
and TEACHER for someone else's. Making the relationship the sole access decision
means there is exactly one authorization question in the system, asked the same
way everywhere: *does this `user_id` hold a sufficient role on this `student_id`?*

An `ADMIN` platform role deliberately does **not** imply access to children's
data. Support access to a family's records, if it is ever needed, should be an
explicit, logged, time-boxed grant rather than a permanent property of a staff
account.

**MVP.** `OWNER` and `GUARDIAN` are implemented. `TEACHER` and `VIEWER` exist in
the enum and in the permission matrix so no migration is needed to enable them.

---

## D3 — Evidence immutability: how hard is hard?

**Ambiguity.** The brief says evidence must be immutable, but every real system
eventually has to deal with an entry that was wrong: a parent mis-taps a grade, a
lesson is logged against the wrong child.

**Decision.** Physically append-only, with a correction protocol.

The application's database role is granted `SELECT` and `INSERT` on
`learning_evidence` and nothing else. A `BEFORE UPDATE OR DELETE` trigger raises
an exception as a second line of defence, so even a superuser session or a
future migration mistake fails loudly. The repository module exposes no update
function, and the ledger table has no `updated_at` column at all, which makes the
intent obvious to anyone reading the schema.

A mistake is corrected by inserting a new row with `evidence_type =
'CORRECTION'` and `supersedes_evidence_id` pointing at the original. A row that
should never have counted is neutralized by inserting `evidence_type =
'RETRACTION'`. The state engine ignores superseded and retracted rows when
computing current state, but they remain visible in the audit trail forever, and
the audit view shows both the original and what replaced it.

**Reasoning.** "Immutable" that is enforced only in the service layer is a
convention, and conventions lose to a future contributor in a hurry. Enforcing it
at the privilege level means the guarantee holds even for code that has not been
written yet. Meanwhile the correction protocol means the guarantee does not
become a reason to keep bad data: the ledger stays honest about both the error
and the fix.

---

## D4 — Where observed, inferred and recommended actually live

**Ambiguity.** Section 13 mandates the distinction but does not say whether it is
a column, a table, or a convention inside a report.

**Decision.** Three separate tables with three different lifecycles. It is never
a flag on one shared table.

| Class | Table | Written by | Can change learning state? | Mutable? |
| --- | --- | --- | --- | --- |
| OBSERVED | `learning_evidence` | Lesson execution, parent entry, assessments | Yes, it is the only input | No, append-only |
| INFERRED | `learning_inference` | Rule engine or AI provider | **No** | No, append-only |
| RECOMMENDED | `learning_recommendation` | Next Lesson Engine or AI provider | **No** | Status only: PROPOSED → ACCEPTED / REJECTED / EXPIRED |

**Reasoning.** A shared table with an `assertion_class` column invites exactly
the failure the brief is guarding against: one missing `WHERE` clause and an AI's
opinion is counted as a fact. Separate tables make that mistake impossible to
write by accident, because the inference table is simply not a table the state
engine reads. The type system helps too: the state engine's input type is
`EvidenceRow[]`, and an inference is not that type.

The separation also gives each class the lifecycle it deserves. An observation is
permanent. An inference is a dated opinion under a named model version, useful
for showing a parent how the system is reading the child, and safe to ignore. A
recommendation is a proposal with an outcome, which is what lets us measure
whether the engine's advice was ever any good.

---

## D5 — Who writes learning state

**Ambiguity.** `StudentObjectiveState` is described as a table with a status, but
not as the output of anything in particular. If arbitrary code can write it, the
evidence requirement is decorative.

**Decision.** `student_objective_state` is a derived projection. Nothing writes
it directly. It is produced exclusively by a pure function:

```
evaluateObjectiveState(
  evidence: EvidenceRow[],       // ordered, non-retracted, for one objective
  policy: StatePolicy,           // versioned thresholds, see 02
  now: Date
) => {
  status, confidence,
  rule_version, decided_by_evidence_ids[], rationale
}
```

The function is called inside the same transaction as every evidence insert. It
has no database access, no clock of its own, and no randomness, which makes it
trivially testable and trivially auditable.

Two consequences are load-bearing:

- The whole table can be dropped and rebuilt from the ledger, and a test asserts
  that a rebuild produces byte-identical results. If that test ever fails, some
  code has written state out of band, and we want to find out in CI rather than
  from a parent asking why a child "unlearned" something.
- Every transition also inserts an immutable
  `student_objective_state_transition` row recording the old status, the new
  status, the rule version, and the evidence IDs that caused it. This is what
  makes the auditability requirement in section 30 a query rather than a story.

**Reasoning.** This is the single decision that makes "the database is the source
of truth" true rather than aspirational. State that is *computed* cannot be
fabricated, by an LLM or by anyone else, without fabricating evidence first, and
fabricating evidence leaves a permanent, attributed record.

---

## D6 — What "MASTERED" requires

**Ambiguity.** Six statuses are listed with no thresholds. Without them, every
implementation invents its own, and the difference between PROFICIENT and
MASTERED becomes a matter of taste.

**Decision.** A versioned, declarative policy, stored in code and referenced by
version from every state row. The proposed v1 thresholds:

| Status | Requires |
| --- | --- |
| `NOT_STARTED` | No evidence |
| `INTRODUCED` | Any evidence, including `NOT_ASSESSED` exposure |
| `PRACTISING` | ≥ 3 assessed attempts, success rate < 0.6 |
| `DEVELOPING` | ≥ 5 assessed attempts, success rate ≥ 0.6 over the last 10 |
| `PROFICIENT` | ≥ 8 assessed attempts, success rate ≥ 0.8 over the last 10, across ≥ 2 distinct lessons |
| `MASTERED` | PROFICIENT, **plus** a successful retention check ≥ 14 days after the first PROFICIENT date, **plus** ≥ 1 `ASSESSMENT` evidence row graded deterministically or by a human |

Confidence is computed separately from status: `HIGH` needs ≥ 8 attempts across
≥ 2 sessions with no AI-graded-only evidence in the deciding set; `MEDIUM` needs
≥ 4 attempts; otherwise `LOW`.

**Reasoning.** Mastery that can be reached inside a single good lesson is not
mastery, it is a good lesson. Requiring a spaced retention check is what makes
the word mean retention, and it is also the mechanism that makes the review
schedule matter rather than being a decorative column. Requiring at least one
deterministically or human-graded assessment means an LLM's generosity can never
be the sole basis of the strongest claim the system makes about a child.

**NEEDS YOUR DECISION.** The numbers are defensible but they are pedagogy, not
engineering. Fourteen days and a success rate of 0.8 are my proposal; a teacher
may want different values per subject, and the policy is versioned precisely so
you can change them without rewriting history. Existing state rows keep the rule
version they were decided under until a recomputation is explicitly run.

---

## D7 — Does AI-graded evidence count?

**Ambiguity.** Section 12 allows evidence from a lesson, and section 21 lets the
AI react to student responses. So an LLM will be producing grades. The brief
forbids fabricated assessment, but open-ended spoken answers cannot be graded any
other way.

**Decision.** AI may grade, but AI-graded evidence is labelled and weighted.

Every evidence row carries `graded_by` (`SYSTEM`, `HUMAN`, `AI_PROVIDER`) and,
when it is `AI_PROVIDER`, the provider, model and prompt-template version. The
state policy treats AI-graded rows as valid evidence for every status up to
PROFICIENT, and refuses to let a set consisting only of AI-graded rows produce
MASTERED or a `HIGH` confidence.

`SYSTEM` grading means the answer was checkable without a model: multiple choice,
exact match, a numeric answer, a spelling. Those paths do not call an AI at all,
and the MVP's activity types are chosen so that most evidence is `SYSTEM`-graded.

**Reasoning.** Refusing AI grading entirely would make spoken practice
unassessable, which is most of what teaching a seven-year-old English consists
of. Accepting it silently would let a model's agreeableness accumulate into a
mastery claim. Labelling and weighting keeps the useful part and caps the
damage, and the label is what lets a parent see, in the explanation layer,
exactly which claims rest on a machine's judgement.

---

## D8 — Curriculum versioning

**Ambiguity.** `Curriculum.version` is a field, but nothing says what happens to a
child's recorded state when a curriculum is edited or a new version is published.
This is the most dangerous unaddressed gap in the brief: get it wrong and a
curriculum edit silently destroys longitudinal history, which is the entire
product.

**Decision.** Published curricula are immutable. Objectives have stable identity
across versions.

- A curriculum row has `status` of `DRAFT` or `PUBLISHED`. Draft content is
  editable. Publishing freezes the unit and objective rows for that version.
- Editing a published curriculum means creating the next version, which copies
  its units and objectives as new rows.
- Every objective carries `objective_key`, a stable string that is preserved
  across versions, plus `lineage_id`, a UUID shared by all versions of the same
  objective. Student state and evidence reference the concrete
  `learning_objective.id` they were recorded against, and progress is rolled
  forward across versions by `lineage_id`.
- A student's enrolment pins `curriculum_version_id`. Moving a student to a newer
  version is an explicit, logged action that produces a mapping report: objectives
  carried over, objectives that disappeared, objectives that are new.

**Reasoning.** Without stable identity, "fix a typo in an objective title" and
"replace the objective with a different one" are the same database operation, and
a child's two years of evidence end up attached to something that no longer means
what it meant. With `lineage_id`, the system can always answer whether today's
objective is the same learning target the child practised last March, and can say
so to a parent.

---

## D9 — Language of instruction versus language being taught

**Ambiguity.** The first use case is teaching English to two children who, in all
likelihood, speak Portuguese at home. The brief's subject model has one name and
no language fields. A subject-agnostic engine that cannot express "English,
explained in Portuguese, to a seven-year-old" will have that distinction hacked
into prompt text within a week.

**Decision.** Two explicit fields, on the enrolment rather than the subject.

- `student_subjects.instruction_language` — the language the teaching happens in.
- `student_subjects.target_language` — nullable, set only for language subjects.

Both are BCP-47 tags. For Mathematics taught in Portuguese, instruction is `pt-BR`
and target is null. For English taught in Portuguese, instruction is `pt-BR` and
target is `en`. As a child progresses, instruction language can shift to `en`
without touching the curriculum.

**Reasoning.** This belongs to the enrolment because it is a property of how this
child is being taught, not of the subject itself: Aurora may need Portuguese
scaffolding while Catarina does not. It also flows straight into the Context Pack
as a pedagogical constraint the AI must honour, which is far more reliable than
hoping the model infers it from a name.

---

## D10 — What a "lesson" is when nobody has built the lesson runner yet

**Ambiguity.** Phases 6 and 11 both concern lessons, and the MVP has no AI. So
what does a lesson *do* before there is an AI teacher?

**Decision.** The lesson is a container and an event log, and it is fully usable
manually.

In the MVP a lesson can be executed by a parent: the plan shows the activities,
the parent works through them with the child on paper or out loud, and records
outcomes. That produces real evidence, real state transitions and a real report,
through exactly the same write paths the AI will later use.

**Reasoning.** This is what keeps the requirement "the core must work without an
AI API" from being a technicality. It also means every write path is exercised by
humans before a model ever touches it, so when AI integration arrives in Phase 12
it is a new *caller* of proven code, not a new system. It has a pleasant side
effect for the first use case: you can start teaching your children with this
before the interesting part is finished.

---

## D11 — Lesson numbering and concurrency

**Ambiguity.** `lesson_number` implies a per-student, per-subject counter, which
is a classic source of duplicate-key races.

**Decision.** `lesson_number` is allocated inside the creating transaction under a
Postgres advisory lock keyed on `(student_id, subject_id)`, with a unique
constraint on the triple as the backstop. Lesson creation is additionally
idempotent on a client-supplied `idempotency_key`, so a double-clicked "start
lesson" button produces one lesson.

**Reasoning.** Two parents on two phones is a normal Tuesday evening, and a
duplicate lesson 25 would corrupt the numbering that the entire parent-facing
narrative depends on.

---

## D12 — Time, timezones and review windows

**Ambiguity.** Students have a timezone; the review schedule has a
`next_review_at`.

**Decision.** Every timestamp column is `timestamptz` and every stored value is
UTC. `students.timezone` is an IANA name used only for presentation and for
deciding what "today" and "14 days later" mean when evaluating retention and
review windows. Date-bucketing for retention checks uses the student's local
calendar day, computed explicitly, never the server's.

**Reasoning.** A retention rule that means something different depending on which
Vercel region served the request is not a rule. Making the conversion explicit
and student-scoped also keeps the system correct when a family travels or moves.

---

## D13 — Row-level security now or later

**Ambiguity.** Section 28 requires that every query be scoped by authorization
but does not mandate Postgres RLS.

**Decision.** Application-level authorization is the primary control, implemented
so that it cannot be forgotten (see [03](03-authorization-and-security.md)). RLS
is deferred, but the schema is shaped so it can be added later without a data
migration: every table holding student-scoped data carries a `student_id`
column directly, even where it could be reached through a join.

**Reasoning.** Turning RLS on later is a policy migration if the columns are
already there, and a schema rewrite if they are not. Paying one denormalized
column per table now buys the option cheaply. Choosing application-level
enforcement as the primary control is also simply honest about where the risk
is: with a single connection role and a serverless pooler, RLS in this stack is
defence in depth, not the main gate.

---

## D14 — Where AI output enters the system

**Ambiguity.** Section 22 requires a provider abstraction but not a boundary
contract.

**Decision.** AI providers return typed proposals, never writes. Every provider
method returns a Zod-validated envelope, and the envelope is consumed by
application code that decides what, if anything, to persist. A provider has no
database handle, and the AI module in the codebase has no import path to the
repository layer. That is enforced by a lint rule on module boundaries, so a
future contributor cannot wire it up by accident.

**Reasoning.** Most "the AI corrupted our data" incidents are architecture
failures rather than model failures: the model was handed a write. Structuring
providers as pure functions from context to proposal means the worst an
adversarial or malfunctioning model can do is propose something that validation
rejects. It is also what makes provider substitution real, since nothing outside
the module knows which vendor answered.

---

## Open questions that need you

These cannot be resolved from the brief, and my assumption is recorded so work is
not blocked. Each is cheap to change now and progressively less cheap later.

| # | Question | My working assumption |
| --- | --- | --- |
| 1 | Mastery thresholds and the 14-day retention window (D6) | As tabulated in D6, versioned and changeable |
| 2 | Lesson length for a 7-year-old | 20 minutes planned, 3 to 5 activities |
| 3 | New material versus review in one lesson | One primary objective, up to 2 review objectives |
| 4 | Sign-in method for the MVP | Email magic link, no password |
| 5 | Which curriculum standard the demo English follows | A small, clearly-marked DEMO curriculum I author, not a real standard |
| 6 | Whether a child ever logs in | No, not in the MVP; the parent opens the lesson |
| 7 | Data residency | Neon in the EU region, given children in Europe |
| 8 | Do you want Portuguese UI for parents | English first, with copy kept in one module so translation is not a rewrite |
