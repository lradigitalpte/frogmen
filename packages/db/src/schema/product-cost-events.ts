import { sql } from "drizzle-orm";
import {
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users, organizations } from "./auth";
import { branches } from "./security";
import { products } from "./products";
import { productUnits } from "./product-units";

export const productCostEventTypeEnum = pgEnum("product_cost_event_type", [
  "po_receipt",
  "manual_edit",
  "invoice_post",
]);

export const productCostEvents = pgTable("product_cost_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .default(sql`app_current_branch_id()`)
    .references(() => branches.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  productUnitId: uuid("product_unit_id").references(() => productUnits.id, {
    onDelete: "set null",
  }),
  eventType: productCostEventTypeEnum("event_type").notNull(),
  unitCost: numeric("unit_cost", { precision: 18, scale: 2 }).notNull(),
  previousUnitCost: numeric("previous_unit_cost", { precision: 18, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 10 }),
  referenceType: varchar("reference_type", { length: 30 }),
  referenceId: uuid("reference_id"),
  referenceLabel: varchar("reference_label", { length: 100 }),
  message: text("message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProductCostEvent = typeof productCostEvents.$inferSelect;
export type NewProductCostEvent = typeof productCostEvents.$inferInsert;
