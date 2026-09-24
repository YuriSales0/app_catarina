# Learning OS

A longitudinal, evidence-based learning platform.

The database is the source of truth for curriculum, student progress, learning
evidence and historical state. AI is the teaching and interaction layer only.

> **AI decides HOW to teach. Learning OS decides WHAT should be learned and WHAT
> has actually been demonstrated.**

The first use case is teaching English to two children. The engine itself is
subject-agnostic and is designed to carry Mathematics, Science, Music,
Programming or any other structured learning domain without changes to the core.

## Status

All twelve phases are implemented. See [`docs/IMPLEMENTATION-STATUS.md`](docs/IMPLEMENTATION-STATUS.md)
for gates, proofs, decisions taken and unresolved issues.

| Milestone | Phases | State |
| --- | --- | --- |
| M1 Foundation | 1, 2, 3 | Done |
| M2 First real lesson | 4, 5, 6 | Done |
| M3 Intelligence | 8, 7, 9 | Done |
| M4 Experience | 10, 11 | Done |
| M5 AI | 12 | Done, not yet exercised against a live provider |

Deployed on Vercel (`fra1`) with Neon Postgres in Frankfurt; migrations and the
Cambridge YLE catalogue load on every production build. Sign-in needs a Google
OAuth client first. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

The interface is in Brazilian Portuguese, with a soft, child-friendly design
for the lesson screens. The design decisions are in
[`docs/ux/UX-PLAN.md`](docs/ux/UX-PLAN.md).

## Quick start

```bash
cp .env.example .env.local
pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
```

## Architecture

Start at [`docs/architecture/README.md`](docs/architecture/README.md).
