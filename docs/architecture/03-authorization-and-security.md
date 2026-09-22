# 03 — Authorization, security and privacy

This is a product that stores a detailed, longitudinal record of what two
specific children find difficult. The threat model is not "someone steals our
business data". It is "a stranger reads a dossier about a seven-year-old". The
controls below are sized for that.

---

## 1. The single authorization question

There is exactly one question, asked identically everywhere:

> Does this `user_id` hold a role of at least *X* on this `student_id`, through
> an accepted and un-revoked `student_guardians` row?

Nothing else grants access to student data. Not `students.created_by_user_id`,
which is provenance only. Not `platform_role = 'ADMIN'`. Not being the author of
a curriculum the child happens to use.

```
resolveAccess(userId, studentId) -> {
  role: GuardianRole,
  grantedAt: Date
} | Denied
```

### Permission matrix

| Capability | OWNER | GUARDIAN | TEACHER | VIEWER |
| --- | :-: | :-: | :-: | :-: |
| View student profile, progress, reports, snapshots | ● | ● | ● | ● |
| Start, run and complete lessons | ● | ● | ● | ○ |
| Record evidence | ● | ● | ● | ○ |
| Enrol in subjects, change curriculum version | ● | ● | ○ | ○ |
| Edit student profile | ● | ● | ○ | ○ |
| Invite or revoke guardians | ● | ○ | ○ | ○ |
| Export all student data | ● | ○ | ○ | ○ |
| Delete the student | ● | ○ | ○ | ○ |

`TEACHER` and `VIEWER` are defined now and enabled later (D2); defining them now
costs a table row and saves a schema change.

---

## 2. Making the check impossible to forget

The usual failure is not a wrong authorization rule. It is a query somewhere that
never asked. Three mechanisms make omission a compile-time or startup error
rather than a silent leak.

### No ambient authentication

No repository function reads the session. Every function that touches
student-scoped data takes an explicit first parameter:

```ts
type StudentAccess = {
  readonly studentId: StudentId
  readonly userId: UserId
  readonly role: GuardianRole
  readonly __brand: 'StudentAccess'   // not constructible outside the guard
}

requireStudentAccess(session, studentId, minRole): Promise<StudentAccess>
```

The brand is unexported, so a `StudentAccess` value can only come from
`requireStudentAccess`. A repository signature of
`getLessons(access: StudentAccess, …)` therefore cannot be called at all without
having passed the check first. Forgetting authorization stops being a code
review question and becomes a type error.

### The repository owns the predicate

Repository functions derive `student_id` from `access.studentId` and never from
a caller-supplied argument. A route handler cannot pass an authorized access
object for one child and an ID for another, because there is only one ID in
scope.

### Server-only boundaries

The database module imports `server-only`, so any accidental import from a
client component fails the build. Module-boundary lint rules forbid `app/**` from
importing `lib/db/**` directly: routes and server actions talk to
`lib/*/service` modules, which talk to repositories. The AI module may not import
repositories at all (D14).

---

## 3. Input validation

Every external input is parsed by Zod at the boundary, and the parsed type is
what flows inward. IDs are branded (`StudentId`, `ObjectiveId`, …) so a lesson ID
cannot be passed where a student ID is expected, which is a real bug class in a
schema with this many UUIDs.

IDs are validated as UUIDs before they reach the database, so a malformed value
produces a 400 rather than a database error containing schema detail.

---

## 4. Defence in depth at the database

- The application connects as a role with `SELECT, INSERT, UPDATE, DELETE` on
  mutable tables and only `SELECT, INSERT` on `learning_evidence`,
  `lesson_events`, `learning_snapshots`, `student_objective_state_transition`
  and `audit_log`. Migrations run as a separate, more privileged role that the
  runtime never uses.
- Append-only triggers on those tables raise on `UPDATE` or `DELETE`, so the
  guarantee survives a future privilege mistake.
- Every student-scoped table carries `student_id` directly, so Postgres RLS can
  be enabled later as a policy migration with no data movement (D13).
- Foreign keys everywhere, with deliberate `ON DELETE` behaviour: `CASCADE` from
  a student to their records, `RESTRICT` from a curriculum objective that
  evidence references, so curriculum cleanup can never orphan a child's history.

---

## 5. Child data minimization

Decisions taken specifically because the subjects are children:

| Decision | Reason |
| --- | --- |
| No surname field on `students` | Given name is enough to address a child; a full name is identifying data with no product use |
| Date of birth nullable, and only an age band leaves the system | Age drives age-appropriateness; the exact date is never needed downstream |
| `avatar_key` selects an illustration; no photo upload | A photo of a child is the highest-risk datum we could hold, and it buys nothing |
| No audio retained by default | Section 27. Voice, when added, streams and is discarded; retention requires explicit per-student opt-in with a recorded consent row and a retention period |
| No free-text about the child from the AI stored as fact | AI observations land in `learning_inference`, clearly labelled |
| Context Packs carry a given name, an age band and learning data only | See [06](06-context-pack.md) |
| Default region EU | The children are in Europe; keeps GDPR simple |

### Consent, export, deletion, retention

- `consents` table: `user_id`, `student_id`, `kind` (`PROCESSING`,
  `AI_PROCESSING`, `AUDIO_RETENTION`, `ANALYTICS`), `granted_at`, `revoked_at`,
  `policy_version`. Features check it rather than assuming it.
- **Export.** One owner-only operation producing a single JSON document with the
  student, enrolments, evidence, lessons, events, reports and snapshots. Building
  it in Phase 4 rather than later is deliberate: it is trivial while the schema
  is small and becomes a project once it is not.
- **Deletion.** Soft delete hides the student immediately; a purge job after a
  grace period (proposed 30 days) hard-deletes the child's rows. Curriculum and
  subject rows are untouched. Audit log entries retain the student ID as an
  opaque reference with the personal fields removed, so a deletion is provable
  without keeping what was deleted.
- **Retention.** Lesson events older than a configurable window can be
  down-sampled to their evidence, keeping the learning record and shedding the
  transcript.

---

## 6. Secrets

All secrets are environment variables, read exclusively in server modules and
never prefixed `NEXT_PUBLIC_`. A startup validator parses `process.env` with Zod
and refuses to boot on anything missing, so a misconfigured deploy fails at
start rather than at the first database call. The Neon connection string, the
Auth.js secret and any future provider key are server-only; nothing in
`components/**` can import the env module, enforced by lint.

---

## 7. Security and privacy risks, with mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | Cross-tenant read: one parent sees another's child | Single chokepoint on `student_guardians`, branded `StudentAccess`, repository-owned predicates, and a test that enumerates every route as a non-guardian expecting 403/404 |
| 2 | ID enumeration reveals existence of other students | Unauthorized access to an existing resource returns 404, not 403, so responses do not distinguish "not yours" from "not there" |
| 3 | Authorization drift as new routes are added | Omission is a type error, not a review miss; plus a CI check that every route module imports a guard |
| 4 | Email change hijacks an account | Email is not a key (D1); changes require verification of the new address and notify the old one |
| 5 | Stale guardian keeps access after revocation | Revocation is checked per request, not cached in the session; sessions carry only `user_id` |
| 6 | Evidence tampering hides a bad grade | Append-only at the privilege and trigger level (D3); corrections are new attributed rows |
| 7 | Child data sent to an AI provider beyond what is needed | Context Pack is an explicit allowlist projection, Zod-validated, with opaque handles instead of UUIDs; a test asserts no unexpected keys and no foreign student IDs |
| 8 | Prompt injection through parent-supplied `teacher_instructions` | Treated as untrusted data inside the pack, length-capped, never concatenated into the system prompt, and unable to alter objective selection because selection already happened deterministically |
| 9 | Prompt injection through a child's spoken response | Same: model output is a proposal, validated, and can write nothing |
| 10 | AI provider retains or trains on child data | Provider config requires a no-training setting; provider choice is a single module (D14); the consent kind `AI_PROCESSING` gates it |
| 11 | Voice recordings accumulate | Not stored by default; opt-in, consented, with a retention period |
| 12 | Audit log itself leaks content | Stores actions and resource IDs, not payloads; IPs hashed |
| 13 | Session fixation or theft | Auth.js httpOnly, secure, sameSite cookies; short session lifetime with rotation |
| 14 | Mass assignment through a server action | Zod parse with strict objects at every boundary; no spread of request bodies into inserts |
| 15 | A migration accidentally drops the ledger | Migrations reviewed in PRs, destructive statements flagged by a CI check, and the ledger restorable from backup with snapshots as a cross-check |
| 16 | Demo data mistaken for a real child's history | `is_demo` on every seedable table, a `DEMO` badge in the UI wherever it appears, and demo rows excluded from any aggregate (section 32) |
| 17 | Logs leak child responses | Structured logging with a redaction allowlist; `student_response` and `prompt` are never logged |
| 18 | An admin browses family data out of curiosity | `platform_role = ADMIN` grants no student access; any support access would be an explicit, logged, expiring guardian grant |
