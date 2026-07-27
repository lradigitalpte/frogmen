import { apiFetch } from "./api";
import type {
  CreateWarehouseInput,
  ListWarehousesParams,
  PaginatedWarehouses,
  UpdateWarehouseInput,
  Warehouse,
} from "@/types/warehouse";

function toQuery(params: ListWarehousesParams) {
  const search = new URLSearchParams();

  if (params.archived) search.set("archived", "true");
  if (params.search) search.set("search", params.search);
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("perPage", String(params.perPage));
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.sortDir) search.set("sortDir", params.sortDir);

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listWarehouses(params: ListWarehousesParams = {}) {
  return apiFetch<PaginatedWarehouses>(
    `/api/v1/warehouses${toQuery(params)}`,
  );
}

export function getWarehouse(id: string) {
  return apiFetch<Warehouse>(`/api/v1/warehouses/${id}`);
}

export function createWarehouse(input: CreateWarehouseInput) {
  return apiFetch<Warehouse>("/api/v1/warehouses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWarehouse(id: string, input: UpdateWarehouseInput) {
  return apiFetch<Warehouse>(`/api/v1/warehouses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveWarehouse(id: string) {
  return apiFetch<Warehouse>(`/api/v1/warehouses/${id}`, {
    method: "DELETE",
  });
}

export function restoreWarehouse(id: string) {
  return apiFetch<Warehouse>(`/api/v1/warehouses/${id}/restore`, {
    method: "POST",
  });
}
