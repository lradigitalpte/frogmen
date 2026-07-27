import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

export async function applyCreditNotesIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'credit_notes'
      ) AS exists
    `;
    if (!exists) {
      const migration = readFileSync(
        resolve(__dirname, "../drizzle/0022_credit_notes.sql"),
        "utf8",
      );
      await sql.unsafe(migration);
      console.log("[db] credit note tables applied");
    }
    await sql.unsafe(`
      ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "credit_notes" FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "credit_notes_scope" ON "credit_notes";
      CREATE POLICY "credit_notes_scope" ON "credit_notes"
      USING (organization_id = app_current_organization_id() AND (app_all_branches() OR branch_id = app_current_branch_id()))
      WITH CHECK (organization_id = app_current_organization_id() AND branch_id = app_current_branch_id());
    `);
    const [{ hasCancellation }] = await sql<{ hasCancellation: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='invoices' AND column_name='cancelled_at') AS "hasCancellation"
    `;
    if (!hasCancellation) {
      await sql.unsafe(readFileSync(resolve(__dirname, "../drizzle/0023_invoice_cancellation.sql"), "utf8"));
      console.log("[db] invoice cancellation tables applied");
    }
  } finally {
    await sql.end();
  }
}
