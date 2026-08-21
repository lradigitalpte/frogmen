import { z } from "zod";

export const leadSourceSchema = z.enum([
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

export const leadStageSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
]);

export const leadContactStatusSchema = z.enum([
  "not_contacted",
  "attempted",
  "contacted",
  "meeting_scheduled",
  "proposal_sent",
  "unresponsive",
]);

export const leadPrioritySchema = z.enum(["hot", "warm", "cold"]);

export const createLeadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  company: z.string().trim().min(1, "Company is required").max(255),
  email: z.string().trim().email().optional().or(z.literal("")).transform((val) => val || undefined),
  phone: z.string().trim().max(50).optional().or(z.literal("")).transform((val) => val || undefined),
  jobTitle: z.string().trim().max(150).optional().or(z.literal("")).transform((val) => val || undefined),
  leadSource: leadSourceSchema.default("website"),
  sourceDetails: z.string().trim().optional().or(z.literal("")).transform((val) => val || undefined),
  priority: leadPrioritySchema.default("warm"),
  estimatedValue: z.number().nonnegative().default(0),
  assignedToName: z.string().trim().max(150).optional().or(z.literal("")).transform((val) => val || undefined),
  notes: z.string().trim().optional().or(z.literal("")).transform((val) => val || undefined),
  contacted: z.boolean().default(false),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  stage: leadStageSchema.optional(),
  contactStatus: leadContactStatusSchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
});

export const updateLeadStageSchema = z.object({
  stage: leadStageSchema,
});

export const logContactSchema = z.object({
  type: z.enum(["call", "email", "whatsapp", "meeting", "note"]),
  summary: z.string().trim().min(1, "Summary is required"),
  outcome: z.string().trim().optional().or(z.literal("")).transform((val) => val || undefined),
  nextFollowUp: z.string().optional().or(z.literal("")).transform((val) => val || undefined),
  authorName: z.string().trim().default("Sales Rep"),
});

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  leadSource: leadSourceSchema.optional(),
  contacted: z.enum(["true", "false", "all"]).optional(),
  stage: leadStageSchema.optional(),
  priority: leadPrioritySchema.optional(),
  sortBy: z.enum(["createdAt", "name", "company", "estimatedValue", "score", "nextFollowUp"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type LogContactInput = z.infer<typeof logContactSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
