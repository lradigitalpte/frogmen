import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Platform-admin backups of an organization. Deliberately has no foreign key
 * and no organization_id column, so a backup outlives the organization.
 */
export const platformBackups = pgTable(
  "platform_backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    tenantName: text("tenant_name").notNull(),
    tenantSlug: text("tenant_slug").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    objectKey: text("object_key"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    tableCount: integer("table_count"),
    rowCount: integer("row_count"),
    error: text("error"),
    createdByEmail: text("created_by_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }),
    lastDownloadedByEmail: text("last_downloaded_by_email"),
  },
  (table) => [
    uniqueIndex("platform_backups_one_running_idx")
      .on(table.tenantId)
      .where(sql`${table.status} = 'running'`),
  ],
);
