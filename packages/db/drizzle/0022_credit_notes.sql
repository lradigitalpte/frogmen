CREATE TABLE IF NOT EXISTS "credit_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL DEFAULT app_current_branch_id() REFERENCES "branches"("id"),
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "currency_id" uuid NOT NULL REFERENCES "currencies"("id"),
  "number" varchar(50) NOT NULL,
  "credit_date" date NOT NULL,
  "reason" text NOT NULL,
  "amount_untaxed" numeric(18,2) NOT NULL,
  "amount_tax" numeric(18,2) NOT NULL,
  "amount_total" numeric(18,2) NOT NULL,
  "amount_total_base" numeric(18,2) NOT NULL,
  "state" varchar(20) DEFAULT 'posted' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "credit_notes_org_branch_number_idx"
  ON "credit_notes" ("organization_id", "branch_id", "number");
CREATE INDEX IF NOT EXISTS "credit_notes_invoice_idx" ON "credit_notes" ("invoice_id");
ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit_notes_scope" ON "credit_notes";
CREATE POLICY "credit_notes_scope" ON "credit_notes"
USING (
  organization_id = app_current_organization_id()
  AND (app_all_branches() OR branch_id = app_current_branch_id())
)
WITH CHECK (
  organization_id = app_current_organization_id()
  AND branch_id = app_current_branch_id()
);
