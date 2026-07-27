import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

async function tableExists(sql: postgres.Sql, tableName: string) {
  const [{ exists }] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS exists
  `;

  return exists;
}

async function applyMigrationFile(sql: postgres.Sql, fileName: string) {
  const migrationPath = resolve(__dirname, `../drizzle/${fileName}`);
  const migration = readFileSync(migrationPath, "utf8");
  await sql.unsafe(migration);
}

export async function applyPurchasingIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    if (!(await tableExists(sql, "vendors"))) {
      await applyMigrationFile(sql, "0010_purchasing.sql");
      console.log("[db] purchasing tables applied");
    }
  } finally {
    await sql.end();
  }
}
