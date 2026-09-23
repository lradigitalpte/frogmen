import postgres from "postgres";

export async function applyWarrantyDeliveryIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    try {
      await sql.unsafe(
        `ALTER TYPE warranty_registration_status ADD VALUE IF NOT EXISTS 'pending_delivery';`,
      );
    } catch (error) {
      console.log(
        "[db] warranty_registration_status pending_delivery enum:",
        (error as Error).message,
      );
    }

    await sql.unsafe(`
      ALTER TABLE warranty_registrations
      ALTER COLUMN starts_at DROP NOT NULL,
      ALTER COLUMN ends_at DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS delivered_at date,
      ADD COLUMN IF NOT EXISTS delivery_note_id uuid REFERENCES delivery_notes(id) ON DELETE SET NULL;
    `);

    console.log("[db] warranty delivery columns and enum applied");
  } finally {
    await sql.end();
  }
}
