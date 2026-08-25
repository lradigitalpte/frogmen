ALTER TABLE "sales_order_lines" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(18, 2) NOT NULL DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(18, 2) NOT NULL DEFAULT '0';
