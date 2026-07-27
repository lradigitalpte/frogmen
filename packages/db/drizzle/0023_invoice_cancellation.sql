ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancellation_return_to_stock" boolean DEFAULT false NOT NULL;
ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "return_to_stock" boolean DEFAULT false NOT NULL;
ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "refund_due" numeric(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "refund_paid" numeric(18,2) DEFAULT 0 NOT NULL;
CREATE TABLE IF NOT EXISTS "customer_refunds" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "branch_id" uuid NOT NULL DEFAULT app_current_branch_id() REFERENCES "branches"("id"), "credit_note_id" uuid NOT NULL REFERENCES "credit_notes"("id"),
 "invoice_id" uuid NOT NULL REFERENCES "invoices"("id"), "currency_id" uuid NOT NULL REFERENCES "currencies"("id"),
 "amount" numeric(18,2) NOT NULL, "exchange_rate" numeric(18,8) NOT NULL, "refund_date" date NOT NULL,
 "method" varchar(50) NOT NULL, "reference" varchar(100), "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "invoice_notifications" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "branch_id" uuid NOT NULL DEFAULT app_current_branch_id() REFERENCES "branches"("id"), "invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
 "credit_note_id" uuid REFERENCES "credit_notes"("id"), "recipient_email" varchar(320) NOT NULL, "subject" varchar(255) NOT NULL,
 "body" text NOT NULL, "delivery_status" varchar(30) NOT NULL, "sent_at" timestamptz, "created_at" timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE "account_moves" ADD COLUMN IF NOT EXISTS "refund_id" uuid REFERENCES "customer_refunds"("id");
ALTER TABLE "customer_refunds" ENABLE ROW LEVEL SECURITY; ALTER TABLE "customer_refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY "customer_refunds_scope" ON "customer_refunds" USING (organization_id = app_current_organization_id() AND (app_all_branches() OR branch_id = app_current_branch_id())) WITH CHECK (organization_id = app_current_organization_id() AND branch_id = app_current_branch_id());
ALTER TABLE "invoice_notifications" ENABLE ROW LEVEL SECURITY; ALTER TABLE "invoice_notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "invoice_notifications_scope" ON "invoice_notifications" USING (organization_id = app_current_organization_id() AND (app_all_branches() OR branch_id = app_current_branch_id())) WITH CHECK (organization_id = app_current_organization_id() AND branch_id = app_current_branch_id());
