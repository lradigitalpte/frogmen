import { apiFetch } from "./api";
import type {
  CompanyProfileSettings,
  DocumentTemplateSettings,
  SalesPricingSettings,
} from "@frog1/shared";

export interface SalesPricingResponse extends Required<SalesPricingSettings> {
  configured: {
    localAdjustmentPercent: number | null;
    nonLocalAdjustmentPercent: number | null;
  };
}

export interface CompanySettingsResponse {
  name: string;
  logoUrl: string | null;
  baseCurrencyId: string | null;
  baseCurrencyCode: string | null;
  catalogCurrencyId: string | null;
  catalogCurrencyCode: string | null;
  defaultWarehouseId: string | null;
  companyProfile: Required<CompanyProfileSettings>;
}

export function getSalesPricing() {
  return apiFetch<SalesPricingResponse>("/api/v1/settings/sales-pricing");
}

export function updateSalesPricing(input: Required<SalesPricingSettings>) {
  return apiFetch<SalesPricingResponse>("/api/v1/settings/sales-pricing", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getCompanySettings() {
  return apiFetch<CompanySettingsResponse>("/api/v1/settings/company");
}

export function updateCompanySettings(input: {
  name: string;
  baseCurrencyId: string;
  catalogCurrencyId?: string | null;
  defaultWarehouseId?: string | null;
  companyProfile?: CompanyProfileSettings;
}) {
  return apiFetch<CompanySettingsResponse>("/api/v1/settings/company", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function uploadCompanyLogo(file: File) {
  const formData = new FormData();
  formData.append("logo", file);

  const response = await fetch("/api/v1/settings/company/logo", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body?.message === "string"
        ? body.message
        : response.statusText || "Failed to upload logo";
    throw new Error(message);
  }

  return response.json() as Promise<{ logoUrl: string | null }>;
}

export function getDocumentTemplates() {
  return apiFetch<Required<DocumentTemplateSettings>>(
    "/api/v1/settings/document-templates",
  );
}

export function updateDocumentTemplates(input: DocumentTemplateSettings) {
  return apiFetch<Required<DocumentTemplateSettings>>(
    "/api/v1/settings/document-templates",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function getQuotationDocumentHtml(quotationId: string) {
  return fetch(`/api/v1/quotations/${quotationId}/document.html`, {
    credentials: "include",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to load document preview");
    }
    return response.text();
  });
}

export function getQuotationDocumentPdfUrl(quotationId: string) {
  return `/api/v1/quotations/${quotationId}/document.pdf`;
}

export function getInvoiceDocumentHtml(invoiceId: string) {
  return fetch(`/api/v1/invoices/${invoiceId}/document.html`, { credentials: "include" }).then(async (response) => {
    if (!response.ok) throw new Error("Failed to load invoice preview");
    return response.text();
  });
}

export function getInvoiceDocumentPdfUrl(invoiceId: string) {
  return `/api/v1/invoices/${invoiceId}/document.pdf`;
}

export function getPurchaseOrderDocumentHtml(orderId: string) {
  return fetch(`/api/v1/purchase-orders/${orderId}/document.html`, {
    credentials: "include",
  }).then(async (response) => {
    if (!response.ok) throw new Error("Failed to load purchase order preview");
    return response.text();
  });
}

export function getPurchaseOrderDocumentPdfUrl(orderId: string) {
  return `/api/v1/purchase-orders/${orderId}/document.pdf`;
}
