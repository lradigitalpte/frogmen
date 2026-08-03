import { apiFetch } from "./api";

export interface WarrantyPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  durationMonths: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedWarrantyPolicies {
  data: WarrantyPolicy[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface WarrantyRegistration {
  id: string;
  organizationId: string;
  policyId: string;
  status: "active" | "expired" | "voided";
  source: "sale" | "manual";
  startsAt: string;
  endsAt: string;
  soldAt: string;
  productId: string | null;
  productUnitId: string | null;
  serialNumber: string | null;
  productName: string | null;
  customerId: string | null;
  customerName: string | null;
  quantity: number;
  invoiceId: string | null;
  invoiceLineId: string | null;
  salesOrderLineId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  daysLeft: number;
  displayProductName: string;
  displayCustomerName: string;
  policy?: {
    id: string;
    name: string;
    durationMonths: number;
  };
  invoiceNumber?: string | null;
  policyDescription?: string | null;
  productSku?: string | null;
}

export interface PaginatedWarranties {
  data: WarrantyRegistration[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface SaleSearchResult {
  invoiceLineId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  postedAt: string | null;
  customerId: string;
  customerName: string;
  productId: string | null;
  productName: string | null;
  productUnitId: string | null;
  serialNumber: string | null;
  quantity: string;
  defaultWarrantyPolicyId: string | null;
  lineWarrantyPolicyId: string | null;
  soldAt: string;
  resolvedPolicyId: string | null;
}

export interface PaginatedSaleSearch {
  data: SaleSearchResult[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listWarrantyPolicies(
  params: {
    search?: string;
    activeOnly?: boolean;
    page?: number;
    perPage?: number;
  } = {},
) {
  return apiFetch<PaginatedWarrantyPolicies>(
    `/api/v1/warranty-policies${toQuery(params)}`,
  );
}

export function createWarrantyPolicy(input: {
  name: string;
  description?: string;
  durationMonths?: number;
  isActive?: boolean;
}) {
  return apiFetch<WarrantyPolicy>("/api/v1/warranty-policies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWarrantyPolicy(
  id: string,
  input: {
    name?: string;
    description?: string;
    durationMonths?: number;
    isActive?: boolean;
  },
) {
  return apiFetch<WarrantyPolicy>(`/api/v1/warranty-policies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function seedDefaultWarrantyPolicy() {
  return apiFetch<PaginatedWarrantyPolicies>(
    "/api/v1/warranty-policies/seed-default",
    {
      method: "POST",
    },
  );
}

export function listWarranties(
  params: {
    search?: string;
    status?: "active" | "expired" | "voided";
    productId?: string;
    productUnitId?: string;
    expiringSoon?: boolean;
    page?: number;
    perPage?: number;
  } = {},
) {
  return apiFetch<PaginatedWarranties>(
    `/api/v1/warranties${toQuery(params)}`,
  );
}

export function getWarranty(id: string) {
  return apiFetch<WarrantyRegistration>(`/api/v1/warranties/${id}`);
}

export function createWarranty(input: {
  policyId: string;
  soldAt: string;
  endsAt?: string;
  notes?: string;
  invoiceLineId?: string;
  productId?: string;
  productUnitId?: string;
  productName?: string;
  serialNumber?: string;
  customerId?: string;
  customerName?: string;
  quantity?: number;
}) {
  return apiFetch<WarrantyRegistration>("/api/v1/warranties", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function searchWarrantySales(
  params: {
    search?: string;
    page?: number;
    perPage?: number;
  } = {},
) {
  return apiFetch<PaginatedSaleSearch>(
    `/api/v1/warranties/search-sales${toQuery(params)}`,
  );
}
