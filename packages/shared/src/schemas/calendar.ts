import { z } from "zod";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD)");

const optionalIsoDate = isoDate
  .optional()
  .or(z.literal(""))
  .or(z.null())
  .transform((value) => value || null);

const optionalTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time (HH:MM)")
  .optional()
  .or(z.literal(""))
  .or(z.null())
  .transform((value) => value || null);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.null())
    .transform((value) => value || null);

/** Comma / newline separated list of email addresses. */
const emailList = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.null())
  .transform((value) => {
    const emails = parseEmailList(value ?? "");
    return emails.length ? emails.join(", ") : null;
  })
  .refine(
    (value) =>
      !value ||
      parseEmailList(value).every((email) =>
        z.string().email().safeParse(email).success,
      ),
    { message: "One or more email addresses are invalid" },
  );

export function parseEmailList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

export const calendarEventCategorySchema = z.enum([
  "meeting",
  "reminder",
  "deadline",
  "follow_up",
  "holiday",
  "other",
]);

export const calendarSourceSchema = z.enum([
  "event",
  "holiday",
  "purchase_order",
  "goods_receipt",
  "invoice_due",
  "quotation_expiry",
  "warranty_expiry",
  "customer_anniversary",
  "vendor_anniversary",
]);

const reminderDaysSchema = z
  .union([z.coerce.number().int().min(0).max(365), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === "" || value === undefined ? null : value));

const calendarEventFields = {
  title: z.string().trim().min(1, "Title is required").max(255),
  description: optionalText(5000),
  category: calendarEventCategorySchema.default("other"),
  startDate: isoDate,
  endDate: optionalIsoDate,
  startTime: optionalTime,
  endTime: optionalTime,
  customerId: z.string().uuid().optional().or(z.null()).transform((v) => v ?? null),
  vendorId: z.string().uuid().optional().or(z.null()).transform((v) => v ?? null),
  reminderDaysBefore: reminderDaysSchema,
  reminderEmails: emailList,
};

function validateEventRange(
  data: { startDate?: string; endDate?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date cannot be before the start date",
    });
  }
}

export const createCalendarEventSchema = z
  .object(calendarEventFields)
  .superRefine(validateEventRange);

export const updateCalendarEventSchema = z
  .object(calendarEventFields)
  .partial()
  .superRefine(validateEventRange);

export const listCalendarEventsQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    sources: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter((item) => calendarSourceSchema.safeParse(item).success)
          : undefined,
      ),
  })
  .refine((data) => data.to >= data.from, {
    path: ["to"],
    message: "'to' must be on or after 'from'",
  })
  .refine(
    (data) =>
      new Date(`${data.to}T00:00:00Z`).getTime() -
        new Date(`${data.from}T00:00:00Z`).getTime() <=
      400 * 86_400_000,
    { path: ["to"], message: "Date range cannot exceed 400 days" },
  );

export const updateCalendarSettingsSchema = z.object({
  trackedCountries: z
    .array(z.string().trim().length(2).transform((code) => code.toUpperCase()))
    .max(50)
    .optional(),
  remindersEnabled: z.boolean().optional(),
  reminderEmails: emailList.optional(),
  digestLookaheadDays: z.coerce.number().int().min(0).max(30).optional(),
  digestHour: z.coerce.number().int().min(0).max(23).optional(),
  includeDeliveries: z.boolean().optional(),
  includeAnniversaries: z.boolean().optional(),
  includeHolidays: z.boolean().optional(),
  includeInvoices: z.boolean().optional(),
});

export type CalendarEventCategory = z.infer<typeof calendarEventCategorySchema>;
export type CalendarSource = z.infer<typeof calendarSourceSchema>;
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type ListCalendarEventsQuery = z.infer<typeof listCalendarEventsQuerySchema>;
export type UpdateCalendarSettingsInput = z.infer<
  typeof updateCalendarSettingsSchema
>;

export type CalendarItemStatus =
  | "upcoming"
  | "today"
  | "overdue"
  | "done"
  | "late"
  | "draft"
  | "paid";

/** A unified calendar entry — manual events and system-derived dates. */
export interface CalendarItem {
  id: string;
  source: CalendarSource;
  title: string;
  subtitle?: string | null;
  date: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  category?: CalendarEventCategory | null;
  status?: CalendarItemStatus | null;
  countryCode?: string | null;
  url?: string | null;
  eventId?: string | null;
}
