import { apiFetch } from "./api";
import type {
  CreateCustomerInput,
  Customer,
  CustomerStats,
  ListCustomersParams,
  PaginatedCustomers,
  UpdateCustomerInput,
} from "@/types/customer";

function toQuery(params: ListCustomersParams) {
  const search = new URLSearchParams();

  if (params.accountType) search.set("accountType", params.accountType);
  if (params.archived) search.set("archived", "true");
  if (params.search) search.set("search", params.search);
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("perPage", String(params.perPage));
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.sortDir) search.set("sortDir", params.sortDir);

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function getCustomerStats() {
  return apiFetch<CustomerStats>("/api/v1/customers/stats");
}

export function listCustomers(params: ListCustomersParams = {}) {
  return apiFetch<PaginatedCustomers>(
    `/api/v1/customers${toQuery(params)}`,
  );
}

export function getCustomer(id: string) {
  return apiFetch<Customer>(`/api/v1/customers/${id}`);
}

export interface CustomerActivity {
  quotations: Array<{
    id: string;
    number: string;
    state: string;
    date: string;
    amount: number;
    currencyCode: string;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    state: string;
    paymentState: string;
    date: string;
    amount: number;
    currencyCode: string;
  }>;
  payments: Array<{
    id: string;
    invoiceId: string;
    invoiceNumber: string;
    date: string;
    amount: number;
    method: string | null;
    currencyCode: string;
  }>;
}

export function getCustomerActivity(id: string) {
  return apiFetch<CustomerActivity>(`/api/v1/customers/${id}/activity`);
}

export function createCustomer(input: CreateCustomerInput) {
  return apiFetch<Customer>("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCustomer(id: string, input: UpdateCustomerInput) {
  return apiFetch<Customer>(`/api/v1/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveCustomer(id: string) {
  return apiFetch<Customer>(`/api/v1/customers/${id}`, {
    method: "DELETE",
  });
}

export function restoreCustomer(id: string) {
  return apiFetch<Customer>(`/api/v1/customers/${id}/restore`, {
    method: "POST",
  });
}

export async function uploadCustomerAvatar(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/v1/customers/${id}/avatar`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body?.message === "string"
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(", ")
          : response.statusText;

    throw new Error(message || "Failed to upload avatar");
  }

  return response.json() as Promise<Customer>;
}
