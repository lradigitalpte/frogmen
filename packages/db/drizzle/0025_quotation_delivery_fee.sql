ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_fee_amount" numeric(18, 2);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_fee_percent" numeric(8, 4);
