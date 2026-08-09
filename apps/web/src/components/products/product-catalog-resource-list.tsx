"use client";

import { ResourceList } from "@shopify/polaris";
import type { ReactElement } from "react";
import type { Product } from "@/types/product";

interface ProductCatalogResourceListProps {
  products: Product[];
  renderItem: (product: Product) => ReactElement;
}

export function ProductCatalogResourceList({
  products,
  renderItem,
}: ProductCatalogResourceListProps) {
  const items = products.filter((product) => Boolean(product.id));

  return (
    <ResourceList
      items={items}
      resourceName={{ singular: "product", plural: "products" }}
      resolveItemId={(product) => product.id}
      renderItem={(product) => renderItem(product)}
    />
  );
}
