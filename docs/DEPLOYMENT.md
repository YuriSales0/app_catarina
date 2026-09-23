# Deployment runbook

Production runs on Vercel (functions in `fra1`) against Neon Postgres in
`aws-eu-central-1` (Frankfurt). No secret lives in the repository; every
credential is a Vercel environment variable.

## Topology

| Piece | Value |
| --- | --- |
| Vercel project | `learning-os` (Git-linked to this repository) |
| Production domain | `https://learning-os-livid.vercel.app` (public) |
| Production branch | `claude/amazing-bardeen-wtlj1e` (a push deploys) |
| Neon | database `learning_os` on the default branch, PG 17 |
| Build command | `pnpm deploy:migrate && pnpm build` (`vercel.json`) |

Vercel Deployment Protection is on in its standard mode: the production domain
above is public, while per-deployment and team-scoped URLs
(`*-yuri-almeidas-projects.vercel.app`) ask for a Vercel login. Always give
people, and Google, the production domain.

## Database roles

Two roles, never interchanged.

| Role | Used by | Can |
| --- | --- | --- |
| `learning_os_owner` | `deploy:migrate` only (build time) | Owns the schema, runs DDL |
| `learning_os_app` | The running app (`DATABASE_URL`) | SELECT/INSERT/UPDATE on normal tables; INSERT and SELECT only on the append-only ledger |

The app role **must be created with SQL**, not through the Neon console or
API. Roles made there are added to `neon_superuser`, which carries
`pg_write_all_data` and would silently defeat the ledger `REVOKE`s in
migration `0001`. Create it once, as the owner, before the first migration:

```sql
CREATE ROLE learning_os_app LOGIN PASSWORD '<generated>';
```

Migration `0001` then grants and revokes privileges on it (it applies the
grants only when the role exists). Verify after every deploy that touches
grants:

```sql
SELECT has_table_privilege('learning_os_app', 'learning_evidence', 'UPDATE');  -- false
SELECT pg_has_role('learning_os_app', 'neon_superuser', 'member');              -- false
```

## Environment variables

| Key | Target | Notes |
| --- | --- | --- |
| `DATABASE_URL` | production | `learning_os_app`, **pooled** host (`-pooler`), `sslmode=verify-full` |
| `DATABASE_MIGRATOR_URL` | production | `learning_os_owner`, **direct** host (no `-pooler`), `sslmode=verify-full` |
| `AUTH_SECRET` | production | 48+ random bytes, base64url |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | production | See Google sign-in below |
| `AI_PROVIDER` | production, preview | `null` until a provider is chosen; `openai` plus `OPENAI_*` to enable |
| `LOG_LEVEL` | production, preview | `info` |

Do **not** set `AUTH_DEV_LOGIN` (the app refuses to start with it in
production) or `AUTH_URL` (`trustHost` derives it from the request).

The pooler runs in transaction mode. The app only uses transaction-scoped
advisory locks (`pg_advisory_xact_lock`), so it is safe behind it. Migrations
go through the direct host because DDL and the migrator's session state do not
belong on a transaction pooler.

Preview deployments get no database credentials on purpose, so a feature
branch can never write into production data. Give previews a Neon branch of
their own before relying on them.

## Migrate on deploy

`scripts/deploy-migrate.ts` runs before `next build` on production builds
only (`VERCEL_ENV=production`). It:

1. applies pending Drizzle migrations from `./drizzle`;
2. imports the public catalogue (`curricula/english-starters.yaml`,
   `curricula/english-movers.yaml`) as published, owner-less curricula,
   skipping any version that already exists.

Both steps are idempotent, so a redeploy is safe. Demo data is never seeded in
production.

Trade-off: the owner credential sits in the production environment of the
build. It is scoped to production, marked sensitive (not readable back from
the dashboard) and not referenced by any runtime code path. The alternative is
running `pnpm db:migrate` by hand from a trusted machine before each deploy.
If you move to that, delete `DATABASE_MIGRATOR_URL` from Vercel and the build
step becomes a no-op.

A failing migration fails the build, so the previous deployment keeps serving.
Migrations are forward-only; to undo one, write a new migration.

## Google sign-in

Production has no dev login. Until Google is configured, `/login` reports that
no sign-in method is available.

1. Google Cloud Console, APIs and Services, Credentials: create an OAuth
   client of type Web application.
2. Authorised JavaScript origin: `https://learning-os-livid.vercel.app`.
3. Authorised redirect URI:
   `https://learning-os-livid.vercel.app/api/auth/callback/google`.
   If a custom domain is added later, add its origin and callback too.
4. OAuth consent screen: add the parents' Google accounts as test users while
   the app is in testing mode.
5. In Vercel, set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (production,
   sensitive) and redeploy.

Each parent signs in once with Google. The parent who creates a student owns
that student and grants the other parent access from the student's settings
(by email, after that parent has signed in at least once).

## Rotating credentials

- **App role password:** as owner, `ALTER ROLE learning_os_app PASSWORD '<new>'`;
  update `DATABASE_URL` in Vercel; redeploy. Old connections drop as functions
  recycle.
- **Owner password:** reset in Neon (`learning_os_owner`); update
  `DATABASE_MIGRATOR_URL`; the next build uses it.
- **`AUTH_SECRET`:** replace and redeploy. Every session is signed out.
- **Google client secret:** rotate in Google Cloud, update Vercel, redeploy.

## Smoke test after a deploy

- `GET /health` returns `{"ok":true,"service":"learning-os"}` (liveness only,
  no database call).
- `GET /login` renders.
- Neon: the migrations table has one row per file in `drizzle/`, and the
  catalogue query below returns 47.

```sql
SELECT count(*) FROM learning_objectives o
JOIN curriculum_versions v ON v.id = o.curriculum_version_id
JOIN curricula c ON c.id = v.curriculum_id
WHERE c.owner_user_id IS NULL;
```
