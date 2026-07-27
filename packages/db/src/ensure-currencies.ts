import postgres from "postgres";

const baselineCurrencies = [
  ["USD", "US Dollar", "$", 2, "before", ",", "."],
  ["GBP", "British Pound", "£", 2, "before", ",", "."],
  ["EUR", "Euro", "€", 2, "after", ".", ","],
  ["AED", "UAE Dirham", "AED", 2, "before", ",", "."],
  ["SGD", "Singapore Dollar", "S$", 2, "before", ",", "."],
  ["ZAR", "South African Rand", "R", 2, "before", " ", ","],
] as const;

export async function ensureCurrencies(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });

  try {
    for (const currency of baselineCurrencies) {
      await sql`
        INSERT INTO currencies (
          code,
          name,
          symbol,
          decimal_places,
          symbol_position,
          thousand_sep,
          decimal_sep
        )
        VALUES (
          ${currency[0]},
          ${currency[1]},
          ${currency[2]},
          ${currency[3]},
          ${currency[4]},
          ${currency[5]},
          ${currency[6]}
        )
        ON CONFLICT (code) DO NOTHING
      `;
    }
  } finally {
    await sql.end();
  }
}
