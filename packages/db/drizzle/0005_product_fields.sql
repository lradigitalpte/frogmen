ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "images" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_storable" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "volume" numeric(18, 4);
