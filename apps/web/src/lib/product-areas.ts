import type { ProductUsageType } from "@/types/product";

/** Products for sale and operational products each have their own pages. */
export const PRODUCT_AREAS: Record<ProductUsageType, { url: string; label: string; addLabel: string }> = {
  for_sale: {
    url: "/dashboard/inventory/products",
    label: "Products for sale",
    addLabel: "Add product for sale",
  },
  operations: {
    url: "/dashboard/inventory/operations",
    label: "Operational products",
    addLabel: "Add operational product",
  },
};

export function productArea(usageType?: ProductUsageType) {
  return PRODUCT_AREAS[usageType ?? "for_sale"];
}

export function productUrl(product: { id: string; usageType?: ProductUsageType }) {
  return `${productArea(product.usageType).url}/${product.id}`;
}
