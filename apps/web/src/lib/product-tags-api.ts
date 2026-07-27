import { apiFetch } from "./api";
import type {
  ListProductTagsParams,
  PaginatedProductTags,
  ProductTag,
} from "@/types/product-tag";

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

export function listProductTags(params: ListProductTagsParams = {}) {
  return apiFetch<PaginatedProductTags>(
    `/api/v1/product-tags${toQuery(params)}`,
  );
}

export function createProductTag(name: string) {
  return apiFetch<ProductTag>("/api/v1/product-tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function archiveProductTag(id: string) {
  return apiFetch<ProductTag>(`/api/v1/product-tags/${id}`, {
    method: "DELETE",
  });
}
