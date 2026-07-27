CREATE TYPE "public"."vendor_account_type" AS ENUM('individual', 'company');
--> statement-breakpoint
CREATE TYPE "public"."purchase_order_state" AS ENUM('draft', 'confirmed', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."purchase_receipt_status" AS ENUM('none', 'to_receive', 'partial', 'received');
--> statement-breakpoint
CREATE TYPE "public"."goods_receipt_state" AS ENUM('draft', 'done', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."purchase_activity_type" AS ENUM('created', 'updated', 'note', 'confirmed', 'received', 'cancelled');
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"account_type" "vendor_account_type" DEFAULT 'company' NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"mobile" varchar(50),
	"website" varchar(255),
	"tax_id" varchar(100),
	"reference" varchar(100),
	"contact_name" varchar(150),
	"street1" varchar(255),
	"street2" varchar(255),
	"city" varchar(120),
	"zip" varchar(30),
	"country_code" char(2),
	"state_code" varchar(10),
	"default_currency_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"number" varchar(50) NOT NULL,
	"state" "purchase_order_state" DEFAULT 'draft' NOT NULL,
	"receipt_status" "purchase_receipt_status" DEFAULT 'none' NOT NULL,
	"vendor_id" uuid NOT NULL,
	"currency_id" uuid NOT NULL,
	"exchange_rate" numeric(18, 8),
	"exchange_rate_locked_at" timestamp with time zone,
	"order_date" date NOT NULL,
	"expected_date" date,
	"vendor_reference" varchar(100),
	"internal_reference" varchar(100),
	"notes" text,
	"amount_untaxed" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_untaxed_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_tax_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_total_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_by_user_id" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"product_id" uuid,
	"warehouse_id" uuid,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"qty_received" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_rate_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"price_subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"price_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"price_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"number" varchar(50) NOT NULL,
	"state" "goods_receipt_state" DEFAULT 'draft' NOT NULL,
	"receipt_date" date NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"serial_numbers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" text,
	"activity_type" "purchase_activity_type" NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_default_currency_id_currencies_id_fk" FOREIGN KEY ("default_currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_activities" ADD CONSTRAINT "purchase_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_org_number_idx" ON "purchase_orders" USING btree ("organization_id","number");
--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipts_org_number_idx" ON "goods_receipts" USING btree ("organization_id","number");
--> statement-breakpoint
CREATE INDEX "vendors_organization_id_idx" ON "vendors" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "vendors_deleted_at_idx" ON "vendors" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "purchase_orders_organization_id_idx" ON "purchase_orders" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "purchase_orders_vendor_id_idx" ON "purchase_orders" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX "purchase_orders_state_idx" ON "purchase_orders" USING btree ("state");
--> statement-breakpoint
CREATE INDEX "goods_receipts_purchase_order_id_idx" ON "goods_receipts" USING btree ("purchase_order_id");
