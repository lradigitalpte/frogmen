import {
  applyTemplatePlaceholders,
  type DocumentTemplateSettings,
} from "@frog1/shared";

export type DocumentEmailType =
  | "quotation"
  | "invoice"
  | "purchase_order"
  | "reminder"
  | "cancellation";

export function buildDocumentEmailDefaults(
  type: DocumentEmailType,
  templates: Required<DocumentTemplateSettings>,
  placeholders: Record<string, string>,
  overrides?: { subject?: string; body?: string },
) {
  const subjectTemplate =
    type === "invoice"
      ? templates.invoiceEmailSubject
      : type === "purchase_order"
        ? templates.poEmailSubject
        : type === "reminder"
          ? templates.reminderEmailSubject
          : templates.emailSubject;

  const bodyTemplate =
    type === "invoice"
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
