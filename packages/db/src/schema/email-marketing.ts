import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { customers } from "./customers";
import { leads } from "./leads";

export const emailTemplateCategoryEnum = pgEnum("email_template_category", [
  "announcement",
  "promotion",
  "newsletter",
  "onboarding",
  "outreach",
  "custom",
]);

export const emailCampaignStatusEnum = pgEnum("email_campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "partially_sent",
  "failed",
  "cancelled",
]);

export const emailAudienceTypeEnum = pgEnum("email_audience_type", [
  "all",
  "contacts",
  "leads",
  "segment",
  "custom",
]);

export const recipientDeliveryStatusEnum = pgEnum("recipient_delivery_status", [
  "pending",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "unsubscribed",
]);

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: emailTemplateCategoryEnum("category").notNull().default("custom"),
  subject: varchar("subject", { length: 255 }).notNull(),
  previewText: varchar("preview_text", { length: 255 }),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  designConfig: jsonb("design_config"),
  isSystemPreset: boolean("is_system_preset").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  previewText: varchar("preview_text", { length: 255 }),
  fromName: varchar("from_name", { length: 150 }),
  fromEmail: varchar("from_email", { length: 255 }),
  replyTo: varchar("reply_to", { length: 255 }),
  templateId: uuid("template_id").references(() => emailTemplates.id, {
    onDelete: "set null",
  }),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  designConfig: jsonb("design_config"),
  targetAudienceType: emailAudienceTypeEnum("target_audience_type")
    .notNull()
    .default("all"),
  audienceFilter: jsonb("audience_filter"),
  status: emailCampaignStatusEnum("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  deliveredCount: integer("delivered_count").notNull().default(0),
  openedCount: integer("opened_count").notNull().default(0),
  clickedCount: integer("clicked_count").notNull().default(0),
  bouncedCount: integer("bounced_count").notNull().default(0),
  unsubscribedCount: integer("unsubscribed_count").notNull().default(0),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const emailCampaignRecipients = pgTable("email_campaign_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => emailCampaigns.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  recipientType: varchar("recipient_type", { length: 50 }).notNull().default("contact"), // 'contact' | 'lead' | 'custom'
  contactId: uuid("contact_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  leadId: uuid("lead_id").references(() => leads.id, {
    onDelete: "set null",
  }),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  company: varchar("company", { length: 255 }),
  status: recipientDeliveryStatusEnum("status").notNull().default("pending"),
  resendEmailId: varchar("resend_email_id", { length: 100 }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  clickCount: integer("click_count").notNull().default(0),
  lastClickedUrl: text("last_clicked_url"),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  trackingToken: varchar("tracking_token", { length: 100 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailMarketingUnsubscribes = pgTable("email_marketing_unsubscribes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  reason: text("reason"),
  campaignId: uuid("campaign_id").references(() => emailCampaigns.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EmailTemplateRecord = typeof emailTemplates.$inferSelect;
export type NewEmailTemplateRecord = typeof emailTemplates.$inferInsert;

export type EmailCampaignRecord = typeof emailCampaigns.$inferSelect;
export type NewEmailCampaignRecord = typeof emailCampaigns.$inferInsert;

export type EmailCampaignRecipientRecord = typeof emailCampaignRecipients.$inferSelect;
export type NewEmailCampaignRecipientRecord = typeof emailCampaignRecipients.$inferInsert;

export type EmailMarketingUnsubscribeRecord = typeof emailMarketingUnsubscribes.$inferSelect;
export type NewEmailMarketingUnsubscribeRecord = typeof emailMarketingUnsubscribes.$inferInsert;
