# 04 — Migration structure

## Principles

1. Drizzle Kit generates SQL from the TypeScript schema; the generated SQL is
   committed and is what runs. Nothing is applied that is not in Git.
2. `drizzle-kit push` is a local development convenience only. It is never used
   against a shared or production database, and the deploy script does not
   contain it.
3. The production schema is never edited by hand. If a fix is needed, it is a
   migration.
4. Migrations run as a privileged role; the application runtime role cannot
   change the schema.
5. Migrations are forward-only. A mistake is corrected by a new migration, not by
   editing a released one, because an edited migration means two databases
   claiming the same version number.

## Layout

```
/drizzle
  /meta                      drizzle-kit journal and snapshots
  0000_initial_identity.sql
  0001_students_subjects.sql
  0002_curriculum.sql
  0003_objectives_graph.sql
  0004_state_and_review.sql
  0005_evidence_ledger.sql
  0006_lessons_events.sql
  0007_reports_snapshots.sql
  0008_inference_recommendation.sql
  0009_audit_consent.sql
  /manual
    0005a_evidence_append_only.sql     triggers + REVOKE
    0006a_lesson_events_append_only.sql
    0007a_snapshots_append_only.sql
    0010a_curriculum_publish_freeze.sql
    0011a_grants.sql                   runtime role privileges
/lib/db
  schema/                    one file per layer, re-exported from index.ts
  enums.ts                   single source for every enum (02 §11)
  client.ts                  server-only Neon + Drizzle client
/scripts
  migrate.ts                 applies /drizzle then /drizzle/manual, in order
  seed-demo.ts               idempotent, is_demo = true
  verify-schema.ts           CI: schema matches migrations, no drift
  rebuild-state.ts           recompute all derived state from the ledger
```

## Hand-written SQL

Drizzle generates tables, constraints and indexes well. Four things it does not
express, which therefore live in `/drizzle/manual` and run after the generated
file of the same number:

- **Append-only triggers** on `learning_evidence`, `lesson_events`,
  `learning_snapshots`, `student_objective_state_transition` and `audit_log`.
- **Privilege grants** for the runtime role, including the `REVOKE UPDATE,
  DELETE` that makes the ledger append-only at the privilege level (D3).
- **Publish freeze** on `curriculum_versions`: once `status = 'PUBLISHED'`, a
  trigger blocks changes to that version's units and objectives (D8).
- **Partial unique indexes** with predicates, such as one active OWNER per
  student.

Each manual file is idempotent (`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF
EXISTS` then `CREATE TRIGGER`) so re-running it is safe.

## Applying them

- **Local.** `pnpm db:migrate` runs `scripts/migrate.ts` against a local or
  branch database.
- **Preview.** Each Vercel preview uses a Neon branch, created from production
  schema with no production data. Migrations apply to the branch, so a schema
  change is exercised before it is merged.
- **Production.** Migrations run as an explicit deploy step, not on application
  boot. Boot-time migration in a serverless runtime means every cold start races
  every other cold start for the same lock.

## Verification after every phase

`scripts/verify-schema.ts` runs in CI and fails on:

- drift between the TypeScript schema and the committed migrations,
- a foreign key with no supporting index,
- a student-scoped table missing its `student_id` column (the RLS-readiness
  invariant from D13),
- an append-only table that has an `updated_at` or `deleted_at` column,
- an append-only table with no protective trigger.

The last two are worth the trouble: they catch the specific way this system would
degrade, which is someone making the ledger mutable because it was momentarily
convenient.

## Seed data

`scripts/seed-demo.ts` is idempotent, marks every row `is_demo = true`, and
creates: one demo parent, the students Catarina and Aurora, the subjects English
and Mathematics, one small DEMO curriculum each with units, objectives and a
prerequisite chain, plus a handful of lessons with evidence so the dashboard has
something real to show. It never runs automatically against production.
