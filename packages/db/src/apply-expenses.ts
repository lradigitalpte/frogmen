import postgres from "postgres";

export async function applyExpensesIfNeeded(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'expense_categories'
      ) AS exists
    `;

    if (!exists) {
      await sql`
        CREATE TABLE "expense_categories" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
          "name" varchar(120) NOT NULL,
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now(),
          "deleted_at" timestamptz
        )
      `;
      await sql`
        CREATE UNIQUE INDEX "expense_categories_org_name_idx"
        ON "expense_categories" ("organization_id", lower("name"))
        WHERE "deleted_at" IS NULL
      `;

      await sql`
        CREATE TABLE "expenses" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
          "branch_id" uuid NOT NULL DEFAULT app_current_branch_id() REFERENCES "branches"("id"),
          "account_move_id" uuid NOT NULL REFERENCES "account_moves"("id") ON DELETE restrict,
          "number" varchar(64) NOT NULL,
          "category_id" uuid REFERENCES "expense_categories"("id") ON DELETE set null,
          "description" varchar(500) NOT NULL,
          "reference" varchar(255),
          "receipt_path" varchar(500),
          "amount" numeric(18, 2) NOT NULL,
          "expense_date" date NOT NULL,
          "payment_method" varchar(40) NOT NULL,
          "bank_account_id" uuid REFERENCES "bank_accounts"("id") ON DELETE set null,
          "created_by" text,
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now(),
          "deleted_at" timestamptz
        )
      `;
      await sql`
        CREATE UNIQUE INDEX "expenses_org_number_idx"
        ON "expenses" ("organization_id", "number")
        WHERE "deleted_at" IS NULL
      `;
      await sql`
        CREATE UNIQUE INDEX "expenses_account_move_idx"
        ON "expenses" ("account_move_id")
      `;

      console.log("[db] expenses schema applied");
    }

    await sql`
      INSERT INTO "expenses" (
        "organization_id",
        "branch_id",
        "account_move_id",
        "number",
        "description",
        "reference",
        "amount",
        "expense_date",
        "payment_method",
        "bank_account_id",
        "created_at",
        "updated_at"
      )
      SELECT
        am.organization_id,
        am.branch_id,
        am.id,
        COALESCE(
          CASE
            WHEN NULLIF(TRIM(am.reference), '') IS NULL THEN NULL
            WHEN EXISTS (
              SELECT 1
              FROM expenses e
              WHERE e.organization_id = am.organization_id
                AND e.number = TRIM(am.reference)
                AND e.deleted_at IS NULL
            ) THEN 'LEGACY-' || am.id::text
            ELSE TRIM(am.reference)
          END,
          'LEGACY-' || am.id::text
        ),
        am.name,
        am.reference,
        aml.debit,
        am.move_date,
        CASE WHEN j.code = 'CASH' THEN 'cash' ELSE 'bank_transfer' END,
        am.bank_account_id,
        am.created_at,
        am.updated_at
      FROM account_moves am
      INNER JOIN account_move_lines aml ON aml.move_id = am.id
      INNER JOIN gl_accounts ga ON ga.id = aml.account_id
      INNER JOIN journals j ON j.id = am.journal_id
      WHERE am.state = 'posted'
        AND ga.code = '600000'
        AND aml.debit::numeric > 0
        AND NOT EXISTS (
          SELECT 1 FROM expenses e WHERE e.account_move_id = am.id
        )
      ON CONFLICT ("organization_id", "number") WHERE "deleted_at" IS NULL DO NOTHING
    `;
  } finally {
    await sql.end();
  }
}
