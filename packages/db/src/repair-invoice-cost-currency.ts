import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(__dirname, "../../../.env") });

const invoiceNumber = process.argv[2];
if (!invoiceNumber) {
  throw new Error("Usage: tsx src/repair-invoice-cost-currency.ts <invoice-number>");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const result = await sql.begin(async (tx) => {
      const [invoice] = await tx<{
        id: string;
        organizationId: string;
        branchId: string;
        invoiceDate: string;
      }[]>`
        SELECT id, organization_id AS "organizationId", branch_id AS "branchId",
               invoice_date AS "invoiceDate"
        FROM invoices
        WHERE number = ${invoiceNumber}
        LIMIT 1
      `;
      if (!invoice) throw new Error(`Invoice ${invoiceNumber} was not found`);

      const [expected] = await tx<{ total: string }[]>`
        SELECT COALESCE(SUM(
          il.quantity::numeric * p.cost_price::numeric *
          CASE
            WHEN COALESCE(p.price_currency_id, (o.metadata::jsonb ->> 'catalogCurrencyId')::uuid, o.base_currency_id) = o.base_currency_id
              THEN 1
            ELSE COALESCE(
              (
                SELECT er.rate::numeric
                FROM exchange_rates er
                WHERE er.organization_id = i.organization_id
                  AND er.from_currency_id = COALESCE(p.price_currency_id, (o.metadata::jsonb ->> 'catalogCurrencyId')::uuid, o.base_currency_id)
                  AND er.to_currency_id = o.base_currency_id
                  AND er.effective_date <= i.invoice_date
                ORDER BY er.effective_date DESC
                LIMIT 1
              ),
              1 / NULLIF((
                SELECT er.rate::numeric
                FROM exchange_rates er
                WHERE er.organization_id = i.organization_id
                  AND er.from_currency_id = o.base_currency_id
                  AND er.to_currency_id = COALESCE(p.price_currency_id, (o.metadata::jsonb ->> 'catalogCurrencyId')::uuid, o.base_currency_id)
                  AND er.effective_date <= i.invoice_date
                ORDER BY er.effective_date DESC
                LIMIT 1
              ), 0)
            )
          END
        ), 0)::numeric(18,2) AS total
        FROM invoices i
        JOIN organizations o ON o.id = i.organization_id
        JOIN invoice_lines il ON il.invoice_id = i.id
        JOIN products p ON p.id = il.product_id
        WHERE i.id = ${invoice.id}
          AND p.type <> 'service'
      `;

      const [posted] = await tx<{ total: string }[]>`
        SELECT COALESCE(SUM(aml.debit::numeric), 0)::numeric(18,2) AS total
        FROM account_move_lines aml
        JOIN account_moves am ON am.id = aml.move_id
        JOIN gl_accounts ga ON ga.id = aml.account_id
        WHERE am.invoice_id = ${invoice.id}
          AND am.state = 'posted'
          AND ga.code = '5000'
      `;

      const expectedCost = Number(expected?.total ?? 0);
      const postedCost = Number(posted?.total ?? 0);
      const difference = Math.round((expectedCost - postedCost) * 100) / 100;
      if (difference === 0) return { expectedCost, postedCost, adjusted: 0 };
      if (difference < 0) {
        throw new Error("Repair would reduce COGS; create a reviewed reversal instead");
      }

      const reference = `COST-CURRENCY-REPAIR:${invoice.id}`;
      const [alreadyApplied] = await tx`
        SELECT id FROM account_moves WHERE reference = ${reference} LIMIT 1
      `;
      if (alreadyApplied) return { expectedCost, postedCost, adjusted: 0 };

      const [journal] = await tx<{ id: string }[]>`
        SELECT id FROM journals
        WHERE organization_id = ${invoice.organizationId} AND code = 'MISC'
        LIMIT 1
      `;
      const accounts = await tx<{ id: string; code: string }[]>`
        SELECT id, code FROM gl_accounts
        WHERE organization_id = ${invoice.organizationId}
          AND code IN ('5000', '1200')
      `;
      const cogs = accounts.find((account) => account.code === "5000");
      const inventory = accounts.find((account) => account.code === "1200");
      if (!journal || !cogs || !inventory) {
        throw new Error("Required MISC journal, COGS, or Inventory account is missing");
      }

      const [move] = await tx<{ id: string }[]>`
        INSERT INTO account_moves (
          organization_id, branch_id, journal_id, name, reference, state, move_date,
          invoice_id, posted_at
        )
        VALUES (
          ${invoice.organizationId}, ${invoice.branchId}, ${journal.id}, ${`${invoiceNumber} cost currency correction`},
          ${reference}, 'posted', ${invoice.invoiceDate}, ${invoice.id}, NOW()
        )
        RETURNING id
      `;
      await tx`
        INSERT INTO account_move_lines
          (move_id, account_id, label, debit, credit, line_number)
        VALUES
          (${move.id}, ${cogs.id}, ${`${invoiceNumber} COGS currency correction`}, ${difference}, 0, 1),
          (${move.id}, ${inventory.id}, ${`${invoiceNumber} inventory currency correction`}, 0, ${difference}, 2)
      `;

      return { expectedCost, postedCost, adjusted: difference };
    });

    console.log(JSON.stringify({ invoiceNumber, ...result }));
  } finally {
    await sql.end();
  }
}

void main();
