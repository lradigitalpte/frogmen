const postgres = require("postgres");

async function main() {
  const sql = postgres("postgresql://frog:frog@localhost:5432/frog1");

  const invoices = await sql`
    SELECT number, amount_total::text, due_date::text, state, payment_state
    FROM invoices
    WHERE number LIKE 'INV-2026-%'
    ORDER BY number
  `;

  const allPosted = await sql`
    SELECT COUNT(*)::int AS count
    FROM invoices
    WHERE state = 'posted'
      AND payment_state IN ('unpaid', 'partial')
  `;

  console.log("demo-style invoices:", invoices);
  console.log("posted unpaid count:", allPosted[0]?.count);

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
