import { apiFetch } from "./api";
import type {
  CreateProductInput,
  ListProductsParams,
  PaginatedProductUnits,
  PaginatedProducts,
  PaginatedStock,
  Product,
  ProductDetail,
  ProductStock,
  ProductUnit,
  ProductUnitDetail,
  ProductUnitStatus,
  PaginatedLinkableUnits,
  UpdateProductInput,
} from "@/types/product";

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

export function listProducts(params: ListProductsParams = {}) {
  return apiFetch<PaginatedProducts>(
    `/api/v1/products${toQuery({
      ...params,
      archived: params.archived ? "true" : undefined,
      rootOnly: params.rootOnly ? "true" : undefined,
      forSaleOnly: params.forSaleOnly ? "true" : undefined,
      isRovEquipment: params.isRovEquipment ? "true" : undefined,
    })}`,
  );
}

export function getProduct(id: string) {
  return apiFetch<ProductDetail>(`/api/v1/products/${id}`);
}

export function suggestProductReference(name: string) {
  return apiFetch<{ reference: string }>(
    `/api/v1/products/suggest-reference${toQuery({ name })}`,
  );
}

export function createProduct(input: CreateProductInput) {
  return apiFetch<Product>("/api/v1/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProduct(id: string, input: UpdateProductInput) {
  return apiFetch<Product>(`/api/v1/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveProduct(id: string) {
  return apiFetch<Product>(`/api/v1/products/${id}`, {
    method: "DELETE",
  });
}

export function restoreProduct(id: string) {
  return apiFetch<Product>(`/api/v1/products/${id}/restore`, {
    method: "POST",
  });
}

export async function uploadProductImage(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/v1/products/${id}/images`, {
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

    throw new Error(message || "Failed to upload image");
  }

  return response.json() as Promise<Product>;
}

export function removeProductImage(id: string, imagePath: string) {
  return apiFetch<Product>(`/api/v1/products/${id}/images`, {
    method: "DELETE",
    body: JSON.stringify({ imagePath }),
  });
}

export function getProductStock(productId: string) {
  return apiFetch<ProductStock>(`/api/v1/products/${productId}/stock`);
}

export function listProductUnits(
  productId: string,
  params: {
    warehouseId?: string;
    status?: ProductUnitStatus;
    search?: string;
    page?: number;
    perPage?: number;
  } = {},
) {
  return apiFetch<PaginatedProductUnits>(
    `/api/v1/products/${productId}/units${toQuery(params)}`,
  );
}

export function createProductUnit(
  productId: string,
  input: {
    serialNumber: string;
    warehouseId: string;
    notes?: string;
    parentUnitId?: string;
  },
) {
  return apiFetch<ProductUnit>(`/api/v1/products/${productId}/units`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getProductUnit(id: string) {
  return apiFetch<ProductUnitDetail>(`/api/v1/units/${id}`);
}

export function listLinkableUnits(
  parentProductId: string,
  params: {
    search?: string;
    page?: number;
    perPage?: number;
  } = {},
) {
  return apiFetch<PaginatedLinkableUnits>(
    `/api/v1/units/linkable${toQuery({
      parentProductId,
      ...params,
    })}`,
  );
}

export function updateProductUnit(
  id: string,
  input: {
    warehouseId?: string;
    status?: ProductUnitStatus;
    notes?: string;
  },
) {
  return apiFetch<ProductUnit>(`/api/v1/units/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function linkProductUnit(id: string, parentUnitId: string) {
  return apiFetch<ProductUnit>(`/api/v1/units/${id}/link`, {
    method: "POST",
    body: JSON.stringify({ parentUnitId }),
  });
}

export function unlinkProductUnit(id: string) {
  return apiFetch<ProductUnit>(`/api/v1/units/${id}/link`, {
    method: "DELETE",
  });
}

export function removeProductUnit(
  id: string,
  reason: "scrapped" | "sold" = "scrapped",
) {
  return apiFetch<ProductUnit>(`/api/v1/units/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function listStock(
  params: {
    productId?: string;
    warehouseId?: string;
    search?: string;
    page?: number;
    perPage?: number;
  } = {},
) {
  return apiFetch<PaginatedStock>(`/api/v1/stock${toQuery(params)}`);
}

export function adjustStock(input: {
  productId: string;
  warehouseId: string;
  quantity?: string;
  adjustment?: string;
}) {
  return apiFetch(`/api/v1/stock`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
