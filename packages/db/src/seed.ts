import { config } from "dotenv";
import { resolve } from "node:path";
import { createDb } from "./client";
import { currencies } from "./schema";

config({ path: resolve(__dirname, "../../../.env") });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const dbUrl = connectionString;

const seedCurrencies = [
  {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    decimalPlaces: 2,
    symbolPosition: "before" as const,
    thousandSep: ",",
    decimalSep: ".",
  },
  {
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    decimalPlaces: 2,
    symbolPosition: "before" as const,
    thousandSep: ",",
    decimalSep: ".",
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    decimalPlaces: 2,
    symbolPosition: "after" as const,
    thousandSep: ".",
    decimalSep: ",",
  },
  {
    code: "AED",
    name: "UAE Dirham",
    symbol: "AED",
    decimalPlaces: 2,
    symbolPosition: "before" as const,
    thousandSep: ",",
    decimalSep: ".",
  },
  {
    code: "SGD",
    name: "Singapore Dollar",
    symbol: "S$",
    decimalPlaces: 2,
    symbolPosition: "before" as const,
    thousandSep: ",",
    decimalSep: ".",
  },
  {
    code: "ZAR",
    name: "South African Rand",
    symbol: "R",
    decimalPlaces: 2,
    symbolPosition: "before" as const,
    thousandSep: " ",
    decimalSep: ",",
  },
];

async function main() {
  const db = createDb(dbUrl);

  for (const currency of seedCurrencies) {
    await db
      .insert(currencies)
      .values(currency)
      .onConflictDoNothing({ target: currencies.code });
  }

  console.log("Seeded currencies:", seedCurrencies.map((c) => c.code).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
