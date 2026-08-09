CREATE TYPE "product_cost_event_type" AS ENUM('po_receipt', 'manual_edit', 'invoice_post');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_cost_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "branch_id" uuid NOT NULL DEFAULT app_current_branch_id() REFERENCES "branches"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE cascade,
  "product_unit_id" uuid REFERENCES "product_units"("id") ON DELETE set null,
  "event_type" "product_cost_event_type" NOT NULL,
  "unit_cost" numeric(18, 2) NOT NULL,
  "previous_unit_cost" numeric(18, 2),
  "currency_code" varchar(10),
  "reference_type" varchar(30),
  "reference_id" uuid,
  "reference_label" varchar(100),
  "message" text,
  "metadata" jsonb,
  "user_id" text REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_cost_events_product_idx"
  ON "product_cost_events" ("organization_id", "product_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_cost_events_unit_idx"
  ON "product_cost_events" ("organization_id", "product_unit_id", "created_at" DESC)
  WHERE "product_unit_id" IS NOT NULL;
