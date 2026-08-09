import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(__dirname, "../../../.env") });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

async function main() {
  const sql = postgres(connectionString!, { max: 1 });

  console.log("Applying quotation signature fields to database...");

  // Add 'signed' value to sales_order_state enum if it exists and doesn't have it
  try {
    await sql.unsafe(`ALTER TYPE sales_order_state ADD VALUE IF NOT EXISTS 'signed' AFTER 'sent';`);
  } catch (e) {
    console.log("Note on sales_order_state enum:", (e as Error).message);
  }

  // Add 'signed' value to sales_activity_type enum if it exists and doesn't have it
  try {
    await sql.unsafe(`ALTER TYPE sales_activity_type ADD VALUE IF NOT EXISTS 'signed' AFTER 'sent';`);
  } catch (e) {
    console.log("Note on sales_activity_type enum:", (e as Error).message);
  }

  // Add columns to sales_orders table
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

  console.log("Quotation signature columns & enums applied successfully!");
  await sql.end();
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
