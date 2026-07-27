CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"street1" varchar(255),
	"city" varchar(120),
	"zip" varchar(30),
	"country_code" char(2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_org_code_idx" ON "warehouses" USING btree ("organization_id","code");
--> statement-breakpoint
CREATE INDEX "warehouses_organization_id_idx" ON "warehouses" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "warehouses_deleted_at_idx" ON "warehouses" USING btree ("deleted_at");
