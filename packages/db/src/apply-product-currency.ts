import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(__dirname, "../../../.env") });

async function applySqlFile(sql: postgres.Sql, relativePath: string) {
  const migrationPath = resolve(__dirname, relativePath);
  const migration = readFileSync(migrationPath, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.unsafe(statement);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const [{ hasEquipmentRole }] = await sql<{ hasEquipmentRole: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'equipment_role'
      ) AS "hasEquipmentRole"
    `;

    if (!hasEquipmentRole) {
      console.log("Applying 0007_product_equipment_role.sql...");
      await applySqlFile(sql, "../drizzle/0007_product_equipment_role.sql");
    } else {
      console.log("products.equipment_role already exists — skipping 0007");
    }

    const [{ hasPriceCurrency }] = await sql<{ hasPriceCurrency: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'price_currency_id'
      ) AS "hasPriceCurrency"
    `;

    if (!hasPriceCurrency) {
      console.log("Applying 0008_product_price_currency.sql...");
      await applySqlFile(sql, "../drizzle/0008_product_price_currency.sql");
    } else {
      console.log("products.price_currency_id already exists — skipping 0008");
    }

    console.log("Product currency migrations applied");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
