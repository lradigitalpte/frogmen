import { apiFetch } from "./api";
import type {
  ListProductCategoriesParams,
  PaginatedProductCategories,
  ProductCategory,
} from "@/types/product-category";

function toQuery<T extends object>(params: T) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listProductCategories(params: ListProductCategoriesParams = {}) {
  return apiFetch<PaginatedProductCategories>(
    `/api/v1/product-categories${toQuery(params)}`,
  );
}

export function createProductCategory(name: string) {
  return apiFetch<ProductCategory>("/api/v1/product-categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function archiveProductCategory(id: string) {
  return apiFetch<ProductCategory>(`/api/v1/product-categories/${id}`, {
    method: "DELETE",
  });
}
