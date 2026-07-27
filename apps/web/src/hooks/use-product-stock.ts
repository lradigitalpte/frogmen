"use client";

import { useCallback, useEffect, useState } from "react";
import { getProductStock } from "@/lib/products-api";
import { sumStockQuantity } from "@/lib/line-item-utils";
import type { ProductStock } from "@/types/product";

export function useProductStock(productId: string | null) {
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!productId) {
      setStock(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getProductStock(productId);
      setStock(result);
    } catch (err) {
      setStock(null);
      setError(
        err instanceof Error ? err.message : "Failed to load stock availability",
      );
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    stock,
    availableQuantity: sumStockQuantity(stock),
    loading,
    error,
    reload,
  };
}
