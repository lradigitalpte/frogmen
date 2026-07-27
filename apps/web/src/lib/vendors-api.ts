import { apiFetch } from "./api";
import type {
  CreateVendorInput,
  ListVendorsParams,
  PaginatedVendors,
  UpdateVendorInput,
  Vendor,
} from "@/types/vendor";

function toQuery(params: ListVendorsParams) {
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

export function listVendors(params: ListVendorsParams = {}) {
  return apiFetch<PaginatedVendors>(`/api/v1/vendors${toQuery(params)}`);
}

export function getVendor(id: string) {
  return apiFetch<Vendor>(`/api/v1/vendors/${id}`);
}

export function createVendor(input: CreateVendorInput) {
  return apiFetch<Vendor>("/api/v1/vendors", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateVendor(id: string, input: UpdateVendorInput) {
  return apiFetch<Vendor>(`/api/v1/vendors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveVendor(id: string) {
  return apiFetch<Vendor>(`/api/v1/vendors/${id}`, {
    method: "DELETE",
  });
}

export function restoreVendor(id: string) {
  return apiFetch<Vendor>(`/api/v1/vendors/${id}/restore`, {
    method: "POST",
  });
}
