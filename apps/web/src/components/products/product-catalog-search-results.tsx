"use client";

import type { ReactNode } from "react";

interface ProductCatalogSearchResultsProps {
  children: ReactNode;
}

export function ProductCatalogSearchResults({
  children,
}: ProductCatalogSearchResultsProps) {
  return <div className="product-catalog-search-results">{children}</div>;
}
