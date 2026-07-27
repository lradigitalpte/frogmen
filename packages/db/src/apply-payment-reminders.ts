import postgres from "postgres";

export async function applyPaymentRemindersIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'invoices'
      ) AS exists
    `;

    if (!exists) {
      return;
    }

    await sql`
      CREATE TABLE IF NOT EXISTS payment_reminder_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name varchar(160) NOT NULL,
        trigger_condition varchar(255) NOT NULL,
        description text NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS payment_reminder_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        rule_id uuid REFERENCES payment_reminder_rules(id) ON DELETE SET NULL,
        recipient_email varchar(255) NOT NULL,
        custom_message text,
        sent_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS payment_reminder_logs_invoice_id_idx
      ON payment_reminder_logs (invoice_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS payment_reminder_logs_org_sent_at_idx
      ON payment_reminder_logs (organization_id, sent_at)
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE reminder_rule_type AS ENUM ('customer_payment', 'internal_follow_up');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE reminder_trigger_type AS ENUM ('days_before_due', 'days_after_due', 'weekly_digest');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `;

    await sql`
      ALTER TABLE payment_reminder_rules
      ADD COLUMN IF NOT EXISTS rule_type reminder_rule_type NOT NULL DEFAULT 'customer_payment'
    `;

    await sql`
      ALTER TABLE payment_reminder_rules
      ADD COLUMN IF NOT EXISTS trigger_type reminder_trigger_type NOT NULL DEFAULT 'days_after_due'
    `;

    await sql`
      ALTER TABLE payment_reminder_rules
      ADD COLUMN IF NOT EXISTS trigger_days integer
    `;

    await sql`
      ALTER TABLE payment_reminder_rules
      ADD COLUMN IF NOT EXISTS recipient_email varchar(255)
    `;

    await sql`
      ALTER TABLE payment_reminder_rules
      ADD COLUMN IF NOT EXISTS last_run_at timestamptz
    `;

    await sql`
      ALTER TABLE payment_reminder_logs
      ALTER COLUMN invoice_id DROP NOT NULL
    `;

    await sql`
      ALTER TABLE payment_reminder_logs
      ADD COLUMN IF NOT EXISTS subject varchar(255) NOT NULL DEFAULT 'Payment reminder'
    `;

    await sql`
      UPDATE payment_reminder_rules
      SET
        rule_type = 'customer_payment',
        trigger_type = 'days_before_due',
        trigger_days = 3,
        description = 'Auto-sends polite payment reminder email to the customer before due date'
      WHERE name = 'Pre-Due Reminder (3 Days Before)'
    `;

    await sql`
      UPDATE payment_reminder_rules
      SET
        rule_type = 'customer_payment',
        trigger_type = 'days_after_due',
        trigger_days = 1,
        description = 'Auto-sends urgent payment notice to the customer accounts contact'
      WHERE name = 'Urgent Overdue Notice (1 Day After)'
    `;

    await sql`
      UPDATE payment_reminder_rules
      SET
        rule_type = 'internal_follow_up',
        trigger_type = 'weekly_digest',
        trigger_days = NULL,
        description = 'Sends your finance team a summary of overdue invoices to follow up on'
      WHERE name = 'Weekly Finance Receivables Digest'
    `;

    await sql`
      UPDATE payment_reminder_rules
      SET
        name = 'Internal Follow-Up (7 Days Overdue)',
        rule_type = 'internal_follow_up',
        trigger_type = 'days_after_due',
        trigger_days = 7,
        trigger_condition = '7 days after due date',
        description = 'Reminds your team to follow up with the client on overdue invoices',
        enabled = false
      WHERE name = 'Credit Risk Account Escalation'
    `;

    await sql`
      DELETE FROM payment_reminder_logs
      WHERE invoice_id IN (
        SELECT id FROM invoices
        WHERE number IN (
          'INV-2026-089',
          'INV-2026-087',
          'INV-2026-094',
          'INV-2026-098'
        )
      )
    `;

    await sql`
      DELETE FROM invoices
      WHERE number IN (
        'INV-2026-089',
        'INV-2026-087',
        'INV-2026-094',
        'INV-2026-098'
      )
    `;

    console.log("[db] payment reminder tables applied");
  } finally {
    await sql.end();
  }
}
