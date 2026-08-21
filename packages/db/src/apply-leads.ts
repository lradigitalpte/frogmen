import postgres from "postgres";

export async function applyLeadsIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    // Check if leads table exists
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'leads'
      ) AS exists
    `;

    if (!exists) {
      console.log("[db] Applying leads migration...");

      // Create ENUM types safely if they don't exist
      await sql`
        DO $$ BEGIN
          CREATE TYPE lead_source AS ENUM (
            'website', 'google_ads', 'organic_search', 'linkedin', 'referral',
            'cold_outreach', 'event', 'partner', 'direct_call', 'other'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await sql`
        DO $$ BEGIN
          CREATE TYPE lead_stage AS ENUM (
            'new', 'contacted', 'qualified', 'proposal', 'won', 'lost'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await sql`
        DO $$ BEGIN
          CREATE TYPE lead_contact_status AS ENUM (
            'not_contacted', 'attempted', 'contacted', 'meeting_scheduled', 'proposal_sent', 'unresponsive'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      await sql`
        DO $$ BEGIN
          CREATE TYPE lead_priority AS ENUM ('hot', 'warm', 'cold');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `;

      // Create leads table
      await sql`
        CREATE TABLE leads (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          company VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50),
          job_title VARCHAR(150),
          lead_source lead_source NOT NULL DEFAULT 'website',
          source_details TEXT,
          contact_status lead_contact_status NOT NULL DEFAULT 'not_contacted',
          contacted BOOLEAN NOT NULL DEFAULT false,
          last_contacted_at TIMESTAMPTZ,
          last_contact_method VARCHAR(50),
          stage lead_stage NOT NULL DEFAULT 'new',
          priority lead_priority NOT NULL DEFAULT 'warm',
          estimated_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
          score INTEGER NOT NULL DEFAULT 60,
          assigned_to_name VARCHAR(150),
          notes TEXT,
          next_follow_up TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          deleted_at TIMESTAMPTZ
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS leads_org_idx ON leads(organization_id);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS leads_stage_idx ON leads(organization_id, stage);
      `;

      console.log("[db] leads table created.");
    }

    // Check if lead_communication_logs table exists
    const [{ logsExists }] = await sql<{ logsExists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'lead_communication_logs'
      ) AS "logsExists"
    `;

    if (!logsExists) {
      console.log("[db] Creating lead_communication_logs table...");

      await sql`
        CREATE TABLE lead_communication_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          author VARCHAR(150) NOT NULL,
          summary TEXT NOT NULL,
          outcome TEXT,
          date TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS lead_logs_lead_idx ON lead_communication_logs(lead_id);
      `;

      console.log("[db] lead_communication_logs table created.");
    }
  } finally {
    await sql.end();
  }
}
