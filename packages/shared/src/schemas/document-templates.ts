import { z } from "zod";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined);
}

export const documentTemplateSettingsSchema = z.object({
  documentStyle: z
    .enum(["official_blue", "modern_navy", "clean_minimal"])
    .optional(),
  lineItemDetailsLayout: z.enum(["bullets", "comma"]).optional(),
  quotationTitle: optionalText(120),
  invoiceTitle: optionalText(120),
  footerText: optionalText(1000),
  termsAndConditions: optionalText(5000),
  bankName: optionalText(255),
  bankAccountName: optionalText(255),
  bankAccount: optionalText(255),
  bankIban: optionalText(100),
  bankSwiftCode: optionalText(50),
  paymentInstructions: optionalText(2000),
  defaultPaymentTerms: optionalText(1000),
  defaultDeliveryTerms: optionalText(1000),
  defaultWarrantyNotes: optionalText(1000),
  invoiceValidityDays: z.coerce.number().int().min(0).max(365).optional(),
  showTaxBreakdown: z.boolean().optional(),
  showBillingAddress: z.boolean().optional(),
  emailSubject: optionalText(255),
  emailBodyIntro: optionalText(2000),
  invoiceEmailSubject: optionalText(255),
  invoiceEmailBodyIntro: optionalText(2000),
  poEmailSubject: optionalText(255),
  poEmailBodyIntro: optionalText(2000),
  reminderEmailSubject: optionalText(255),
  reminderEmailBodyIntro: optionalText(2000),
});

export const updateDocumentTemplatesSchema = documentTemplateSettingsSchema;

export type DocumentTemplateSettings = z.infer<
  typeof documentTemplateSettingsSchema
>;
export type UpdateDocumentTemplatesInput = z.infer<
  typeof updateDocumentTemplatesSchema
>;

export const DEFAULT_DOCUMENT_TEMPLATES: Required<DocumentTemplateSettings> = {
  documentStyle: "official_blue",
  lineItemDetailsLayout: "bullets",
  quotationTitle: "Quotation",
  invoiceTitle: "Commercial Invoice",
  footerText: "Thank you for your business.",
  termsAndConditions:
    "Payment is due within the agreed terms. Goods remain the property of the seller until paid in full.",
  bankName: "",
  bankAccountName: "",
  bankAccount: "",
  bankIban: "",
  bankSwiftCode: "",
  paymentInstructions: "",
  defaultPaymentTerms: "Payment is due within the agreed terms.",
  defaultDeliveryTerms: "",
  defaultWarrantyNotes: "",
  invoiceValidityDays: 15,
  showTaxBreakdown: true,
  showBillingAddress: true,
  emailSubject: "Quotation {{number}} from {{companyName}}",
  emailBodyIntro:
    "Dear {{customerName}},\n\nPlease find attached quotation {{number}} for {{total}}.\n\nKind regards,\n{{companyName}}",
  invoiceEmailSubject: "Invoice {{number}} from {{companyName}}",
  invoiceEmailBodyIntro:
    "Dear {{customerName}},\n\nPlease find attached invoice {{number}} for {{total}}. Payment is due on {{dueDate}}.\n\nKind regards,\n{{companyName}}",
  poEmailSubject: "Purchase Order {{number}} from {{companyName}}",
  poEmailBodyIntro:
    "Dear {{customerName}},\n\nPlease find attached purchase order {{number}} for {{total}}.\n\nKind regards,\n{{companyName}}",
  reminderEmailSubject: "Payment reminder: Invoice {{number}}",
  reminderEmailBodyIntro:
    "Dear {{customerName}},\n\nThis is a friendly reminder that invoice {{number}} for {{outstanding}} is due on {{dueDate}}.\n\nPlease arrange payment at your earliest convenience.\n\nThank you,\n{{companyName}}",
};

export function parseOrgDocumentTemplates(
  metadata: string | null | undefined,
): DocumentTemplateSettings {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata) as {
      documentTemplates?: DocumentTemplateSettings;
    };
    return parsed.documentTemplates ?? {};
  } catch {
    return {};
  }
}

export function resolveDocumentTemplates(
  settings: DocumentTemplateSettings = {},
): Required<DocumentTemplateSettings> {
  return {
    documentStyle:
      settings.documentStyle ?? DEFAULT_DOCUMENT_TEMPLATES.documentStyle,
    lineItemDetailsLayout:
      settings.lineItemDetailsLayout ??
      DEFAULT_DOCUMENT_TEMPLATES.lineItemDetailsLayout,
    quotationTitle:
      settings.quotationTitle ?? DEFAULT_DOCUMENT_TEMPLATES.quotationTitle,
    invoiceTitle:
      settings.invoiceTitle ?? DEFAULT_DOCUMENT_TEMPLATES.invoiceTitle,
    footerText: settings.footerText ?? DEFAULT_DOCUMENT_TEMPLATES.footerText,
    termsAndConditions:
      settings.termsAndConditions ??
      DEFAULT_DOCUMENT_TEMPLATES.termsAndConditions,
    bankName: settings.bankName ?? DEFAULT_DOCUMENT_TEMPLATES.bankName,
    bankAccountName:
      settings.bankAccountName ?? DEFAULT_DOCUMENT_TEMPLATES.bankAccountName,
    bankAccount:
      settings.bankAccount ?? DEFAULT_DOCUMENT_TEMPLATES.bankAccount,
    bankIban: settings.bankIban ?? DEFAULT_DOCUMENT_TEMPLATES.bankIban,
    bankSwiftCode:
      settings.bankSwiftCode ?? DEFAULT_DOCUMENT_TEMPLATES.bankSwiftCode,
    paymentInstructions:
      settings.paymentInstructions ??
      DEFAULT_DOCUMENT_TEMPLATES.paymentInstructions,
    defaultPaymentTerms:
      settings.defaultPaymentTerms ??
      DEFAULT_DOCUMENT_TEMPLATES.defaultPaymentTerms,
    defaultDeliveryTerms:
      settings.defaultDeliveryTerms ??
      DEFAULT_DOCUMENT_TEMPLATES.defaultDeliveryTerms,
    defaultWarrantyNotes:
      settings.defaultWarrantyNotes ??
      DEFAULT_DOCUMENT_TEMPLATES.defaultWarrantyNotes,
    invoiceValidityDays:
      settings.invoiceValidityDays ??
      DEFAULT_DOCUMENT_TEMPLATES.invoiceValidityDays,
    showTaxBreakdown:
      settings.showTaxBreakdown ?? DEFAULT_DOCUMENT_TEMPLATES.showTaxBreakdown,
    showBillingAddress:
      settings.showBillingAddress ??
      DEFAULT_DOCUMENT_TEMPLATES.showBillingAddress,
    emailSubject:
      settings.emailSubject ?? DEFAULT_DOCUMENT_TEMPLATES.emailSubject,
    emailBodyIntro:
      settings.emailBodyIntro ?? DEFAULT_DOCUMENT_TEMPLATES.emailBodyIntro,
    invoiceEmailSubject:
      settings.invoiceEmailSubject ??
      DEFAULT_DOCUMENT_TEMPLATES.invoiceEmailSubject,
    invoiceEmailBodyIntro:
      settings.invoiceEmailBodyIntro ??
      DEFAULT_DOCUMENT_TEMPLATES.invoiceEmailBodyIntro,
    poEmailSubject:
      settings.poEmailSubject ?? DEFAULT_DOCUMENT_TEMPLATES.poEmailSubject,
    poEmailBodyIntro:
      settings.poEmailBodyIntro ?? DEFAULT_DOCUMENT_TEMPLATES.poEmailBodyIntro,
    reminderEmailSubject:
      settings.reminderEmailSubject ??
      DEFAULT_DOCUMENT_TEMPLATES.reminderEmailSubject,
    reminderEmailBodyIntro:
      settings.reminderEmailBodyIntro ??
      DEFAULT_DOCUMENT_TEMPLATES.reminderEmailBodyIntro,
  };
}

export function applyTemplatePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return values[key] ?? "";
  });
}
