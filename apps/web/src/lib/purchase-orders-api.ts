import { apiFetch } from "./api";

export type PurchaseOrderState = "draft" | "confirmed" | "cancelled";
export type PurchaseReceiptStatus =
  | "none"
  | "to_receive"
  | "partial"
  | "received";
export type GoodsReceiptState = "draft" | "done" | "cancelled";

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  lineNumber: number;
  productId: string | null;
  warehouseId: string | null;
  description: string;
  quantity: string;
  qtyReceived: string;
  qtyRemaining?: number;
  unitPrice: string;
  discountPercent: string;
  taxRatePercent: string;
  priceSubtotal: string;
  priceTax: string;
  priceTotal: string;
  productName?: string | null;
  productSku?: string | null;
  trackSerial?: boolean | null;
  productType?: string | null;
  warehouseName?: string | null;
}

export interface PurchaseActivity {
  id: string;
  activityType: string;
  message: string | null;
  userId: string | null;
  userName?: string | null;
  userEmail?: string | null;
  createdAt: string;
}

export interface GoodsReceiptSummary {
  id: string;
  number: string;
  state: GoodsReceiptState;
  receiptDate: string;
  purchaseOrderId: string;
  validatedAt: string | null;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  branchId: string;
  organizationId: string;
  number: string;
  state: PurchaseOrderState;
  receiptStatus: PurchaseReceiptStatus;
  vendorId: string;
  vendorName?: string;
  vendorEmail?: string | null;
  currencyId: string;
  currencyCode?: string;
  currencySymbol?: string;
  exchangeRate: string | null;
  orderDate: string;
  expectedDate: string | null;
  vendorReference: string | null;
  internalReference: string | null;
  notes: string | null;
  amountUntaxed: string;
  amountTax: string;
  amountTotal: string;
  amountUntaxedBase?: string;
  amountTaxBase?: string;
  amountTotalBase: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: PurchaseOrderLine[];
  receipts?: GoodsReceiptSummary[];
  activities?: PurchaseActivity[];
}

export interface GoodsReceiptLine {
  id: string;
  goodsReceiptId: string;
  purchaseOrderLineId: string;
  lineNumber: number;
  productId: string;
  warehouseId: string;
  quantity: string;
  serialNumbers: string[] | null;
  productName?: string;
  productSku?: string | null;
  trackSerial?: boolean;
  warehouseName?: string;
  poLineQuantity?: string;
  poLineQtyReceived?: string;
  qtyRemaining?: number;
}

export interface GoodsReceipt {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  purchaseOrderNumber?: string;
  vendorName?: string;
  number: string;
  state: GoodsReceiptState;
  receiptDate: string;
  notes: string | null;
  validatedAt: string | null;
  createdAt: string;
  lines?: GoodsReceiptLine[];
}

export interface ListPurchaseOrdersParams {
  state?: PurchaseOrderState;
  receiptStatus?: PurchaseReceiptStatus;
  vendorId?: string;
  search?: string;
  page?: number;
  perPage?: number;
  sortBy?: "number" | "orderDate" | "amountTotal" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface PaginatedPurchaseOrders {
  data: PurchaseOrder[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

function poQuery(params: ListPurchaseOrdersParams) {
  const search = new URLSearchParams();
  if (params.state) search.set("state", params.state);
  if (params.receiptStatus) search.set("receiptStatus", params.receiptStatus);
  if (params.vendorId) search.set("vendorId", params.vendorId);
  if (params.search) search.set("search", params.search);
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("perPage", String(params.perPage));
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.sortDir) search.set("sortDir", params.sortDir);
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listPurchaseOrders(params: ListPurchaseOrdersParams = {}) {
  return apiFetch<PaginatedPurchaseOrders>(
    `/api/v1/purchase-orders${poQuery(params)}`,
  );
}

export function getPurchaseOrder(id: string) {
  return apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${id}`);
}

export function sendPurchaseOrderEmail(
  id: string,
  input: { recipientEmail: string; subject: string; body: string },
) {
  return apiFetch<{ success: boolean; sentAt: string }>(
    `/api/v1/purchase-orders/${id}/send-email`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function createPurchaseOrder(input: {
  vendorId: string;
  currencyId: string;
  orderDate: string;
  expectedDate?: string;
  vendorReference?: string;
  internalReference?: string;
  notes?: string;
}) {
  return apiFetch<PurchaseOrder>("/api/v1/purchase-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePurchaseOrder(
  id: string,
  input: Partial<{
    vendorId: string;
    currencyId: string;
    orderDate: string;
    expectedDate: string | null;
    vendorReference: string | null;
    internalReference: string | null;
    notes: string | null;
  }>,
) {
  return apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function addPurchaseOrderLine(
  orderId: string,
  input: {
    productId: string;
    warehouseId: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    taxRatePercent?: number;
  },
) {
  return apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${orderId}/lines`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePurchaseOrderLine(
  orderId: string,
  lineId: string,
  input: Partial<{
    warehouseId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxRatePercent: number;
  }>,
) {
  return apiFetch<PurchaseOrder>(
    `/api/v1/purchase-orders/${orderId}/lines/${lineId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function deletePurchaseOrderLine(orderId: string, lineId: string) {
  return apiFetch<PurchaseOrder>(
    `/api/v1/purchase-orders/${orderId}/lines/${lineId}`,
    { method: "DELETE" },
  );
}

export function confirmPurchaseOrder(id: string) {
  return apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${id}/confirm`, {
    method: "POST",
  });
}

export function cancelPurchaseOrder(id: string) {
  return apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${id}/cancel`, {
    method: "POST",
  });
}

export function deletePurchaseOrder(id: string) {
  return apiFetch<{ success: true }>(`/api/v1/purchase-orders/${id}`, {
    method: "DELETE",
  });
}

export function addPurchaseOrderNote(id: string, message: string) {
  return apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function createGoodsReceipt(purchaseOrderId: string) {
  return apiFetch<GoodsReceipt>(
    `/api/v1/purchase-orders/${purchaseOrderId}/receipts`,
    { method: "POST" },
  );
}

export function listGoodsReceipts(params: { page?: number; perPage?: number } = {}) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("perPage", String(params.perPage));
  const query = search.toString();
  return apiFetch<{ data: GoodsReceipt[]; meta: PaginatedPurchaseOrders["meta"] }>(
    `/api/v1/goods-receipts${query ? `?${query}` : ""}`,
  );
}

export function getGoodsReceipt(id: string) {
  return apiFetch<GoodsReceipt>(`/api/v1/goods-receipts/${id}`);
}

export function updateGoodsReceiptLine(
  receiptId: string,
  lineId: string,
  input: { quantity: number; serialNumbers?: string[] },
) {
  return apiFetch<GoodsReceipt>(
    `/api/v1/goods-receipts/${receiptId}/lines/${lineId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function validateGoodsReceipt(id: string) {
  return apiFetch<GoodsReceipt>(`/api/v1/goods-receipts/${id}/validate`, {
    method: "POST",
  });
}
