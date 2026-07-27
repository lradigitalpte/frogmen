CREATE TYPE "public"."product_unit_status" AS ENUM('in_stock', 'assigned', 'sold', 'scrapped');
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"serial_number" varchar(150) NOT NULL,
	"parent_unit_id" uuid,
	"status" "product_unit_status" DEFAULT 'in_stock' NOT NULL,
	"linked_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_levels_org_product_warehouse_idx" ON "stock_levels" USING btree ("organization_id","product_id","warehouse_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_units_org_serial_idx" ON "product_units" USING btree ("organization_id","serial_number");
--> statement-breakpoint
CREATE INDEX "stock_levels_organization_id_idx" ON "stock_levels" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "product_units_product_id_idx" ON "product_units" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX "product_units_warehouse_id_idx" ON "product_units" USING btree ("warehouse_id");
--> statement-breakpoint
CREATE INDEX "product_units_parent_unit_id_idx" ON "product_units" USING btree ("parent_unit_id");
