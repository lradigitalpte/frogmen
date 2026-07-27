CREATE TYPE "public"."sales_order_state" AS ENUM('draft', 'sent', 'confirmed', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."sales_invoice_status" AS ENUM('none', 'to_invoice', 'invoiced');
--> statement-breakpoint
CREATE TYPE "public"."invoice_state" AS ENUM('draft', 'posted', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."invoice_payment_state" AS ENUM('unpaid', 'partial', 'paid');
--> statement-breakpoint
CREATE TYPE "public"."sales_activity_type" AS ENUM('created', 'updated', 'note', 'sent', 'confirmed', 'cancelled', 'invoiced', 'paid');
--> statement-breakpoint
CREATE TABLE "payment_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"due_days" integer DEFAULT 30 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"number" varchar(50) NOT NULL,
	"state" "sales_order_state" DEFAULT 'draft' NOT NULL,
	"customer_id" uuid NOT NULL,
	"currency_id" uuid NOT NULL,
	"exchange_rate" numeric(18, 8),
	"exchange_rate_locked_at" timestamp with time zone,
	"payment_term_id" uuid,
	"quote_date" date NOT NULL,
	"validity_date" date,
	"customer_reference" varchar(100),
	"internal_reference" varchar(100),
	"payment_reference" varchar(100),
	"notes" text,
	"amount_untaxed" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_untaxed_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_tax_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_total_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"invoice_status" "sales_invoice_status" DEFAULT 'none' NOT NULL,
	"created_by_user_id" text,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"product_id" uuid,
	"product_unit_id" uuid,
	"warehouse_id" uuid,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
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
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"sales_order_id" uuid,
	"number" varchar(50) NOT NULL,
	"state" "invoice_state" DEFAULT 'draft' NOT NULL,
	"payment_state" "invoice_payment_state" DEFAULT 'unpaid' NOT NULL,
	"customer_id" uuid NOT NULL,
	"currency_id" uuid NOT NULL,
	"exchange_rate" numeric(18, 8),
	"exchange_rate_locked_at" timestamp with time zone,
	"payment_term_id" uuid,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"customer_reference" varchar(100),
	"internal_reference" varchar(100),
	"notes" text,
	"amount_untaxed" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_untaxed_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_tax_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount_total_base" numeric(18, 2) DEFAULT '0' NOT NULL,
	"posted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"sales_order_line_id" uuid,
	"line_number" integer NOT NULL,
	"product_id" uuid,
	"product_unit_id" uuid,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_rate_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"price_subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"price_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"price_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency_id" uuid NOT NULL,
	"exchange_rate" numeric(18, 8),
	"payment_date" date NOT NULL,
	"reference" varchar(100),
	"method" varchar(50),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" text,
	"activity_type" "sales_activity_type" NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_payment_term_id_payment_terms_id_fk" FOREIGN KEY ("payment_term_id") REFERENCES "public"."payment_terms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_term_id_payment_terms_id_fk" FOREIGN KEY ("payment_term_id") REFERENCES "public"."payment_terms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_sales_order_line_id_sales_order_lines_id_fk" FOREIGN KEY ("sales_order_line_id") REFERENCES "public"."sales_order_lines"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_units"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_org_number_idx" ON "sales_orders" USING btree ("organization_id","number");
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_idx" ON "invoices" USING btree ("organization_id","number");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_sequences_org_type_idx" ON "document_sequences" USING btree ("organization_id","document_type");
--> statement-breakpoint
CREATE INDEX "sales_orders_organization_id_idx" ON "sales_orders" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "sales_orders_state_idx" ON "sales_orders" USING btree ("state");
--> statement-breakpoint
CREATE INDEX "sales_orders_quote_date_idx" ON "sales_orders" USING btree ("quote_date");
--> statement-breakpoint
CREATE INDEX "invoices_organization_id_idx" ON "invoices" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "sales_activities_entity_idx" ON "sales_activities" USING btree ("entity_type","entity_id");
