ALTER TYPE "public"."sales_order_state" ADD VALUE IF NOT EXISTS 'signed' BEFORE 'confirmed';
--> statement-breakpoint
ALTER TYPE "public"."sales_activity_type" ADD VALUE IF NOT EXISTS 'signed' BEFORE 'confirmed';
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "access_token" varchar(255);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "signed_by" varchar(255);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "signed_on" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "signature_image" text;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "signed_ip" varchar(50);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "signed_email" varchar(320);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "customer_po_document_url" text;
