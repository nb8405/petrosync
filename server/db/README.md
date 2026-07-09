# Backend Phase 2 Database Notes

## Current Architecture

The project previously had no active database schema. Backend Phase 2 defines a normalized PostgreSQL reporting schema in `schema.sql`.

## Tables

- `dsr_records`: one row per DSR date. `dsr_date` is unique to prevent duplicate daily records.
- `dsr_product_rows`: product/tank rows for each DSR. Product codes cover MS, HSD Tank 1, HSD Tank 2, XP95 and XG.
- `dsr_collections`: payment collections per DSR record.
- `dsr_expenses`: expense rows per DSR record.

## Indexes

- `idx_dsr_records_dsr_date`: supports date range reports.
- `idx_dsr_product_rows_product_code`: supports product filtering.
- `idx_dsr_product_rows_record_product`: supports joined range/product reports.
- `idx_dsr_collections_record_type`: supports collection aggregation.
- `idx_dsr_expenses_record_type`: supports expense aggregation.

## Reporting Query Strategy

Reports use one centralized service and fetch range data with grouped SQL aggregation. Product rows, collection totals, expense totals and record count are loaded in parallel to avoid repeated loops and duplicate queries.

## Migration Runner

Migrations are managed by `migrationRunner.js` and tracked in the `schema_migrations` table.

Run migrations with:

```bash
npm run migrate
```

Migration files are applied in filename order from `db/migrations/`. Each migration runs inside a transaction and records its version only after successful completion.
