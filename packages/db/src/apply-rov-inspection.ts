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
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.unsafe(statement);
  }
}

export async function applyRovInspectionIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    if (!(await tableExists(sql, "rov_projects"))) {
      await applyMigrationFile(sql, "0016_rov_inspection.sql");
      console.log("[db] ROV inspection schema applied");
    }

    const [{ hasSiteMap }] = await sql<{ hasSiteMap: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rov_projects'
          AND column_name = 'site_map_path'
      ) AS "hasSiteMap"
    `;

    if (!hasSiteMap) {
      await applyMigrationFile(sql, "0017_rov_site_map.sql");
      console.log("[db] ROV site map column applied");
    }
  } finally {
    await sql.end();
  }
}
