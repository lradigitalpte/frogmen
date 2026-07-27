import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { products } from "./products";
import { warehouses } from "./warehouses";

export const productUnitStatusEnum = pgEnum("product_unit_status", [
  "in_stock",
  "assigned",
  "sold",
  "scrapped",
]);

export const productUnits = pgTable(
  "product_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    serialNumber: varchar("serial_number", { length: 150 }).notNull(),
    parentUnitId: uuid("parent_unit_id"),
    status: productUnitStatusEnum("status").notNull().default("in_stock"),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("product_units_org_serial_idx").on(
      table.organizationId,
      table.serialNumber,
    ),
  ],
);

export type ProductUnit = typeof productUnits.$inferSelect;
export type NewProductUnit = typeof productUnits.$inferInsert;
