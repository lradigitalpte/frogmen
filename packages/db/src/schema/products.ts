import {
  boolean,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { currencies } from "./currencies";
import { productCategoryCatalog } from "./product-categories";

export const productTypeEnum = pgEnum("product_type", ["goods", "service"]);

export const productEquipmentRoleEnum = pgEnum("product_equipment_role", [
  "main_equipment",
  "component",
  "general",
]);

export const productUsageTypeEnum = pgEnum("product_usage_type", [
  "for_sale",
  "operations",
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  equipmentRole: productEquipmentRoleEnum("equipment_role")
    .notNull()
    .default("general"),
  usageType: productUsageTypeEnum("usage_type").notNull().default("for_sale"),
  isRovEquipment: boolean("is_rov_equipment").notNull().default(false),
  type: productTypeEnum("type").notNull().default("goods"),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
  description: text("description"),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  costPrice: numeric("cost_price", { precision: 18, scale: 2 }),
  sellingPrice: numeric("selling_price", { precision: 18, scale: 2 }),
  priceCurrencyId: uuid("price_currency_id").references(() => currencies.id),
  isStorable: boolean("is_storable").notNull().default(true),
  trackSerial: boolean("track_serial").notNull().default(false),
  weight: numeric("weight", { precision: 18, scale: 4 }),
  volume: numeric("volume", { precision: 18, scale: 4 }),
  isActive: boolean("is_active").notNull().default(true),
  categoryId: uuid("category_id").references(() => productCategoryCatalog.id, {
    onDelete: "set null",
  }),
  defaultWarrantyPolicyId: uuid("default_warranty_policy_id"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
