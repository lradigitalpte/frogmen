import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

export async function applyCustomersIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'customers'
      ) AS exists
    `;

    if (exists) {
      return;
    }

    const migrationPath = resolve(__dirname, "../drizzle/0001_customers.sql");
    const migration = readFileSync(migrationPath, "utf8");
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }

    console.log("[db] customers schema applied");
  } finally {
    await sql.end();
  }
}
