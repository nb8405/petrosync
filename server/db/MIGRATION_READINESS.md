# Migration Readiness Report

## Current Migration Order

1. `001_initial_schema.sql`
2. `002_security_phase_36.sql`
3. `003_security_phase_37.sql`

## Deployment Safety

- Migrations run in sorted filename order.
- Each migration is wrapped in a database transaction by `migrationRunner.js`.
- Applied versions are tracked in `schema_migrations`.
- Existing schema changes use `IF NOT EXISTS` where practical to support reruns and partially upgraded environments.
- Production should run a signed manual backup before applying migrations.

## Rollback Position

The project does not maintain destructive down migrations. Rollback should be performed by restoring a signed, verified backup through the dual-control restore workflow.

## PostgreSQL Test Environment

Integration tests that require a live database should use a dedicated PostgreSQL database and never a production database. Recommended variables:

- `NODE_ENV=test`
- `DATABASE_URL=postgres://<user>:<password>@<host>:<port>/<test_db>`

Run:

```bash
npm run migrate
npm test
```

## Remaining Migration Risk

- No automated down migrations are available.
- Large future migrations should include preflight row counts and estimated lock impact.
- Restore drills should be run before ATOS/ATG work begins.
