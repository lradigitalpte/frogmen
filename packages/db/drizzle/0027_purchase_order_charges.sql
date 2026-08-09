ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "freight_amount" numeric(18, 2);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "freight_percent" numeric(8, 4);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "other_charges_amount" numeric(18, 2) DEFAULT '0' NOT NULL;
