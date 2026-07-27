DO $$ BEGIN
  CREATE TYPE "public"."product_usage_type" AS ENUM('for_sale', 'operations');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "usage_type" "product_usage_type" DEFAULT 'for_sale' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_rov_equipment" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "products"
SET "is_rov_equipment" = true
WHERE "equipment_role" IN ('main_equipment', 'component');
