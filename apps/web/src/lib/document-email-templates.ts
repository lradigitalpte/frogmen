import {
  applyTemplatePlaceholders,
  type DocumentTemplateSettings,
} from "@frog1/shared";

export type DocumentEmailType =
  | "quotation"
  | "invoice"
  | "purchase_order"
  | "reminder"
  | "cancellation"
  | "delivery_note";

export function buildDocumentEmailDefaults(
  type: DocumentEmailType,
  templates: Required<DocumentTemplateSettings>,
  placeholders: Record<string, string>,
  overrides?: { subject?: string; body?: string },
) {
  const subjectTemplate =
    type === "delivery_note"
      ? "Delivery Note {{number}} - {{companyName}}"
      : type === "invoice"
        ? templates.invoiceEmailSubject
        : type === "purchase_order"
          ? templates.poEmailSubject
          : type === "reminder"
            ? templates.reminderEmailSubject
            : templates.emailSubject;

  const bodyTemplate =
    type === "delivery_note"
      ? "Dear {{customerName}},\n\nPlease find attached Delivery Note {{number}} for your records.\n\nThank you for choosing {{companyName}}."
      : type === "invoice"
        ? templates.invoiceEmailBodyIntro
        : type === "purchase_order"
          ? templates.poEmailBodyIntro
          : type === "reminder"
            ? templates.reminderEmailBodyIntro
            : templates.emailBodyIntro;

  return {
    subject:
      overrides?.subject?.trim() ||
      applyTemplatePlaceholders(subjectTemplate, placeholders),
    body:
      overrides?.body?.trim() ||
      applyTemplatePlaceholders(bodyTemplate, placeholders),
  };
}
