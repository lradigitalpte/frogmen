import postgres from "postgres";

export async function applyCustomerCreditIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'customers'
      ) AS exists
    `;

    if (!exists) {
      return;
    }

    await sql`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS credit_limit numeric(18, 2) NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS credit_approved boolean NOT NULL DEFAULT false
    `;

    console.log("[db] customer credit columns applied");
  } finally {
    await sql.end();
  }
}
