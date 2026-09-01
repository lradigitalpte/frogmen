import postgres from "postgres";

export async function applyCompanyVaultIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    // Check if company_vault_folders table exists
    const [{ foldersExists }] = await sql<{ foldersExists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'company_vault_folders'
      ) AS "foldersExists"
    `;

    if (!foldersExists) {
      console.log("[db] Creating company_vault_folders table...");

      await sql`
        CREATE TABLE company_vault_folders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          color VARCHAR(50) NOT NULL DEFAULT 'amber',
          parent_folder_id UUID,
          created_by VARCHAR(255),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS company_vault_folders_org_idx ON company_vault_folders(organization_id);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS company_vault_folders_parent_idx ON company_vault_folders(organization_id, parent_folder_id);
      `;

      console.log("[db] company_vault_folders table created.");
    }

    // Check if company_vault_files table exists
    const [{ filesExists }] = await sql<{ filesExists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'company_vault_files'
      ) AS "filesExists"
    `;

    if (!filesExists) {
      console.log("[db] Creating company_vault_files table...");

      await sql`
        CREATE TABLE company_vault_files (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          folder_id UUID,
          name VARCHAR(255) NOT NULL,
          size_bytes BIGINT NOT NULL DEFAULT 0,
          mime_type VARCHAR(150) NOT NULL,
          category VARCHAR(50) NOT NULL DEFAULT 'document',
          s3_key TEXT NOT NULL,
          uploaded_by VARCHAR(255),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS company_vault_files_org_idx ON company_vault_files(organization_id);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS company_vault_files_folder_idx ON company_vault_files(organization_id, folder_id);
      `;

      console.log("[db] company_vault_files table created.");
    }
  } finally {
    await sql.end();
  }
}
