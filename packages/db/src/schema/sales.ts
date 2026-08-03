import {
  boolean,
  date,
  integer,
  index,
  jsonb,
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
import { currencies } from "./currencies";
import { customers } from "./customers";
import { products } from "./products";
import { productUnits } from "./product-units";
import { warehouses } from "./warehouses";
import { branches } from "./security";

export const salesOrderStateEnum = pgEnum("sales_order_state", [
  "draft",
  "sent",
  "confirmed",
  "cancelled",
]);

export const salesInvoiceStatusEnum = pgEnum("sales_invoice_status", [
  "none",
  "to_invoice",
  "partial",
  "invoiced",
]);

export const invoiceStateEnum = pgEnum("invoice_state", [
  "draft",
  "posted",
  "cancelled",
]);

export const invoicePaymentStateEnum = pgEnum("invoice_payment_state", [
  "unpaid",
  "partial",
  "paid",
]);

export const salesActivityTypeEnum = pgEnum("sales_activity_type", [
  "created",
  "updated",
  "note",
  "sent",
  "confirmed",
  "cancelled",
  "invoiced",
  "paid",
]);

export const reminderRuleTypeEnum = pgEnum("reminder_rule_type", [
  "customer_payment",
  "internal_follow_up",
]);

export const reminderTriggerTypeEnum = pgEnum("reminder_trigger_type", [
  "days_before_due",
  "days_after_due",
  "weekly_digest",
]);

export const paymentTerms = pgTable("payment_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  dueDays: integer("due_days").notNull().default(30),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(sql`app_current_branch_id()`)
      .references(() => branches.id),
    number: varchar("number", { length: 50 }).notNull(),
    state: salesOrderStateEnum("state").notNull().default("draft"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    currencyId: uuid("currency_id")
      .notNull()
      .references(() => currencies.id),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }),
    exchangeRateLockedAt: timestamp("exchange_rate_locked_at", {
      withTimezone: true,
    }),
    paymentTermId: uuid("payment_term_id").references(() => paymentTerms.id),
    quoteDate: date("quote_date").notNull(),
    validityDate: date("validity_date"),
    customerReference: varchar("customer_reference", { length: 100 }),
    internalReference: varchar("internal_reference", { length: 100 }),
    paymentReference: varchar("payment_reference", { length: 100 }),
    notes: text("notes"),
    amountUntaxed: numeric("amount_untaxed", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountTax: numeric("amount_tax", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountTotal: numeric("amount_total", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountUntaxedBase: numeric("amount_untaxed_base", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountTaxBase: numeric("amount_tax_base", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountTotalBase: numeric("amount_total_base", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    invoiceStatus: salesInvoiceStatusEnum("invoice_status")
      .notNull()
      .default("none"),
    createdByUserId: text("created_by_user_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sales_orders_org_number_idx").on(
      table.organizationId,
      table.branchId,
      table.number,
    ),
  ],
);

export const salesOrderLines = pgTable("sales_order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  salesOrderId: uuid("sales_order_id")
    .notNull()
    .references(() => salesOrders.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  productId: uuid("product_id").references(() => products.id),
  productUnitId: uuid("product_unit_id").references(() => productUnits.id),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  taxRatePercent: numeric("tax_rate_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  priceSubtotal: numeric("price_subtotal", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  priceTax: numeric("price_tax", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  priceTotal: numeric("price_total", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  warrantyPolicyId: uuid("warranty_policy_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(sql`app_current_branch_id()`)
      .references(() => branches.id),
    salesOrderId: uuid("sales_order_id").references(() => salesOrders.id),
    number: varchar("number", { length: 50 }).notNull(),
    state: invoiceStateEnum("state").notNull().default("draft"),
    paymentState: invoicePaymentStateEnum("payment_state")
      .notNull()
      .default("unpaid"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    currencyId: uuid("currency_id")
      .notNull()
      .references(() => currencies.id),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }),
    exchangeRateLockedAt: timestamp("exchange_rate_locked_at", {
      withTimezone: true,
    }),
    paymentTermId: uuid("payment_term_id").references(() => paymentTerms.id),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    customerReference: varchar("customer_reference", { length: 100 }),
    internalReference: varchar("internal_reference", { length: 100 }),
    notes: text("notes"),
    amountUntaxed: numeric("amount_untaxed", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountTax: numeric("amount_tax", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountTotal: numeric("amount_total", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountPaid: numeric("amount_paid", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountUntaxedBase: numeric("amount_untaxed_base", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountTaxBase: numeric("amount_tax_base", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    amountTotalBase: numeric("amount_total_base", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: text("cancelled_by_user_id"),
    cancellationReason: text("cancellation_reason"),
    cancellationReturnToStock: boolean("cancellation_return_to_stock").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("invoices_org_number_idx").on(
      table.organizationId,
      table.branchId,
      table.number,
    ),
  ],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  salesOrderLineId: uuid("sales_order_line_id").references(
    () => salesOrderLines.id,
  ),
  lineNumber: integer("line_number").notNull(),
  productId: uuid("product_id").references(() => products.id),
  productUnitId: uuid("product_unit_id").references(() => productUnits.id),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  taxRatePercent: numeric("tax_rate_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  priceSubtotal: numeric("price_subtotal", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  priceTax: numeric("price_tax", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  priceTotal: numeric("price_total", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  costAmount: numeric("cost_amount", { precision: 18, scale: 2 }),
  costAmountBase: numeric("cost_amount_base", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const invoicePayments = pgTable("invoice_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .default(sql`app_current_branch_id()`)
    .references(() => branches.id),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currencyId: uuid("currency_id")
    .notNull()
    .references(() => currencies.id),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }),
  paymentDate: date("payment_date").notNull(),
  reference: varchar("reference", { length: 100 }),
  method: varchar("method", { length: 50 }),
  bankAccountId: uuid("bank_account_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const creditNotes = pgTable(
  "credit_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(sql`app_current_branch_id()`)
      .references(() => branches.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    currencyId: uuid("currency_id")
      .notNull()
      .references(() => currencies.id),
    number: varchar("number", { length: 50 }).notNull(),
    creditDate: date("credit_date").notNull(),
    reason: text("reason").notNull(),
    amountUntaxed: numeric("amount_untaxed", { precision: 18, scale: 2 }).notNull(),
    amountTax: numeric("amount_tax", { precision: 18, scale: 2 }).notNull(),
    amountTotal: numeric("amount_total", { precision: 18, scale: 2 }).notNull(),
    amountTotalBase: numeric("amount_total_base", { precision: 18, scale: 2 }).notNull(),
    state: varchar("state", { length: 20 }).notNull().default("posted"),
    returnToStock: boolean("return_to_stock").notNull().default(false),
    refundDue: numeric("refund_due", { precision: 18, scale: 2 }).notNull().default("0"),
    refundPaid: numeric("refund_paid", { precision: 18, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("credit_notes_org_branch_number_idx").on(
      table.organizationId,
      table.branchId,
      table.number,
    ),
    index("credit_notes_invoice_idx").on(table.invoiceId),
  ],
);

export const customerRefunds = pgTable("customer_refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull().default(sql`app_current_branch_id()`).references(() => branches.id),
  creditNoteId: uuid("credit_note_id").notNull().references(() => creditNotes.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  currencyId: uuid("currency_id").notNull().references(() => currencies.id),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }).notNull(),
  refundDate: date("refund_date").notNull(),
  method: varchar("method", { length: 50 }).notNull(),
  reference: varchar("reference", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceNotifications = pgTable("invoice_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull().default(sql`app_current_branch_id()`).references(() => branches.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  creditNoteId: uuid("credit_note_id").references(() => creditNotes.id),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  deliveryStatus: varchar("delivery_status", { length: 30 }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesActivities = pgTable("sales_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .default(sql`app_current_branch_id()`)
    .references(() => branches.id),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  userId: text("user_id"),
  activityType: salesActivityTypeEnum("activity_type").notNull(),
  message: text("message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentSequences = pgTable(
  "document_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(sql`app_current_branch_id()`)
      .references(() => branches.id),
    documentType: varchar("document_type", { length: 30 }).notNull(),
    prefix: varchar("prefix", { length: 20 }).notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("document_sequences_org_type_idx").on(
      table.organizationId,
      table.branchId,
      table.documentType,
    ),
  ],
);

export const paymentReminderRules = pgTable("payment_reminder_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .default(sql`app_current_branch_id()`)
    .references(() => branches.id),
  name: varchar("name", { length: 160 }).notNull(),
  ruleType: reminderRuleTypeEnum("rule_type")
    .notNull()
    .default("customer_payment"),
  triggerType: reminderTriggerTypeEnum("trigger_type")
    .notNull()
    .default("days_after_due"),
  triggerDays: integer("trigger_days"),
  recipientEmail: varchar("recipient_email", { length: 255 }),
  triggerCondition: varchar("trigger_condition", { length: 255 }).notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const paymentReminderLogs = pgTable("payment_reminder_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .default(sql`app_current_branch_id()`)
    .references(() => branches.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id, {
    onDelete: "cascade",
  }),
  ruleId: uuid("rule_id").references(() => paymentReminderRules.id, {
    onDelete: "set null",
  }),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  customMessage: text("custom_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SalesOrder = typeof salesOrders.$inferSelect;
export type SalesOrderLine = typeof salesOrderLines.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type PaymentTerm = typeof paymentTerms.$inferSelect;
