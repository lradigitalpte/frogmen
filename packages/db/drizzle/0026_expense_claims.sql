CREATE TABLE IF NOT EXISTS "expense_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "branch_id" uuid NOT NULL DEFAULT app_current_branch_id() REFERENCES "branches"("id"),
  "number" varchar(64) NOT NULL,
  "submitted_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "category_id" uuid REFERENCES "expense_categories"("id") ON DELETE set null,
  "description" varchar(500) NOT NULL,
  "reference" varchar(255),
  "receipt_path" varchar(500),
  "amount" numeric(18, 2) NOT NULL,
  "expense_date" date NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "submitted_at" timestamptz,
  "reviewed_at" timestamptz,
  "reviewed_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "rejection_reason" text,
  "reimbursed_at" timestamptz,
  "reimbursed_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "payment_method" varchar(40),
  "bank_account_id" uuid REFERENCES "bank_accounts"("id") ON DELETE set null,
  "account_move_id" uuid REFERENCES "account_moves"("id") ON DELETE restrict,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_claims_org_number_idx"
  ON "expense_claims" ("organization_id", "number")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_claims_account_move_idx"
  ON "expense_claims" ("account_move_id")
  WHERE "account_move_id" IS NOT NULL;
