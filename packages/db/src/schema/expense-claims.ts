import {
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users, organizations } from "./auth";
import { branches } from "./security";
import { accountMoves } from "./accounting";
import { bankAccounts } from "./bank-accounts";
import { expenseCategories } from "./expenses";

export const expenseClaims = pgTable(
  "expense_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(sql`app_current_branch_id()`)
      .references(() => branches.id),
    number: varchar("number", { length: 64 }).notNull(),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => expenseCategories.id, {
      onDelete: "set null",
    }),
    description: varchar("description", { length: 500 }).notNull(),
    reference: varchar("reference", { length: 255 }),
    receiptPath: varchar("receipt_path", { length: 500 }),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    expenseDate: date("expense_date").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectionReason: text("rejection_reason"),
    reimbursedAt: timestamp("reimbursed_at", { withTimezone: true }),
    reimbursedByUserId: text("reimbursed_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    paymentMethod: varchar("payment_method", { length: 40 }),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    accountMoveId: uuid("account_move_id").references(() => accountMoves.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("expense_claims_org_number_idx")
      .on(table.organizationId, table.number)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("expense_claims_account_move_idx")
      .on(table.accountMoveId)
      .where(sql`${table.accountMoveId} IS NOT NULL`),
  ],
);

export type ExpenseClaim = typeof expenseClaims.$inferSelect;
