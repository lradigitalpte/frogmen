import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(__dirname, "../../../.env") });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const dbUrl = connectionString;

async function main() {
  const sql = postgres(dbUrl, { max: 1 });
  const migrationPath = resolve(__dirname, "../drizzle/0000_init.sql");
  const migration = readFileSync(migrationPath, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  const [{ exists }] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `;

  if (exists) {
    console.log("Auth tables already exist — skipping apply-phase1");
    await sql.end();
    return;
  }

  const [{ hasLegacyOrg }] = await sql<{ hasLegacyOrg: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND data_type = 'uuid'
    ) AS "hasLegacyOrg"
  `;

  if (hasLegacyOrg) {
    console.log("Upgrading legacy schema to Better Auth...");
    await sql`ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS exchange_rates_pair_date_org`;
    await sql`ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_base_currency_id_currencies_id_fk`;
    await sql`DROP TABLE IF EXISTS organizations`;
    await sql`ALTER TABLE exchange_rates ALTER COLUMN organization_id TYPE text USING organization_id::text`;
    await sql`ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_pair_date_org UNIQUE (from_currency_id, to_currency_id, effective_date, organization_id)`;
  }

  for (const statement of statements) {
    if (
      statement.includes('CREATE TYPE "public"."symbol_position"') ||
      statement.includes('CREATE TABLE "currencies"') ||
      statement.includes('CREATE TABLE "exchange_rates"')
    ) {
      continue;
    }

    if (
      statement.includes(
        'ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_from_currency_id_currencies_id_fk"',
      ) ||
      statement.includes(
        'ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_to_currency_id_currencies_id_fk"',
      )
    ) {
      continue;
    }

    await sql.unsafe(statement);
  }

  console.log("Phase 1 auth schema applied");
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
