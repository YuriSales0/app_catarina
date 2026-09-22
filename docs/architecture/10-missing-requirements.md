# 10 — Missing product requirements

Gaps in the brief that will need an answer. Each is marked by when it has to be
resolved: **now** means it changes the schema and is expensive later, **soon**
means it is needed before the product is usable day to day, and **later** means
it can wait without creating debt.

---

## Schema-affecting (resolve now)

**1. Curriculum versioning and student state migration.** The brief has
`Curriculum.version` but never says what happens to a child's recorded progress
when a curriculum changes. Without stable objective identity, a typo fix and a
replacement are the same operation, and years of evidence silently detach.
Proposed resolution in [D8](01-ambiguities-and-decisions.md#d8--curriculum-versioning):
immutable published versions, `objective_key` and `lineage_id`, pinned enrolments
and an explicit migration that produces a mapping report.

**2. Language of instruction versus language being taught.** Teaching English to
Portuguese-speaking children is the first use case, and there is nowhere to say
so. [D9](01-ambiguities-and-decisions.md#d9--language-of-instruction-versus-language-being-taught):
`instruction_language` and `target_language` on the enrolment.

**3. Definition of the status thresholds.** Six statuses with no criteria means
every implementation invents its own. [D6](01-ambiguities-and-decisions.md#d6--what-mastered-requires)
proposes a versioned policy; the numbers need your judgement.

**4. What counts as an assessment.** `evidence_type = 'ASSESSMENT'` gates
`MASTERED`, so "assessment" needs a definition: how many items, whether it may be
AI-graded, whether a parent may mark one. Proposed: an assessment is an activity
of type `ASSESSMENT` with at least 5 items against one objective, graded by
`SYSTEM` or `HUMAN`.

**5. Mastery decay.** Does `MASTERED` last forever? A child who mastered
subtraction in March and has not touched it since is not in the same state in
November. Proposed: mastery does not decay in status, but the review scheduler
keeps scheduling retention checks, and a failed check demotes to `PROFICIENT`
with a recorded transition. This is a pedagogy decision with a schema
consequence, which is why it is in this section.

**6. Offline and paper evidence.** Most learning at this age happens away from a
screen. The evidence ledger supports it (`PARENT_REPORT`, `occurred_at` distinct
from `created_at`), but the brief never asks for the entry path. Proposed: a
simple "record what we did" form in Phase 6, because a system that only knows
about screen time will systematically under-measure the child.

**7. Consent records.** Section 27 says to plan for consent but defines no
entity. Proposed `consents` table in [03](03-authorization-and-security.md).

---

## Product-shaping (resolve soon)

**8. Lesson scheduling.** The brief has "upcoming lessons" on the dashboard but
no scheduling entity. Proposed: defer the calendar, and let "upcoming" mean the
next plan the engine would produce. A real schedule with reminders is a Phase 13
candidate.

**9. Remediation when a child keeps failing.** The engine has a brake on
repetition, but there is no defined path when an objective fails repeatedly. A
child stuck for four lessons needs the system to do something other than keep
scheduling it. Proposed: after three consecutive lessons with success rate below
0.4, the engine emits a `PACING` recommendation and flags the objective for
parent attention, rather than silently grinding.

**10. Multi-objective lessons.** One primary objective plus up to two reviews is
my proposal; the brief does not specify. It affects the plan schema and the
report.

**11. Difficulty scale semantics.** `difficulty` is an integer with no defined
meaning. Proposed: 1–5 within a curriculum, relative to that curriculum, never
compared across subjects.

**12. Error tag vocabulary.** Recurring-error detection depends on
`error_tags`, but nothing defines who assigns them or from what vocabulary. Left
undefined, an AI will invent free-text tags and recurrence detection will never
fire because no two tags will match. Proposed: a per-subject controlled
vocabulary stored as curriculum metadata, with AI-proposed tags mapped onto it or
rejected. This is small and easy to miss, and the recurring-error feature does
not work without it.

**13. Who may author curricula.** `visibility` and `owner_user_id` are proposed,
but the rules for sharing a family curriculum are undefined. Fine to defer, as
long as the columns exist.

**14. Notifications.** No requirement stated. Deliberately out of the MVP.

**15. Parent-facing copy and tone.** The dashboard shows a child's difficulties
to a parent. That is emotionally loaded, and the difference between "Catarina is
struggling with negation" and "negation needs more practice" is a product
decision, not a styling one. Worth deciding before the dashboard is built.

---

## Deferred (resolve later)

**16. Student self-access.** Children have no accounts in the MVP. An older
child eventually will, which means a `students.user_id` link and a child-scoped
session with a much narrower permission set. The schema does not block it.

**17. Billing and subscriptions.** Not modelled. No schema impact while the
product is a family tool.

**18. Multi-tenancy for schools.** A school would need an organization above the
guardian relationship. `student_guardians` generalizes to it, but the reporting
and invitation flows would be new work.

**19. Analytics and success measurement.** Section 31 defines what to optimize
for but not how to measure it. The `learning_recommendation` status field is the
seed: it lets us eventually ask whether accepted recommendations correlate with
faster progression.

**20. Data export format.** Proposed JSON matching the schema; a parent-readable
PDF is a later nicety.

**21. Accessibility specifics.** "Accessible" is stated without a target.
Proposed: WCAG 2.1 AA, with keyboard navigation and visible focus treated as
non-negotiable from the first screen, since retrofitting them is far more
expensive.

**22. Internationalization of the interface.** The engine is language-aware for
teaching, but the UI language is unspecified. Proposed: English first, with all
copy in one module so translation is not a rewrite.

**23. Session length and screen-time limits for children.** A product for
seven-year-olds should probably have an opinion about a maximum daily lesson
time. Not required by the brief; worth a deliberate decision rather than an
accident.
