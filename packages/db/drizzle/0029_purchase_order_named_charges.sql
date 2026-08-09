DO $$ BEGIN
  CREATE TYPE "purchase_order_charge_scope" AS ENUM('order', 'line');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_charges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "purchase_order_id" uuid NOT NULL,
  "purchase_order_line_id" uuid,
  "name" varchar(100) NOT NULL,
  "amount" numeric(18, 2) NOT NULL,
  "scope" "purchase_order_charge_scope" DEFAULT 'order' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_charges"
    ADD CONSTRAINT "purchase_order_charges_purchase_order_id_purchase_orders_id_fk"
    FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "purchase_order_charges"
    ADD CONSTRAINT "purchase_order_charges_purchase_order_line_id_purchase_order_lines_id_fk"
    FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "target_margin_percent" numeric(8, 4);
--> statement-breakpoint
INSERT INTO "purchase_order_charges" (
  "purchase_order_id",
  "name",
  "amount",
  "scope",
  "sort_order"
)
SELECT
  "id",
  'Other charges',
  "other_charges_amount",
  'order',
  0
FROM "purchase_orders"
WHERE COALESCE("other_charges_amount", 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "purchase_order_charges"
    WHERE "purchase_order_charges"."purchase_order_id" = "purchase_orders"."id"
  );
