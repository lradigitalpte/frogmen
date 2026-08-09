import postgres from "postgres";

export async function applyDealsIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    // Check if deals table exists
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'deals'
      ) AS exists
    `;

    if (!exists) {
      console.log("Applying deals migration...");

      await sql`
        CREATE TABLE deals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          customer_id UUID NOT NULL REFERENCES customers(id),
          title VARCHAR(200),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX deals_org_customer_idx ON deals(organization_id, customer_id)
      `;

      console.log("deals table created.");
    }

    // Always ensure deal_id column exists on sales_orders (idempotent)
    const [{ hasCol }] = await sql<{ hasCol: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sales_orders'
          AND column_name = 'deal_id'
      ) AS "hasCol"
    `;

    if (!hasCol) {
      await sql`
        ALTER TABLE sales_orders
          ADD COLUMN deal_id UUID REFERENCES deals(id) ON DELETE SET NULL
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS sales_orders_deal_id_idx ON sales_orders(deal_id)
      `;
      console.log("deal_id column added to sales_orders.");
    }

    // Ensure internal_notes column exists on sales_orders and invoices
    await sql`
      ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS internal_notes TEXT;
    `;
    await sql`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT;
    `;

    // Ensure quote_date matches created_at date for revisions
    await sql`
      UPDATE sales_orders
      SET quote_date = DATE(created_at)
      WHERE deal_id IS NOT NULL AND quote_date != DATE(created_at)
    `;
  } finally {
    await sql.end();
  }
}

