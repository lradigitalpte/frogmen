CREATE TYPE "public"."product_equipment_role" AS ENUM('main_equipment', 'component', 'general');
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "equipment_role" "product_equipment_role" DEFAULT 'general' NOT NULL;
