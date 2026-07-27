import {
  boolean,
  char,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { invitations, members, organizations, users } from "./auth";

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    code: varchar("code", { length: 24 }).notNull(),
    documentPrefix: varchar("document_prefix", { length: 16 }).notNull(),
    street1: varchar("street1", { length: 255 }),
    street2: varchar("street2", { length: 255 }),
    city: varchar("city", { length: 120 }),
    zip: varchar("zip", { length: 30 }),
    countryCode: char("country_code", { length: 2 }),
    timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
    isMain: boolean("is_main").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("branches_org_code_uidx").on(
      table.organizationId,
      table.code,
    ),
    index("branches_organization_idx").on(table.organizationId),
  ],
);

export const branchMembers = pgTable(
  "branch_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("branch_members_branch_member_uidx").on(
      table.branchId,
      table.memberId,
    ),
    index("branch_members_member_idx").on(table.memberId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 80 }).notNull(),
    resource: varchar("resource", { length: 80 }).notNull(),
    recordId: text("record_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("audit_logs_branch_idx").on(table.branchId),
    index("audit_logs_user_idx").on(table.userId),
  ],
);

export const invitationBranches = pgTable(
  "invitation_branches",
  {
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("invitation_branches_uidx").on(
      table.invitationId,
      table.branchId,
    ),
  ],
);

export type Branch = typeof branches.$inferSelect;
export type BranchMember = typeof branchMembers.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
