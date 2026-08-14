import { apiFetch } from "./api";

export interface QuotationFollowupSettings {
  customerAutomationEnabled: boolean;
  customerFollowupDays: number[];
  internalAutomationEnabled: boolean;
  internalReminderAfterDays: number;
  customerSubject: string;
  customerMessage: string;
}

export interface QuotationFollowupItem {
  id: string;
  number: string;
  state: "sent" | "signed";
  sentAt: string | null;
  validityDate: string | null;
  amountTotal: string;
  customerName: string;
  customerEmail: string | null;
  currencyCode: string;
  daysSinceSent: number;
  followupCount: number;
  lastFollowupAt: string | null;
}

export function getQuotationFollowups() {
  return apiFetch<{
    quotations: QuotationFollowupItem[];
    settings: QuotationFollowupSettings;
  }>("/api/v1/quotation-followups");
}

export function updateQuotationFollowupSettings(input: QuotationFollowupSettings) {
  return apiFetch<QuotationFollowupSettings>("/api/v1/quotation-followups/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function sendQuotationFollowup(input: {
  quotationId: string;
  recipientEmail: string;
  subject: string;
  message: string;
}) {
  return apiFetch<{ success: boolean; recipient: string; quotationNumber: string }>(
    "/api/v1/quotation-followups/send",
    { method: "POST", body: JSON.stringify(input) },
  );
}
