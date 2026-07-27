CREATE TYPE "public"."warranty_registration_status" AS ENUM('active', 'expired', 'voided');
--> statement-breakpoint
CREATE TYPE "public"."warranty_registration_source" AS ENUM('sale', 'manual');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warranty_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" varchar(150) NOT NULL,
  "description" text,
  "duration_months" integer DEFAULT 12 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warranty_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "policy_id" uuid NOT NULL REFERENCES "warranty_policies"("id"),
  "status" "warranty_registration_status" DEFAULT 'active' NOT NULL,
  "source" "warranty_registration_source" DEFAULT 'manual' NOT NULL,
  "starts_at" date NOT NULL,
  "ends_at" date NOT NULL,
  "sold_at" date NOT NULL,
  "product_id" uuid REFERENCES "products"("id") ON DELETE set null,
  "product_unit_id" uuid REFERENCES "product_units"("id") ON DELETE set null,
  "serial_number" varchar(150),
  "product_name" varchar(255),
  "customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "customer_name" varchar(255),
  "quantity" integer DEFAULT 1 NOT NULL,
  "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE set null,
  "invoice_line_id" uuid REFERENCES "invoice_lines"("id") ON DELETE set null,
  "sales_order_line_id" uuid REFERENCES "sales_order_lines"("id") ON DELETE set null,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "default_warranty_policy_id" uuid;
--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD COLUMN IF NOT EXISTS "warranty_policy_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_default_warranty_policy_id_warranty_policies_id_fk"
    FOREIGN KEY ("default_warranty_policy_id") REFERENCES "warranty_policies"("id") ON DELETE set null;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_order_lines"
    ADD CONSTRAINT "sales_order_lines_warranty_policy_id_warranty_policies_id_fk"
    FOREIGN KEY ("warranty_policy_id") REFERENCES "warranty_policies"("id") ON DELETE set null;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
