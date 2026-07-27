# Database migrations — ORM-first (no hand-written SQL)

## Requirement

**frog1 uses Drizzle ORM as the single source of truth for the database schema.**

Developers must **not** hand-write SQL migration files or edit `drizzle/meta/_journal.json` manually. Schema changes belong in TypeScript only; Drizzle Kit generates and applies migrations.

This matches the agreed approach: **schema in code, auto-migrate on boot** (similar to GORM AutoMigrate), not manual SQL authoring.

---

## What you write

| Layer | Location | Who maintains it |
|-------|----------|------------------|
| **Schema (source of truth)** | `packages/db/src/schema/*.ts` | Developers |
| **Queries in app code** | Drizzle query builder in NestJS services | Developers |

Example — define tables in TypeScript:

```ts
// packages/db/src/schema/sales.ts
export const salesOrders = pgTable("sales_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull(),
  // ...
});
```

Export new schema from `packages/db/src/schema/index.ts`.

---

## What you do **not** write

- Do **not** create or edit `packages/db/drizzle/*.sql` by hand
- Do **not** edit `packages/db/drizzle/meta/_journal.json` manually
- Do **not** use raw `sql` fragments with untrusted input in application code (use Drizzle builders: `eq`, `and`, `insert`, etc.)

Drizzle may still **generate** `.sql` files under `packages/db/drizzle/` — that is expected. Those files are **build artifacts**, not something we author.

---

## Workflow for every schema change

```bash
# 1. Edit TypeScript schema only
#    packages/db/src/schema/<module>.ts

# 2. Generate migration from schema diff (Drizzle writes the SQL)
pnpm db:generate

# 3. Restart API — migrations apply automatically on boot
pnpm dev:api
```

`AUTO_MIGRATE=true` in `.env` runs `runMigrations()` in `apps/api/src/main.ts` on startup.

---

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm db:generate` | Generate SQL migration from TS schema changes |
| `pnpm dev:api` | Build DB package + start API (auto-migrates) |
| `pnpm --filter @frog1/db studio` | Drizzle Studio (inspect DB) |

---

## Legacy / bootstrap helpers

These exist for early upgrades only — **not** the normal path for new work:

- `applyCustomersIfNeeded()`
- `applyInventoryIfNeeded()`
- `apply-phase1` scripts

New tables and columns must go through **schema TS → `db:generate` → auto-migrate**.

---

## SQL injection

Drizzle parameterizes values when using the query builder. That is the standard protection for app queries. This is separate from migrations: migrations are generated from our schema, not from user input.

---

## Summary

1. **Schema** → TypeScript (`packages/db/src/schema/`)
2. **Migrate** → `pnpm db:generate` (never hand-write SQL)
3. **Apply** → API boot (`AUTO_MIGRATE`)

If a migration was added by hand, delete it, keep only the TS schema, and run `pnpm db:generate` to regenerate correctly.
