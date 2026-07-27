-- Fresh databases reach branch security before the runtime compatibility
-- helper creates payment-reminder tables. Define their transactional roots
-- here so branch columns, backfill, and RLS are applied consistently.
CREATE TABLE IF NOT EXISTS "payment_reminder_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" varchar(160) NOT NULL,
  "trigger_condition" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "payment_reminder_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE cascade,
  "rule_id" uuid REFERENCES "payment_reminder_rules"("id") ON DELETE set null,
  "recipient_email" varchar(255) NOT NULL,
  "custom_message" text,
  "sent_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "payment_reminder_logs_invoice_id_idx"
  ON "payment_reminder_logs" ("invoice_id");
CREATE INDEX IF NOT EXISTS "payment_reminder_logs_org_sent_at_idx"
  ON "payment_reminder_logs" ("organization_id", "sent_at");

CREATE TABLE IF NOT EXISTS "branches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" varchar(160) NOT NULL,
  "code" varchar(24) NOT NULL,
  "document_prefix" varchar(16) NOT NULL,
  "street1" varchar(255),
  "street2" varchar(255),
  "city" varchar(120),
  "zip" varchar(30),
  "country_code" char(2),
  "timezone" varchar(80) NOT NULL DEFAULT 'UTC',
  "is_main" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "branches_org_code_uidx"
  ON "branches" ("organization_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "branches_one_main_per_org_uidx"
  ON "branches" ("organization_id") WHERE "is_main";
CREATE INDEX IF NOT EXISTS "branches_organization_idx"
  ON "branches" ("organization_id");

INSERT INTO "branches" (
  "organization_id", "name", "code", "document_prefix", "is_main"
)
SELECT "id", 'Main Branch', 'MAIN', 'MAIN', true
FROM "organizations"
ON CONFLICT ("organization_id", "code") DO NOTHING;

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "active_branch_id" uuid REFERENCES "branches"("id"),
  ADD COLUMN IF NOT EXISTS "branch_scope" text NOT NULL DEFAULT 'single';

ALTER TABLE "members" ALTER COLUMN "role" SET DEFAULT 'staff';
UPDATE "members" SET "role" = 'staff' WHERE "role" = 'member';
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_role_check";
ALTER TABLE "members" ADD CONSTRAINT "members_role_check"
  CHECK ("role" IN ('owner', 'admin', 'manager', 'accountant', 'staff', 'viewer'));
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_branch_scope_check";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_branch_scope_check"
  CHECK ("branch_scope" IN ('single', 'all'));

CREATE TABLE IF NOT EXISTS "branch_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE cascade,
  "member_id" text NOT NULL REFERENCES "members"("id") ON DELETE cascade,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "branch_members_branch_member_uidx"
  ON "branch_members" ("branch_id", "member_id");
CREATE INDEX IF NOT EXISTS "branch_members_member_idx"
  ON "branch_members" ("member_id");

CREATE TABLE IF NOT EXISTS "invitation_branches" (
  "invitation_id" text NOT NULL REFERENCES "invitations"("id") ON DELETE cascade,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE cascade,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "invitation_branches_uidx" UNIQUE ("invitation_id", "branch_id")
);

CREATE OR REPLACE FUNCTION assign_invited_member_branches()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "branch_members" ("branch_id", "member_id", "is_primary")
  SELECT ib."branch_id", NEW."id", row_number() over (order by ib."branch_id") = 1
  FROM "users" u
  JOIN "invitations" i
    ON lower(i."email") = lower(u."email")
    AND i."organization_id" = NEW."organization_id"
  JOIN "invitation_branches" ib ON ib."invitation_id" = i."id"
  WHERE u."id" = NEW."user_id"
    AND i."status" IN ('pending', 'accepted')
  ON CONFLICT ("branch_id", "member_id") DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM "branch_members" bm WHERE bm."member_id" = NEW."id"
  ) THEN
    INSERT INTO "branch_members" ("branch_id", "member_id", "is_primary")
    SELECT b."id", NEW."id", true
    FROM "branches" b
    WHERE b."organization_id" = NEW."organization_id" AND b."is_main" = true
    ON CONFLICT ("branch_id", "member_id") DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS "members_assign_invited_branches" ON "members";
CREATE TRIGGER "members_assign_invited_branches"
AFTER INSERT ON "members"
FOR EACH ROW EXECUTE FUNCTION assign_invited_member_branches();

INSERT INTO "branch_members" ("branch_id", "member_id", "is_primary")
SELECT b."id", m."id", true
FROM "members" m
JOIN "branches" b
  ON b."organization_id" = m."organization_id" AND b."is_main" = true
ON CONFLICT ("branch_id", "member_id") DO NOTHING;

UPDATE "sessions" s
SET "active_branch_id" = b."id"
FROM "branches" b
WHERE b."organization_id" = s."active_organization_id"
  AND b."is_main" = true
  AND s."active_branch_id" IS NULL;

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "branch_id" uuid REFERENCES "branches"("id") ON DELETE set null,
  "user_id" text REFERENCES "users"("id") ON DELETE set null,
  "action" varchar(80) NOT NULL,
  "resource" varchar(80) NOT NULL,
  "record_id" text,
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "ip_address" varchar(45),
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_logs_org_created_idx"
  ON "audit_logs" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_branch_idx" ON "audit_logs" ("branch_id");
CREATE INDEX IF NOT EXISTS "audit_logs_user_idx" ON "audit_logs" ("user_id");

ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "invoice_payments" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "sales_activities" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "document_sequences" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "payment_reminder_rules" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "payment_reminder_logs" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "purchase_activities" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "journals" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "account_moves" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "rov_projects" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "inspection_reports" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");
ALTER TABLE "warranty_registrations" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'warehouses', 'sales_orders', 'invoices', 'invoice_payments',
    'sales_activities', 'document_sequences', 'payment_reminder_rules',
    'payment_reminder_logs', 'purchase_orders', 'goods_receipts',
    'purchase_activities', 'journals', 'account_moves', 'rov_projects',
    'inspection_reports', 'warranty_registrations'
  ]
  LOOP
    EXECUTE format(
      'UPDATE %I t SET branch_id = b.id FROM branches b WHERE b.organization_id = t.organization_id AND b.is_main = true AND t.branch_id IS NULL',
      target_table
    );
    EXECUTE format('ALTER TABLE %I ALTER COLUMN branch_id SET NOT NULL', target_table);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "public_report_by_hash" ON "inspection_reports";
CREATE POLICY "public_report_by_hash" ON "inspection_reports"
  FOR SELECT USING (
    "shared_link_hash" = nullif(current_setting('app.share_hash', true), '')
    AND ("shared_link_expires_at" IS NULL OR "shared_link_expires_at" > now())
  );
DROP POLICY IF EXISTS "public_project_by_report" ON "rov_projects";
CREATE POLICY "public_project_by_report" ON "rov_projects"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "inspection_reports" r
      WHERE r."rov_project_id" = "rov_projects"."id"
        AND r."shared_link_hash" = nullif(current_setting('app.share_hash', true), '')
        AND (r."shared_link_expires_at" IS NULL OR r."shared_link_expires_at" > now())
    )
  );

DROP INDEX IF EXISTS "sales_orders_org_number_idx";
CREATE UNIQUE INDEX "sales_orders_org_number_idx"
  ON "sales_orders" ("organization_id", "branch_id", "number");
DROP INDEX IF EXISTS "invoices_org_number_idx";
CREATE UNIQUE INDEX "invoices_org_number_idx"
  ON "invoices" ("organization_id", "branch_id", "number");
DROP INDEX IF EXISTS "purchase_orders_org_number_idx";
CREATE UNIQUE INDEX "purchase_orders_org_number_idx"
  ON "purchase_orders" ("organization_id", "branch_id", "number");
DROP INDEX IF EXISTS "goods_receipts_org_number_idx";
CREATE UNIQUE INDEX "goods_receipts_org_number_idx"
  ON "goods_receipts" ("organization_id", "branch_id", "number");
DROP INDEX IF EXISTS "document_sequences_org_type_idx";
CREATE UNIQUE INDEX "document_sequences_org_type_idx"
  ON "document_sequences" ("organization_id", "branch_id", "document_type");
DROP INDEX IF EXISTS "journals_org_code_idx";
CREATE UNIQUE INDEX "journals_org_code_idx"
  ON "journals" ("organization_id", "branch_id", "code");

CREATE OR REPLACE FUNCTION app_current_organization_id()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')
$$;
CREATE OR REPLACE FUNCTION app_current_branch_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.branch_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION app_all_branches()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.all_branches', true), '')::boolean, false)
$$;

ALTER TABLE "warehouses" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "sales_orders" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "invoices" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "invoice_payments" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "sales_activities" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "document_sequences" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "payment_reminder_rules" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "payment_reminder_logs" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "purchase_orders" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "goods_receipts" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "purchase_activities" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "journals" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "account_moves" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "rov_projects" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "inspection_reports" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();
ALTER TABLE "warranty_registrations" ALTER COLUMN "branch_id" SET DEFAULT app_current_branch_id();

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'warehouses', 'sales_orders', 'invoices', 'invoice_payments',
    'sales_activities', 'document_sequences', 'payment_reminder_rules',
    'payment_reminder_logs', 'purchase_orders', 'goods_receipts',
    'purchase_activities', 'journals', 'account_moves', 'rov_projects',
    'inspection_reports', 'warranty_registrations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS branch_isolation ON %I', target_table);
    EXECUTE format(
      'CREATE POLICY branch_isolation ON %I USING (organization_id = app_current_organization_id() AND (app_all_branches() OR branch_id = app_current_branch_id())) WITH CHECK (organization_id = app_current_organization_id() AND branch_id = app_current_branch_id())',
      target_table
    );
  END LOOP;
END $$;

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_isolation" ON "audit_logs";
CREATE POLICY "audit_log_isolation" ON "audit_logs"
  USING (
    "organization_id" = app_current_organization_id()
    AND (app_all_branches() OR "branch_id" IS NULL OR "branch_id" = app_current_branch_id())
  )
  WITH CHECK (
    "organization_id" = app_current_organization_id()
    AND ("branch_id" IS NULL OR "branch_id" = app_current_branch_id())
  );

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END
$$;
DROP TRIGGER IF EXISTS "audit_logs_immutable" ON "audit_logs";
CREATE TRIGGER "audit_logs_immutable"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

ALTER TABLE "stock_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_levels" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_branch_isolation" ON "stock_levels";
CREATE POLICY "stock_branch_isolation" ON "stock_levels"
  USING (
    "organization_id" = app_current_organization_id()
    AND EXISTS (
      SELECT 1 FROM "warehouses" w
      WHERE w."id" = "stock_levels"."warehouse_id"
        AND (app_all_branches() OR w."branch_id" = app_current_branch_id())
    )
  )
  WITH CHECK (
    "organization_id" = app_current_organization_id()
    AND EXISTS (
      SELECT 1 FROM "warehouses" w
      WHERE w."id" = "stock_levels"."warehouse_id"
        AND w."branch_id" = app_current_branch_id()
    )
  );

ALTER TABLE "product_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_units" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_unit_branch_isolation" ON "product_units";
CREATE POLICY "product_unit_branch_isolation" ON "product_units"
  USING (
    "organization_id" = app_current_organization_id()
    AND EXISTS (
      SELECT 1 FROM "warehouses" w
      WHERE w."id" = "product_units"."warehouse_id"
        AND (app_all_branches() OR w."branch_id" = app_current_branch_id())
    )
  )
  WITH CHECK (
    "organization_id" = app_current_organization_id()
    AND EXISTS (
      SELECT 1 FROM "warehouses" w
      WHERE w."id" = "product_units"."warehouse_id"
        AND w."branch_id" = app_current_branch_id()
    )
  );

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'customers', 'vendors', 'products', 'product_tag_catalog',
    'product_category_catalog', 'warranty_policies', 'gl_accounts',
    'payment_terms'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS organization_isolation ON %I', target_table);
    EXECUTE format(
      'CREATE POLICY organization_isolation ON %I USING (organization_id = app_current_organization_id()) WITH CHECK (organization_id = app_current_organization_id())',
      target_table
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "public_customer_by_report" ON "customers";
CREATE POLICY "public_customer_by_report" ON "customers"
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM "rov_projects" p
      JOIN "inspection_reports" r ON r."rov_project_id" = p."id"
      WHERE p."customer_id" = "customers"."id"
        AND r."shared_link_hash" = nullif(current_setting('app.share_hash', true), '')
        AND (r."shared_link_expires_at" IS NULL OR r."shared_link_expires_at" > now())
    )
  );

ALTER TABLE "sales_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_order_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_order_line_isolation" ON "sales_order_lines";
CREATE POLICY "sales_order_line_isolation" ON "sales_order_lines"
  USING (EXISTS (
    SELECT 1 FROM "sales_orders" p WHERE p."id" = "sales_order_lines"."sales_order_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "sales_orders" p WHERE p."id" = "sales_order_lines"."sales_order_id"
  ));

ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_line_isolation" ON "invoice_lines";
CREATE POLICY "invoice_line_isolation" ON "invoice_lines"
  USING (EXISTS (
    SELECT 1 FROM "invoices" p WHERE p."id" = "invoice_lines"."invoice_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "invoices" p WHERE p."id" = "invoice_lines"."invoice_id"
  ));

ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_order_line_isolation" ON "purchase_order_lines";
CREATE POLICY "purchase_order_line_isolation" ON "purchase_order_lines"
  USING (EXISTS (
    SELECT 1 FROM "purchase_orders" p
    WHERE p."id" = "purchase_order_lines"."purchase_order_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "purchase_orders" p
    WHERE p."id" = "purchase_order_lines"."purchase_order_id"
  ));

ALTER TABLE "goods_receipt_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipt_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "goods_receipt_line_isolation" ON "goods_receipt_lines";
CREATE POLICY "goods_receipt_line_isolation" ON "goods_receipt_lines"
  USING (EXISTS (
    SELECT 1 FROM "goods_receipts" p
    WHERE p."id" = "goods_receipt_lines"."goods_receipt_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "goods_receipts" p
    WHERE p."id" = "goods_receipt_lines"."goods_receipt_id"
  ));

ALTER TABLE "account_move_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_move_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_move_line_isolation" ON "account_move_lines";
CREATE POLICY "account_move_line_isolation" ON "account_move_lines"
  USING (EXISTS (
    SELECT 1 FROM "account_moves" p WHERE p."id" = "account_move_lines"."move_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "account_moves" p WHERE p."id" = "account_move_lines"."move_id"
  ));

ALTER TABLE "project_structures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_structures" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_structure_isolation" ON "project_structures";
CREATE POLICY "project_structure_isolation" ON "project_structures"
  USING (EXISTS (
    SELECT 1 FROM "rov_projects" p
    WHERE p."id" = "project_structures"."rov_project_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "rov_projects" p
    WHERE p."id" = "project_structures"."rov_project_id"
  ));

ALTER TABLE "inspection_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspection_views" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inspection_view_isolation" ON "inspection_views";
CREATE POLICY "inspection_view_isolation" ON "inspection_views"
  USING (EXISTS (
    SELECT 1 FROM "project_structures" p
    WHERE p."id" = "inspection_views"."structure_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "project_structures" p
    WHERE p."id" = "inspection_views"."structure_id"
  ));

ALTER TABLE "inspection_points" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspection_points" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inspection_point_isolation" ON "inspection_points";
CREATE POLICY "inspection_point_isolation" ON "inspection_points"
  USING (EXISTS (
    SELECT 1 FROM "inspection_views" p
    WHERE p."id" = "inspection_points"."inspection_view_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "inspection_views" p
    WHERE p."id" = "inspection_points"."inspection_view_id"
  ));

ALTER TABLE "inspection_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspection_media" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inspection_media_isolation" ON "inspection_media";
CREATE POLICY "inspection_media_isolation" ON "inspection_media"
  USING (EXISTS (
    SELECT 1 FROM "project_structures" p
    WHERE p."id" = "inspection_media"."structure_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "project_structures" p
    WHERE p."id" = "inspection_media"."structure_id"
  ));

ALTER TABLE "report_access_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_access_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_access_log_isolation" ON "report_access_logs";
CREATE POLICY "report_access_log_isolation" ON "report_access_logs"
  USING (EXISTS (
    SELECT 1 FROM "inspection_reports" p
    WHERE p."id" = "report_access_logs"."report_id"
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "inspection_reports" p
    WHERE p."id" = "report_access_logs"."report_id"
  ));
