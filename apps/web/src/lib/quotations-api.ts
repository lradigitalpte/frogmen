import { apiFetch } from "./api";

export type QuotationState = "draft" | "sent" | "signed" | "confirmed" | "cancelled";

export interface QuotationLine {
  id: string;
  salesOrderId: string;
  lineNumber: number;
  productId: string | null;
  productUnitId: string | null;
  serialNumber?: string | null;
  warehouseId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRatePercent: string;
  priceSubtotal: string;
  priceTax: string;
  priceTotal: string;
}

export interface QuotationActivity {
  id: string;
  activityType: string;
  message: string;
  performedBy?: string;
  createdAt: string;
}

export interface Quotation {
  id: string;
  organizationId: string;
  branchId: string;
  number: string;
  state: QuotationState;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  currencyId: string;
  currencyCode?: string;
  paymentTermId?: string | null;
  exchangeRate: string | null;
  quoteDate: string;
  validityDate: string | null;
  customerReference: string | null;
  internalReference: string | null;
  paymentReference: string | null;
  notes: string | null;
  internalNotes?: string | null;
  deliveryFeeAmount?: string | null;
  deliveryFeePercent?: string | null;
  accessToken?: string | null;
  signedBy?: string | null;
  signedOn?: string | null;
  signatureImage?: string | null;
  signedIp?: string | null;
  signedEmail?: string | null;
  customerPoDocumentUrl?: string | null;
  amountUntaxed: string;
  amountTax: string;
  amountTotal: string;
  amountUntaxedBase?: string;
  amountTaxBase?: string;
  amountTotalBase: string;
  invoiceStatus: "none" | "to_invoice" | "partial" | "invoiced";
  dealId?: string | null;
  dealSiblings?: Array<{
    id: string;
    number: string;
    state: QuotationState;
    amountTotal: string;
    currencyCode?: string | null;
    quoteDate: string;
  }>;
  createdAt: string;
  updatedAt: string;
  lines?: QuotationLine[];
  activities?: QuotationActivity[];
}

export interface ListQuotationsParams {
  state?: QuotationState;
  invoiceStatus?: Quotation["invoiceStatus"];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  sortBy?: "number" | "quoteDate" | "amountTotal" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface PaginatedQuotations {
  data: Quotation[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    pipelineTotalBase: string;
    toInvoiceCount?: number;
    invoicedCount?: number;
  };
}

export interface CreateQuotationInput {
  customerId: string;
  currencyId: string;
  paymentTermId?: string;
  quoteDate: string;
  validityDate?: string;
  customerReference?: string;
  internalReference?: string;
  paymentReference?: string;
  notes?: string;
  internalNotes?: string;
  deliveryFeeAmount?: number | null;
  deliveryFeePercent?: number | null;
}

export interface UpdateQuotationInput {
  customerId?: string;
  currencyId?: string;
  paymentTermId?: string | null;
  quoteDate?: string;
  validityDate?: string | null;
  customerReference?: string | null;
  internalReference?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  deliveryFeeAmount?: number | null;
  deliveryFeePercent?: number | null;
  convertCurrency?: boolean;
  convertFromCurrencyId?: string;
}

export interface AddQuotationLineInput {
  productId: string;
  productUnitId?: string;
  warehouseId?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRatePercent?: number;
  warrantyPolicyId?: string | null;
}

export interface UpdateQuotationLineInput {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
  taxRatePercent?: number;
  warrantyPolicyId?: string | null;
}

function toQuery(params: ListQuotationsParams) {
  const search = new URLSearchParams();

  if (params.state) search.set("state", params.state);
  if (params.invoiceStatus) search.set("invoiceStatus", params.invoiceStatus);
  if (params.search) search.set("search", params.search);
  if (params.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params.dateTo) search.set("dateTo", params.dateTo);
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("perPage", String(params.perPage));
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.sortDir) search.set("sortDir", params.sortDir);

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listQuotations(params: ListQuotationsParams = {}) {
  return apiFetch<PaginatedQuotations>(`/api/v1/quotations${toQuery(params)}`);
}

export function getQuotation(id: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}`);
}

export function getQuotationSigningUrl(id: string) {
  return apiFetch<{ url: string }>(`/api/v1/quotations/${id}/signing-url`);
}

export function createQuotation(input: CreateQuotationInput) {
  return apiFetch<Quotation>("/api/v1/quotations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateQuotation(id: string, input: UpdateQuotationInput) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function confirmQuotation(id: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/confirm`, {
    method: "POST",
  });
}

export function markQuotationSent(id: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/mark-sent`, {
    method: "POST",
  });
}

export function cancelQuotation(id: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/cancel`, {
    method: "POST",
  });
}

export function deleteQuotation(id: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/quotations/${id}`, {
    method: "DELETE",
  });
}

export function sendQuotationEmail(
  id: string,
  recipientEmail: string,
  subject: string,
  body: string,
) {
  return apiFetch<{ success: boolean; sentAt: string }>(
    `/api/v1/quotations/${id}/send-email`,
    {
      method: "POST",
      body: JSON.stringify({ recipientEmail, subject, body }),
    },
  );
}

export function addQuotationLine(id: string, input: AddQuotationLineInput) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/lines`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateQuotationLine(
  quotationId: string,
  lineId: string,
  input: UpdateQuotationLineInput,
) {
  return apiFetch<Quotation>(`/api/v1/quotations/${quotationId}/lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteQuotationLine(quotationId: string, lineId: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${quotationId}/lines/${lineId}`, {
    method: "DELETE",
  });
}

export interface QuotationCurrencyDiagnostic {
  id: string;
  number: string;
  state: QuotationState;
  currencyCode: string | null;
  amountTotal: string;
  issue: string;
}

export function getQuotationCurrencyDiagnostics() {
  return apiFetch<QuotationCurrencyDiagnostic[]>(
    "/api/v1/quotations/currency-diagnostics",
  );
}

export function reconvertQuotation(id: string, fromCurrencyId: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/reconvert`, {
    method: "POST",
    body: JSON.stringify({ fromCurrencyId }),
  });
}

// ── Deal Thread API ──────────────────────────────────────────────────────────

export function reviseQuotation(id: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/revise`, {
    method: "POST",
  });
}

export function linkQuotationToDeal(id: string, dealId: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/link-deal`, {
    method: "POST",
    body: JSON.stringify({ dealId }),
  });
}

export function unlinkQuotationFromDeal(id: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/unlink-deal`, {
    method: "DELETE",
  });
}

export function updateQuotationInternalNotes(id: string, internalNotes: string) {
  return apiFetch<Quotation>(`/api/v1/quotations/${id}/internal-notes`, {
    method: "PATCH",
    body: JSON.stringify({ internalNotes }),
  });
}

export interface DealQuotationSummary {
  id: string;
  number: string;
  state: QuotationState;
  amountTotal: string;
  currencyCode?: string | null;
  quoteDate: string;
}

export interface Deal {
  id: string;
  organizationId: string;
  customerId: string;
  customerName?: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  quotations: DealQuotationSummary[];
}

export function listDeals(customerId?: string) {
  const qs = customerId ? `?customerId=${customerId}` : "";
  return apiFetch<Deal[]>(`/api/v1/quotations/deals${qs}`);
}

export async function uploadCustomerPoDocument(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api/v1/quotations/${id}/upload-po`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errJson = await res.json();
    throw new Error(errJson.message || "Failed to upload PO document");
  }

  return res.json() as Promise<Quotation>;
}

