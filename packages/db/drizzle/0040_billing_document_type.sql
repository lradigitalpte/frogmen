DO $$ BEGIN
  CREATE TYPE "public"."billing_document_type" AS ENUM('tax_invoice', 'commercial_invoice');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "sales_orders"
  ADD COLUMN IF NOT EXISTS "billing_document_type" "billing_document_type" NOT NULL DEFAULT 'tax_invoice';

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "billing_document_type" "billing_document_type" NOT NULL DEFAULT 'tax_invoice';
