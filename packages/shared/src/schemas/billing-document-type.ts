import { z } from "zod";

export const billingDocumentTypeSchema = z.enum([
  "tax_invoice",
  "commercial_invoice",
]);

export type BillingDocumentType = z.infer<typeof billingDocumentTypeSchema>;

export function defaultBillingDocumentTypeForCustomer(
  isLocal: boolean,
): BillingDocumentType {
  return isLocal ? "tax_invoice" : "commercial_invoice";
}

export function billingDocumentTypeLabel(type: BillingDocumentType): string {
  return type === "commercial_invoice" ? "Commercial Invoice" : "Tax Invoice";
}

export function billingQuotationTypeLabel(type: BillingDocumentType): string {
  return type === "commercial_invoice"
    ? "Commercial Quotation"
    : "Tax Quotation";
}

export function resolveBillingDocumentTitle(params: {
  documentKind: "quotation" | "invoice";
  billingDocumentType?: BillingDocumentType | null;
  quotationTitle: string;
  invoiceTitle: string;
}): string {
  const billingType = params.billingDocumentType ?? "tax_invoice";

  if (params.documentKind === "invoice") {
    if (billingType === "commercial_invoice") {
      return "Commercial Invoice";
    }
    return params.invoiceTitle;
  }

  if (billingType === "commercial_invoice") {
    return "Commercial Quotation";
  }
  return params.quotationTitle;
}
