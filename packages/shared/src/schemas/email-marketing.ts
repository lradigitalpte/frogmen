import { z } from "zod";

export const emailTemplateCategorySchema = z.enum([
  "announcement",
  "promotion",
  "newsletter",
  "onboarding",
  "outreach",
  "custom",
]);
export type EmailTemplateCategory = z.infer<typeof emailTemplateCategorySchema>;

export const emailCampaignStatusSchema = z.enum([
  "draft",
  "scheduled",
  "sending",
  "sent",
  "partially_sent",
  "failed",
  "cancelled",
]);
export type EmailCampaignStatus = z.infer<typeof emailCampaignStatusSchema>;

export const emailAudienceTypeSchema = z.enum([
  "all",
  "contacts",
  "leads",
  "segment",
  "custom",
]);
export type EmailAudienceType = z.infer<typeof emailAudienceTypeSchema>;

export const recipientDeliveryStatusSchema = z.enum([
  "pending",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "unsubscribed",
]);
export type RecipientDeliveryStatus = z.infer<typeof recipientDeliveryStatusSchema>;

export const emailDesignConfigSchema = z.object({
  primaryColor: z.string().optional().default("#047857"),
  backgroundColor: z.string().optional().default("#f8fafc"),
  darkBackgroundColor: z.string().optional().default("#0f172a"),
  cardBackgroundColor: z.string().optional().default("#ffffff"),
  darkCardBackgroundColor: z.string().optional().default("#1e293b"),
  textColor: z.string().optional().default("#334155"),
  darkTextColor: z.string().optional().default("#f1f5f9"),
  headingColor: z.string().optional().default("#0f172a"),
  darkHeadingColor: z.string().optional().default("#ffffff"),
  showLogo: z.boolean().optional().default(true),
  logoUrl: z.string().optional(),
  brandName: z.string().optional().default("Frogmen Technologies"),
  headerStyle: z.enum(["banner", "minimal", "centered"]).optional().default("banner"),
  ctaLabel: z.string().optional(),
  ctaUrl: z.string().optional(),
  ctaStyle: z.enum(["solid", "outline", "rounded"]).optional().default("rounded"),
  footerText: z.string().optional(),
  companyAddress: z.string().optional(),
  showUnsubscribe: z.boolean().optional().default(true),
});
export type EmailDesignConfig = z.infer<typeof emailDesignConfigSchema>;

export const targetAudienceFilterSchema = z.object({
  audienceType: emailAudienceTypeSchema.default("all"),
  // Contact filters
  contactAccountTypes: z.array(z.enum(["individual", "company"])).optional(),
  contactIsActiveOnly: z.boolean().optional().default(true),
  // Lead filters
  leadStages: z.array(z.string()).optional(),
  leadPriorities: z.array(z.string()).optional(),
  leadSources: z.array(z.string()).optional(),
  leadContactStatuses: z.array(z.string()).optional(),
  // Manual / specific IDs
  selectedCustomerIds: z.array(z.string().uuid()).optional(),
  selectedLeadIds: z.array(z.string().uuid()).optional(),
  selectedEmails: z.array(z.string()).optional(),
  excludedEmails: z.array(z.string()).optional(),
  customEmails: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        company: z.string().optional(),
      }),
    )
    .optional(),
  excludeUnsubscribed: z.boolean().optional().default(true),
});
export type TargetAudienceFilter = z.infer<typeof targetAudienceFilterSchema>;

// Template Schemas
export const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(255),
  description: z.string().trim().optional(),
  category: emailTemplateCategorySchema.default("custom"),
  subject: z.string().trim().min(1, "Default subject is required").max(255),
  previewText: z.string().trim().max(255).optional(),
  bodyHtml: z.string().min(1, "HTML content is required"),
  bodyText: z.string().optional(),
  designConfig: emailDesignConfigSchema.optional(),
  isSystemPreset: z.boolean().optional().default(false),
});
export type CreateEmailTemplateInput = z.input<typeof createEmailTemplateSchema>;

export const updateEmailTemplateSchema = createEmailTemplateSchema.partial();
export type UpdateEmailTemplateInput = z.input<typeof updateEmailTemplateSchema>;

// Campaign Schemas
export const createEmailCampaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required").max(255),
  subject: z.string().trim().min(1, "Subject line is required").max(255),
  previewText: z.string().trim().max(255).optional(),
  fromName: z.string().trim().max(150).optional(),
  fromEmail: z.string().trim().email().optional(),
  replyTo: z.string().trim().email().optional(),
  templateId: z.string().uuid().optional(),
  bodyHtml: z.string().min(1, "Email body HTML is required"),
  bodyText: z.string().optional(),
  designConfig: emailDesignConfigSchema.optional(),
  targetAudienceType: emailAudienceTypeSchema.default("all"),
  audienceFilter: targetAudienceFilterSchema.optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
});
export type CreateEmailCampaignInput = z.infer<typeof createEmailCampaignSchema>;

export const updateEmailCampaignSchema = createEmailCampaignSchema.partial().extend({
  status: emailCampaignStatusSchema.optional(),
});
export type UpdateEmailCampaignInput = z.infer<typeof updateEmailCampaignSchema>;

export const testSendCampaignSchema = z.object({
  recipientEmail: z.string().trim().email("Valid email is required"),
  subject: z.string().trim().min(1, "Subject is required"),
  previewText: z.string().optional(),
  bodyHtml: z.string().min(1, "Body HTML is required"),
  bodyText: z.string().optional(),
  designConfig: emailDesignConfigSchema.optional(),
  sampleData: z
    .object({
      name: z.string().optional(),
      firstName: z.string().optional(),
      company: z.string().optional(),
      jobTitle: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
});
export type TestSendCampaignInput = z.infer<typeof testSendCampaignSchema>;

export const listEmailCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: emailCampaignStatusSchema.optional(),
  audienceType: emailAudienceTypeSchema.optional(),
  sortBy: z.enum(["createdAt", "name", "sentAt", "status", "totalRecipients"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListEmailCampaignsQuery = z.infer<typeof listEmailCampaignsQuerySchema>;

export const audiencePreviewQuerySchema = z.object({
  audienceType: emailAudienceTypeSchema.default("all"),
  leadStages: z.string().optional(), // comma-separated
  leadPriorities: z.string().optional(), // comma-separated
  contactAccountTypes: z.string().optional(), // comma-separated
  search: z.string().optional(),
});
export type AudiencePreviewQuery = z.infer<typeof audiencePreviewQuerySchema>;

export const unsubscribeSchema = z.object({
  token: z.string().min(1, "Token is required"),
  reason: z.string().trim().optional(),
});
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
