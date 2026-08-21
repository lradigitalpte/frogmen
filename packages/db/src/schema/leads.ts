import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const leadSourceEnum = pgEnum("lead_source", [
  "website",
  "google_ads",
  "organic_search",
  "linkedin",
  "referral",
  "cold_outreach",
  "event",
  "partner",
  "direct_call",
  "other",
]);

export const leadStageEnum = pgEnum("lead_stage", [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
]);

export const leadContactStatusEnum = pgEnum("lead_contact_status", [
  "not_contacted",
  "attempted",
  "contacted",
  "meeting_scheduled",
  "proposal_sent",
  "unresponsive",
]);

export const leadPriorityEnum = pgEnum("lead_priority", ["hot", "warm", "cold"]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  jobTitle: varchar("job_title", { length: 150 }),
  leadSource: leadSourceEnum("lead_source").notNull().default("website"),
  sourceDetails: text("source_details"),
  contactStatus: leadContactStatusEnum("contact_status")
    .notNull()
    .default("not_contacted"),
  contacted: boolean("contacted").notNull().default(false),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  lastContactMethod: varchar("last_contact_method", { length: 50 }),
  stage: leadStageEnum("stage").notNull().default("new"),
  priority: leadPriorityEnum("priority").notNull().default("warm"),
  estimatedValue: numeric("estimated_value", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  score: integer("score").notNull().default(60),
  assignedToName: varchar("assigned_to_name", { length: 150 }),
  notes: text("notes"),
  nextFollowUp: timestamp("next_follow_up", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const leadCommunicationLogs = pgTable("lead_communication_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  author: varchar("author", { length: 150 }).notNull(),
  summary: text("summary").notNull(),
  outcome: text("outcome"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LeadRecord = typeof leads.$inferSelect;
export type NewLeadRecord = typeof leads.$inferInsert;
export type LeadCommunicationLogRecord = typeof leadCommunicationLogs.$inferSelect;
export type NewLeadCommunicationLogRecord = typeof leadCommunicationLogs.$inferInsert;
