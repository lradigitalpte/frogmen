import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./auth";
import { customers } from "./customers";
import { customerRefunds, invoicePayments, invoices } from "./sales";
import { branches } from "./security";

export const accountTypeEnum = pgEnum("account_type", [
  "asset_receivable",
  "asset_cash",
  "asset_current",
  "asset_non_current",
  "asset_prepayments",
  "asset_fixed",
  "liability_payable",
  "liability_credit_card",
  "liability_current",
  "liability_non_current",
  "equity",
  "equity_unaffected",
  "income",
  "income_other",
  "expense",
  "expense_depreciation",
  "expense_direct_cost",
  "off_balance",
]);

export const journalTypeEnum = pgEnum("journal_type", [
  "sale",
  "purchase",
  "bank",
  "cash",
  "credit",
  "general",
]);

export const accountMoveStateEnum = pgEnum("account_move_state", [
  "draft",
  "posted",
  "cancelled",
]);

export const glAccounts = pgTable(
  "gl_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    accountType: accountTypeEnum("account_type").notNull(),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("gl_accounts_org_code_idx").on(
      table.organizationId,
      table.code,
    ),
  ],
);

export const journals = pgTable(
  "journals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(sql`app_current_branch_id()`)
      .references(() => branches.id),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    journalType: journalTypeEnum("journal_type").notNull(),
    defaultAccountId: uuid("default_account_id").references(() => glAccounts.id),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("journals_org_code_idx").on(
      table.organizationId,
      table.branchId,
      table.code,
    ),
  ],
);

export const accountMoves = pgTable("account_moves", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .default(sql`app_current_branch_id()`)
    .references(() => branches.id),
  journalId: uuid("journal_id")
    .notNull()
    .references(() => journals.id),
  name: varchar("name", { length: 255 }).notNull(),
  reference: varchar("reference", { length: 255 }),
  state: accountMoveStateEnum("state").notNull().default("draft"),
  moveDate: date("move_date").notNull(),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  paymentId: uuid("payment_id").references(() => invoicePayments.id),
  refundId: uuid("refund_id").references(() => customerRefunds.id),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accountMoveLines = pgTable("account_move_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  moveId: uuid("move_id")
    .notNull()
    .references(() => accountMoves.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => glAccounts.id),
  customerId: uuid("customer_id").references(() => customers.id),
  label: varchar("label", { length: 500 }).notNull(),
  debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
  lineNumber: integer("line_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type GlAccount = typeof glAccounts.$inferSelect;
export type Journal = typeof journals.$inferSelect;
export type AccountMove = typeof accountMoves.$inferSelect;
export type AccountMoveLine = typeof accountMoveLines.$inferSelect;
