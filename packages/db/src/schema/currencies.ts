import {
  boolean,
  char,
  date,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const symbolPositionEnum = pgEnum("symbol_position", [
  "before",
  "after",
]);

export const currencies = pgTable("currencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: char("code", { length: 3 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  decimalPlaces: smallint("decimal_places").notNull().default(2),
  symbolPosition: symbolPositionEnum("symbol_position")
    .notNull()
    .default("before"),
  thousandSep: varchar("thousand_sep", { length: 5 }).notNull().default(","),
  decimalSep: varchar("decimal_sep", { length: 5 }).notNull().default("."),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromCurrencyId: uuid("from_currency_id")
      .notNull()
      .references(() => currencies.id),
    toCurrencyId: uuid("to_currency_id")
      .notNull()
      .references(() => currencies.id),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    effectiveDate: date("effective_date").notNull(),
    source: varchar("source", { length: 50 }).notNull().default("manual"),
    organizationId: text("organization_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("exchange_rates_pair_date_org").on(
      table.fromCurrencyId,
      table.toCurrencyId,
      table.effectiveDate,
      table.organizationId,
    ),
  ],
);
