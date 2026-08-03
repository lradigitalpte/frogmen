import postgres from "postgres";

export async function applyBankAccountsIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'bank_accounts'
      ) AS exists
    `;

    if (!exists) {
      await sql`
        CREATE TABLE "bank_accounts" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
          "name" varchar(160) NOT NULL,
          "bank_name" varchar(160),
          "account_number" varchar(64),
          "iban" varchar(64),
          "swift_code" varchar(32),
          "currency_id" uuid NOT NULL REFERENCES "currencies"("id"),
          "gl_account_id" uuid NOT NULL REFERENCES "gl_accounts"("id") ON DELETE restrict,
          "is_active" boolean NOT NULL DEFAULT true,
          "is_default" boolean NOT NULL DEFAULT false,
          "show_on_documents" boolean NOT NULL DEFAULT true,
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE UNIQUE INDEX "bank_accounts_org_name_uidx"
        ON "bank_accounts" ("organization_id", "name")
      `;
      await sql`
        CREATE INDEX "bank_accounts_organization_idx"
        ON "bank_accounts" ("organization_id")
      `;
      await sql`
        CREATE INDEX "bank_accounts_gl_account_idx"
        ON "bank_accounts" ("gl_account_id")
      `;

      await sql`
        CREATE TABLE "bank_account_branches" (
          "bank_account_id" uuid NOT NULL REFERENCES "bank_accounts"("id") ON DELETE cascade,
          "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE cascade,
          "created_at" timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE UNIQUE INDEX "bank_account_branches_uidx"
        ON "bank_account_branches" ("bank_account_id", "branch_id")
      `;
      await sql`
        CREATE INDEX "bank_account_branches_branch_idx"
        ON "bank_account_branches" ("branch_id")
      `;

      console.log("[db] bank_accounts schema applied");
    }

    const [{ paymentColumn }] = await sql<{ paymentColumn: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'invoice_payments'
          AND column_name = 'bank_account_id'
      ) AS "paymentColumn"
    `;

    if (!paymentColumn) {
      await sql`
        ALTER TABLE "invoice_payments"
        ADD COLUMN "bank_account_id" uuid REFERENCES "bank_accounts"("id") ON DELETE set null
      `;
      console.log("[db] invoice_payments.bank_account_id column applied");
    }

    const [{ moveColumn }] = await sql<{ moveColumn: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'account_moves'
          AND column_name = 'bank_account_id'
      ) AS "moveColumn"
    `;

    if (!moveColumn) {
      await sql`
        ALTER TABLE "account_moves"
        ADD COLUMN "bank_account_id" uuid REFERENCES "bank_accounts"("id") ON DELETE set null
      `;
      console.log("[db] account_moves.bank_account_id column applied");
    }
  } finally {
    await sql.end();
  }
}
