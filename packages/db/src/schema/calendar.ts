import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { customers } from "./customers";
import { vendors } from "./vendors";

export const calendarEventCategoryEnum = pgEnum("calendar_event_category", [
  "meeting",
  "reminder",
  "deadline",
  "follow_up",
  "holiday",
  "other",
]);

export const calendarSettings = pgTable("calendar_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  trackedCountries: jsonb("tracked_countries")
    .$type<string[]>()
    .notNull()
    .default([]),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  reminderEmails: text("reminder_emails"),
  digestLookaheadDays: integer("digest_lookahead_days").notNull().default(3),
  digestHour: integer("digest_hour").notNull().default(7),
  includeDeliveries: boolean("include_deliveries").notNull().default(true),
  includeAnniversaries: boolean("include_anniversaries")
    .notNull()
    .default(true),
  includeHolidays: boolean("include_holidays").notNull().default(true),
  includeInvoices: boolean("include_invoices").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: calendarEventCategoryEnum("category").notNull().default("other"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  startTime: varchar("start_time", { length: 5 }),
  endTime: varchar("end_time", { length: 5 }),
  customerId: uuid("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  vendorId: uuid("vendor_id").references(() => vendors.id, {
    onDelete: "set null",
  }),
  reminderDaysBefore: integer("reminder_days_before"),
  reminderEmails: text("reminder_emails"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const calendarReminderLogs = pgTable(
  "calendar_reminder_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reminderKey: varchar("reminder_key", { length: 255 }).notNull(),
    recipientEmail: text("recipient_email").notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_reminder_logs_org_key_idx").on(
      table.organizationId,
      table.reminderKey,
    ),
  ],
);

export type CalendarSettings = typeof calendarSettings.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;
