import { apiFetch } from "./api";

export interface DeliveryNoteLine {
  id: string | null;
  lineNumber: number;
  invoiceLineId: string | null;
  description: string;
  productDescription?: string | null;
  serialNumber?: string | null;
  serialEntries?: Array<{
    productName: string;
    serialNumber: string;
    isKit?: boolean;
  }>;
  quantity: number;
  productId?: string | null;
  productUnitId?: string | null;
}

export interface DeliveryNote {
  id: string | null;
  state: "draft" | "approved";
  number: string | null;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  deliveryDate: string;
  deliveryStreet1?: string | null;
  deliveryStreet2?: string | null;
  deliveryCity?: string | null;
  deliveryZip?: string | null;
  deliveryStateCode?: string | null;
  deliveryCountryCode?: string | null;
  deliveryAddress: string[];
  receivedBy: string | null;
  signatureImage: string | null;
  signedOn: string | null;
  companyName: string;
  companyLogoUrl: string | null;
  companyAddress: string[];
  lines: DeliveryNoteLine[];
  createdAt?: string;
}

export interface ApproveDeliveryNoteInput {
  deliveryDate?: string;
}

export function previewDeliveryNote(invoiceId: string) {
  return apiFetch<DeliveryNote>(
    `/api/v1/invoices/${invoiceId}/delivery-notes/preview`,
    { method: "POST" },
  );
}

export function approveDeliveryNote(
  invoiceId: string,
  input: ApproveDeliveryNoteInput,
) {
  return apiFetch<DeliveryNote>(`/api/v1/invoices/${invoiceId}/delivery-notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDeliveryNote(id: string) {
  return apiFetch<DeliveryNote>(`/api/v1/delivery-notes/${id}`);
}

export function listDeliveryNotesByInvoice(invoiceId: string) {
  return apiFetch<DeliveryNote[]>(`/api/v1/invoices/${invoiceId}/delivery-notes`);
}

export function getDeliveryNoteDocumentHtml(id: string) {
  return fetch(`/api/v1/delivery-notes/${id}/document.html`, {
    credentials: "include",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to load delivery note preview");
    }
    return response.text();
  });
}

export function getDeliveryNoteDocumentPdfUrl(id: string) {
  return `/api/v1/delivery-notes/${id}/document.pdf`;
}

export function getDeliveryNotePreviewPdfUrl(invoiceId: string) {
  return `/api/v1/invoices/${invoiceId}/delivery-notes/preview/document.pdf`;
}

export function getDeliveryNotePreviewHtml(invoiceId: string) {
  return fetch(`/api/v1/invoices/${invoiceId}/delivery-notes/preview/document.html`, {
    credentials: "include",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to load delivery note preview");
    }
    return response.text();
  });
}

export function sendDeliveryNoteEmail(
  id: string,
  input: { recipientEmail: string; subject: string; body: string },
) {
  return apiFetch<{ delivered: boolean; mode: string }>(
    `/api/v1/delivery-notes/${id}/send-email`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
