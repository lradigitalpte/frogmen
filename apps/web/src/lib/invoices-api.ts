import { apiFetch } from "./api";

export type InvoiceStatus = "draft" | "posted" | "paid" | "cancelled";
export type PaymentStatus = "draft" | "in_process" | "paid";

export interface InvoiceLine {
  id: string;
  description: string;
  serialNumber?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRatePercent: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  branchId: string;
  number: string;
  salesOrderId?: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerReference?: string;
  invoiceDate: string;
  dueDate: string;
  paymentTerm: string;
  status: InvoiceStatus;
  currencyId: string;
  currencyCode?: string | null;
  exchangeRate?: number | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  amountTotalBase: number;
  amountPaid?: number;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancellationReturnToStock?: boolean;
  creditNote?: {
    id: string;
    number: string;
    reason: string;
    refundDue: number;
    refundPaid: number;
    returnToStock: boolean;
  } | null;
  notes?: string;
  lines: InvoiceLine[];
  createdAt: string;
}

export interface CreditNote {
  id: string;
  number: string;
  invoiceNumber: string;
  customerName: string;
  date: string;
  reason: string;
  amount: number;
  currencyId?: string;
  currencyCode?: string | null;
  status: "draft" | "posted";
  refundDue?: number;
  refundPaid?: number;
}

export interface CustomerPayment {
  id: string;
  date: string;
  name: string;
  journal: string;
  paymentMethod: string;
  partner: string;
  amountCurrency: number;
  amount: number;
  currencyId?: string;
  currencyCode?: string | null;
  state: PaymentStatus;
}

export interface CreateInvoiceInput {
  salesOrderId?: string;
  customerId?: string;
  currencyId?: string;
  invoiceDate: string;
  dueDate?: string;
  customerReference?: string;
  internalReference?: string;
  notes?: string;
  lines?: Array<{
    productId?: string;
    productUnitId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    taxRatePercent?: number;
  }>;
}

export function listInvoices(params: { search?: string; perPage?: number } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.perPage) query.set("perPage", String(params.perPage));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiFetch<Invoice[]>(`/api/v1/invoices${suffix}`);
}

export function getInvoice(id: string) {
  return apiFetch<Invoice>(`/api/v1/invoices/${id}`);
}

export function confirmInvoice(id: string) {
  return apiFetch<Invoice>(`/api/v1/invoices/${id}/confirm`, { method: "POST" });
}

export function resetInvoiceToDraft(id: string) {
  return apiFetch<Invoice>(`/api/v1/invoices/${id}/reset`, { method: "POST" });
}

export function cancelInvoice(id: string, input: { reason: string; returnToStock: boolean }) {
  return apiFetch<Invoice>(`/api/v1/invoices/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteCancelledInvoice(id: string) {
  return apiFetch<{ archived: boolean }>(`/api/v1/invoices/${id}`, { method: "DELETE" });
}

export function sendInvoiceEmail(
  id: string,
  input: { recipientEmail: string; subject: string; body: string },
) {
  return apiFetch<{ success: boolean; sentAt: string }>(`/api/v1/invoices/${id}/send-email`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendInvoiceCancellationEmail(
  id: string,
  input: { recipientEmail: string; subject: string; body: string },
) {
  return apiFetch<{ delivered: boolean; mode: string }>(`/api/v1/invoices/${id}/cancellation-email`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function recordCreditNoteRefund(
  id: string,
  input: { amount: number; currencyId: string; refundDate: string; method: string; reference?: string },
) {
  return apiFetch(`/api/v1/credit-notes/${id}/refunds`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function registerInvoicePayment(
  id: string,
  paymentDetails: {
    amount: number;
    paymentDate: string;
    currencyId?: string;
    method?: string;
    reference?: string;
    journal?: string;
  },
) {
  return apiFetch<Invoice>(`/api/v1/invoices/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(paymentDetails),
  });
}

export function createCreditNoteFromInvoice(
  invoiceId: string,
  input: { reason: string; creditDate: string },
) {
  return apiFetch<CreditNote>(`/api/v1/invoices/${invoiceId}/credit-notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listCustomerPayments() {
  return apiFetch<CustomerPayment[]>("/api/v1/payments");
}

export function listCreditNotes() {
  return apiFetch<CreditNote[]>("/api/v1/credit-notes");
}

export function createInvoice(input: CreateInvoiceInput) {
  return apiFetch<Invoice>("/api/v1/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
