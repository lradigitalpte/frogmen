import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./auth";
import { customers } from "./customers";
import { products } from "./products";
import { productUnits } from "./product-units";
import {
  invoiceLines,
  invoices,
  salesOrderLines,
} from "./sales";
import { branches } from "./security";

export const warrantyRegistrationStatusEnum = pgEnum(
  "warranty_registration_status",
  ["active", "expired", "voided"],
);

export const warrantyRegistrationSourceEnum = pgEnum(
  "warranty_registration_source",
  ["sale", "manual"],
);

export const warrantyPolicies = pgTable("warranty_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  durationMonths: integer("duration_months").notNull().default(12),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const warrantyRegistrations = pgTable("warranty_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .default(sql`app_current_branch_id()`)
    .references(() => branches.id),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => warrantyPolicies.id),
  status: warrantyRegistrationStatusEnum("status").notNull().default("active"),
  source: warrantyRegistrationSourceEnum("source").notNull().default("manual"),
  startsAt: date("starts_at").notNull(),
  endsAt: date("ends_at").notNull(),
  soldAt: date("sold_at").notNull(),
  productId: uuid("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  productUnitId: uuid("product_unit_id").references(() => productUnits.id, {
    onDelete: "set null",
  }),
  serialNumber: varchar("serial_number", { length: 150 }),
  productName: varchar("product_name", { length: 255 }),
  customerId: uuid("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  customerName: varchar("customer_name", { length: 255 }),
  quantity: integer("quantity").notNull().default(1),
  invoiceId: uuid("invoice_id").references(() => invoices.id, {
    onDelete: "set null",
  }),
  invoiceLineId: uuid("invoice_line_id").references(() => invoiceLines.id, {
    onDelete: "set null",
  }),
  salesOrderLineId: uuid("sales_order_line_id").references(
    () => salesOrderLines.id,
    { onDelete: "set null" },
  ),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WarrantyPolicy = typeof warrantyPolicies.$inferSelect;
export type NewWarrantyPolicy = typeof warrantyPolicies.$inferInsert;
export type WarrantyRegistration = typeof warrantyRegistrations.$inferSelect;
export type NewWarrantyRegistration = typeof warrantyRegistrations.$inferInsert;
