DO $$ BEGIN
  CREATE TYPE "public"."account_type" AS ENUM(
    'asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current',
    'asset_prepayments', 'asset_fixed', 'liability_payable', 'liability_credit_card',
    'liability_current', 'liability_non_current', 'equity', 'equity_unaffected',
    'income', 'income_other', 'expense', 'expense_depreciation', 'expense_direct_cost', 'off_balance'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."journal_type" AS ENUM('sale', 'purchase', 'bank', 'cash', 'credit', 'general');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."account_move_state" AS ENUM('draft', 'posted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "public"."sales_invoice_status" ADD VALUE IF NOT EXISTS 'partial';

ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "cost_amount" numeric(18, 2);
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "cost_amount_base" numeric(18, 2);

CREATE TABLE IF NOT EXISTS "gl_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL,
  "code" varchar(32) NOT NULL,
  "name" varchar(255) NOT NULL,
  "account_type" "account_type" NOT NULL,
  "is_active" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "journals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL,
  "code" varchar(32) NOT NULL,
  "name" varchar(255) NOT NULL,
  "journal_type" "journal_type" NOT NULL,
  "default_account_id" uuid,
  "is_active" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "account_moves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL,
  "journal_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "reference" varchar(255),
  "state" "account_move_state" DEFAULT 'draft' NOT NULL,
  "move_date" date NOT NULL,
  "invoice_id" uuid,
  "payment_id" uuid,
  "posted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "account_move_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "move_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "customer_id" uuid,
  "label" varchar(500) NOT NULL,
  "debit" numeric(18, 2) DEFAULT '0' NOT NULL,
  "credit" numeric(18, 2) DEFAULT '0' NOT NULL,
  "line_number" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "journals" ADD CONSTRAINT "journals_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "journals" ADD CONSTRAINT "journals_default_account_id_gl_accounts_id_fk"
    FOREIGN KEY ("default_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "account_moves" ADD CONSTRAINT "account_moves_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "account_moves" ADD CONSTRAINT "account_moves_journal_id_journals_id_fk"
    FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "account_moves" ADD CONSTRAINT "account_moves_invoice_id_invoices_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "account_moves" ADD CONSTRAINT "account_moves_payment_id_invoice_payments_id_fk"
    FOREIGN KEY ("payment_id") REFERENCES "public"."invoice_payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "account_move_lines" ADD CONSTRAINT "account_move_lines_move_id_account_moves_id_fk"
    FOREIGN KEY ("move_id") REFERENCES "public"."account_moves"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "account_move_lines" ADD CONSTRAINT "account_move_lines_account_id_gl_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "account_move_lines" ADD CONSTRAINT "account_move_lines_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "gl_accounts_org_code_idx" ON "gl_accounts" ("organization_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "journals_org_code_idx" ON "journals" ("organization_id", "code");
