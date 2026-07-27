import {
  boolean,
  char,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { currencies } from "./currencies";
import { organizations } from "./auth";

export const customerAccountTypeEnum = pgEnum("customer_account_type", [
  "individual",
  "company",
]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  accountType: customerAccountTypeEnum("account_type")
    .notNull()
    .default("individual"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  mobile: varchar("mobile", { length: 50 }),
  website: varchar("website", { length: 255 }),
  taxId: varchar("tax_id", { length: 100 }),
  reference: varchar("reference", { length: 100 }),
  jobTitle: varchar("job_title", { length: 150 }),
  street1: varchar("street1", { length: 255 }),
  street2: varchar("street2", { length: 255 }),
  city: varchar("city", { length: 120 }),
  zip: varchar("zip", { length: 30 }),
  countryCode: char("country_code", { length: 2 }),
  stateCode: varchar("state_code", { length: 10 }),
  parentId: uuid("parent_id"),
  defaultCurrencyId: uuid("default_currency_id").references(() => currencies.id),
  creditLimit: numeric("credit_limit", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  creditApproved: boolean("credit_approved").notNull().default(false),
  isLocal: boolean("is_local").notNull().default(false),
  avatarPath: text("avatar_path"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
