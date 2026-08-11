import postgres from "postgres";

export async function applyQuotationSignatureFieldsIfNeeded(
  connectionString: string,
) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    try {
      await sql.unsafe(
        `ALTER TYPE sales_order_state ADD VALUE IF NOT EXISTS 'signed' AFTER 'sent';`,
      );
    } catch (error) {
      console.log(
        "[db] sales_order_state signed enum:",
        (error as Error).message,
      );
    }

    try {
      await sql.unsafe(
        `ALTER TYPE sales_activity_type ADD VALUE IF NOT EXISTS 'signed' AFTER 'sent';`,
      );
    } catch (error) {
      console.log(
        "[db] sales_activity_type signed enum:",
        (error as Error).message,
      );
    }

    await sql.unsafe(`
      ALTER TABLE sales_orders
      ADD COLUMN IF NOT EXISTS access_token varchar(255),
      ADD COLUMN IF NOT EXISTS signed_by varchar(255),
      ADD COLUMN IF NOT EXISTS signed_on timestamp with time zone,
      ADD COLUMN IF NOT EXISTS signature_image text,
      ADD COLUMN IF NOT EXISTS signed_ip varchar(50),
      ADD COLUMN IF NOT EXISTS signed_email varchar(320),
      ADD COLUMN IF NOT EXISTS customer_po_document_url text;
    `);

    console.log("[db] quotation signature columns applied");
  } finally {
    await sql.end();
  }
}
