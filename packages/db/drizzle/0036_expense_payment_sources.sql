CREATE TABLE IF NOT EXISTS "expense_payment_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" varchar(120) NOT NULL,
  "last_four" varchar(4),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "expense_payment_sources_org_name_idx"
  ON "expense_payment_sources" ("organization_id", lower("name"))
  WHERE "deleted_at" IS NULL;

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "payment_source_id" uuid
  REFERENCES "expense_payment_sources"("id") ON DELETE set null;
