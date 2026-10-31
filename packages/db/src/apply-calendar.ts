import postgres from "postgres";

export async function applyCalendarIfNeeded(connectionString: string) {
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

    // "Member since" defaults to the record's creation date and can be edited.
    await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS member_since date`;
    await sql`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS member_since date`;
    await sql`
      UPDATE customers SET member_since = created_at::date
      WHERE member_since IS NULL
    `;
    await sql`
      UPDATE vendors SET member_since = created_at::date
      WHERE member_since IS NULL
    `;
    await sql`ALTER TABLE customers ALTER COLUMN member_since SET DEFAULT CURRENT_DATE`;
    await sql`ALTER TABLE vendors ALTER COLUMN member_since SET DEFAULT CURRENT_DATE`;

    await sql`
      DO $$ BEGIN
        CREATE TYPE calendar_event_category AS ENUM (
          'meeting', 'reminder', 'deadline', 'follow_up', 'holiday', 'other'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS calendar_settings (
        organization_id text PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
        tracked_countries jsonb NOT NULL DEFAULT '[]'::jsonb,
        reminders_enabled boolean NOT NULL DEFAULT true,
        reminder_emails text,
        digest_lookahead_days integer NOT NULL DEFAULT 3,
        digest_hour integer NOT NULL DEFAULT 7,
        include_deliveries boolean NOT NULL DEFAULT true,
        include_anniversaries boolean NOT NULL DEFAULT true,
        include_holidays boolean NOT NULL DEFAULT true,
        include_invoices boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        title varchar(255) NOT NULL,
        description text,
        category calendar_event_category NOT NULL DEFAULT 'other',
        start_date date NOT NULL,
        end_date date,
        start_time varchar(5),
        end_time varchar(5),
        customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
        vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
        reminder_days_before integer,
        reminder_emails text,
        created_by_user_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS calendar_events_org_start_idx
      ON calendar_events (organization_id, start_date)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS calendar_reminder_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        reminder_key varchar(255) NOT NULL,
        recipient_email text NOT NULL,
        subject varchar(255) NOT NULL,
        sent_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS calendar_reminder_logs_org_key_idx
      ON calendar_reminder_logs (organization_id, reminder_key)
    `;

    console.log("[db] calendar tables applied");
  } finally {
    await sql.end();
  }
}
