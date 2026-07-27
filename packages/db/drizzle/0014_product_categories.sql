ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_category_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" varchar(120) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_category_catalog_org_name_idx"
  ON "product_category_catalog" ("organization_id", lower("name"))
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_category_id_product_category_catalog_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "product_category_catalog"("id") ON DELETE set null;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
