import {
  bigint,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const companyVaultFolders = pgTable("company_vault_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 50 }).default("amber").notNull(),
  parentFolderId: uuid("parent_folder_id"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const companyVaultFiles = pgTable("company_vault_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id"),
  name: varchar("name", { length: 255 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  mimeType: varchar("mime_type", { length: 150 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("document"),
  s3Key: text("s3_key").notNull(),
  uploadedBy: varchar("uploaded_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CompanyVaultFolderRecord = typeof companyVaultFolders.$inferSelect;
export type NewCompanyVaultFolderRecord = typeof companyVaultFolders.$inferInsert;
export type CompanyVaultFileRecord = typeof companyVaultFiles.$inferSelect;
export type NewCompanyVaultFileRecord = typeof companyVaultFiles.$inferInsert;
