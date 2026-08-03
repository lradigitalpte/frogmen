import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { glAccounts } from "./accounting";
import { currencies } from "./currencies";
import { branches } from "./security";

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    bankName: varchar("bank_name", { length: 160 }),
    accountNumber: varchar("account_number", { length: 64 }),
    iban: varchar("iban", { length: 64 }),
    swiftCode: varchar("swift_code", { length: 32 }),
    currencyId: uuid("currency_id")
      .notNull()
      .references(() => currencies.id),
    glAccountId: uuid("gl_account_id")
      .notNull()
      .references(() => glAccounts.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    showOnDocuments: boolean("show_on_documents").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("bank_accounts_org_name_uidx").on(
      table.organizationId,
      table.name,
    ),
    index("bank_accounts_organization_idx").on(table.organizationId),
    index("bank_accounts_gl_account_idx").on(table.glAccountId),
  ],
);

export const bankAccountBranches = pgTable(
  "bank_account_branches",
  {
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("bank_account_branches_uidx").on(
      table.bankAccountId,
      table.branchId,
    ),
    index("bank_account_branches_branch_idx").on(table.branchId),
  ],
);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type BankAccountBranch = typeof bankAccountBranches.$inferSelect;
