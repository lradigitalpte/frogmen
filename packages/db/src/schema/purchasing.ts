import {
  date,
  integer,
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
import { products } from "./products";
import { warehouses } from "./warehouses";
import { vendors } from "./vendors";
import { branches } from "./security";

export { vendors } from "./vendors";

export const purchaseOrderStateEnum = pgEnum("purchase_order_state", [
  "draft",
  "confirmed",
  "cancelled",
]);

export const purchaseReceiptStatusEnum = pgEnum("purchase_receipt_status", [
  "none",
  "to_receive",
  "partial",
  "received",
]);

export const goodsReceiptStateEnum = pgEnum("goods_receipt_state", [
  "draft",
  "done",
  "cancelled",
]);

export const purchaseActivityTypeEnum = pgEnum("purchase_activity_type", [
  "created",
  "updated",
  "note",
  "confirmed",
  "received",
  "cancelled",
]);

export const purchaseOrderChargeScopeEnum = pgEnum(
  "purchase_order_charge_scope",
  ["order", "line"],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
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
    state: purchaseOrderStateEnum("state").notNull().default("draft"),
    receiptStatus: purchaseReceiptStatusEnum("receipt_status")
      .notNull()
      .default("none"),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    currencyId: uuid("currency_id")
      .notNull()
      .references(() => currencies.id),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }),
    exchangeRateLockedAt: timestamp("exchange_rate_locked_at", {
      withTimezone: true,
    }),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    vendorReference: varchar("vendor_reference", { length: 100 }),
    internalReference: varchar("internal_reference", { length: 100 }),
    notes: text("notes"),
    freightAmount: numeric("freight_amount", { precision: 18, scale: 2 }),
    freightPercent: numeric("freight_percent", { precision: 8, scale: 4 }),
    otherChargesAmount: numeric("other_charges_amount", {
      precision: 18,
      scale: 2,
    })
      .notNull()
      .default("0"),
    targetMarginPercent: numeric("target_margin_percent", {
      precision: 8,
      scale: 4,
    }),
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
    createdByUserId: text("created_by_user_id"),
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
    uniqueIndex("purchase_orders_org_number_idx").on(
      table.organizationId,
      table.branchId,
      table.number,
    ),
  ],
);

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  productId: uuid("product_id").references(() => products.id),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  qtyReceived: numeric("qty_received", { precision: 18, scale: 4 })
    .notNull()
    .default("0"),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const purchaseOrderCharges = pgTable("purchase_order_charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  purchaseOrderLineId: uuid("purchase_order_line_id").references(
    () => purchaseOrderLines.id,
    { onDelete: "cascade" },
  ),
  name: varchar("name", { length: 100 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  scope: purchaseOrderChargeScopeEnum("scope").notNull().default("order"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .default(sql`app_current_branch_id()`)
      .references(() => branches.id),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    number: varchar("number", { length: 50 }).notNull(),
    state: goodsReceiptStateEnum("state").notNull().default("draft"),
    receiptDate: date("receipt_date").notNull(),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("goods_receipts_org_number_idx").on(
      table.organizationId,
      table.branchId,
      table.number,
    ),
  ],
);

export const goodsReceiptLines = pgTable("goods_receipt_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  goodsReceiptId: uuid("goods_receipt_id")
    .notNull()
    .references(() => goodsReceipts.id, { onDelete: "cascade" }),
  purchaseOrderLineId: uuid("purchase_order_line_id")
    .notNull()
    .references(() => purchaseOrderLines.id),
  lineNumber: integer("line_number").notNull(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  warehouseId: uuid("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  serialNumbers: jsonb("serial_numbers").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const purchaseActivities = pgTable("purchase_activities", {
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
  activityType: purchaseActivityTypeEnum("activity_type").notNull(),
  message: text("message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderCharge = typeof purchaseOrderCharges.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type GoodsReceipt = typeof goodsReceipts.$inferSelect;
export type GoodsReceiptLine = typeof goodsReceiptLines.$inferSelect;
