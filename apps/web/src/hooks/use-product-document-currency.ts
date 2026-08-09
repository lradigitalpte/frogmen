"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  convertAmount,
  currencyById,
  currencyInputPrefix,
  formatCurrencyAmount,
} from "@/lib/currency-utils";
import { parseSellingPrice } from "@/lib/line-item-utils";
import {
  fetchConversionRate,
  resolveProductCurrencyId,
} from "@/lib/product-currency";
import type { Product } from "@/types/product";

export function useProductDocumentCurrency(
  documentCurrencyId: string | null | undefined,
  products: Product[],
  selectedProduct?: Product | null,
) {
  const {
    currencies,
    defaultPricingCurrencyId,
    loading: currencyLoading,
  } = useOrgCurrency();
  const [productQuoteRates, setProductQuoteRates] = useState<Record<string, number>>({});
  const productQuoteRatesRef = useRef(productQuoteRates);
  productQuoteRatesRef.current = productQuoteRates;
  const [exchangeRateLoading, setExchangeRateLoading] = useState(false);
  const [exchangeRateError, setExchangeRateError] = useState<string | null>(null);

  const documentCurrency = useMemo(
    () => currencyById(currencies, documentCurrencyId),
    [currencies, documentCurrencyId],
  );

  const fmt = useCallback(
    (amount: number | string) => formatCurrencyAmount(amount, documentCurrency),
    [documentCurrency],
  );

  const pricePrefix = currencyInputPrefix(documentCurrency);

  const sourceCurrencyKey = (() => {
    if (!documentCurrencyId || !defaultPricingCurrencyId) return "[]";

    const sourceCurrencyIds = new Set<string>();
    for (const product of products) {
      const sourceId = resolveProductCurrencyId(product, defaultPricingCurrencyId);
      if (sourceId && sourceId !== documentCurrencyId) {
        sourceCurrencyIds.add(sourceId);
      }
    }
    if (selectedProduct) {
      const sourceId = resolveProductCurrencyId(
        selectedProduct,
        defaultPricingCurrencyId,
      );
      if (sourceId && sourceId !== documentCurrencyId) {
        sourceCurrencyIds.add(sourceId);
      }
    }
    return JSON.stringify([...sourceCurrencyIds].sort());
  })();

  useEffect(() => {
    if (!documentCurrencyId || !defaultPricingCurrencyId) {
      return;
    }

    const sourceCurrencyIds = JSON.parse(sourceCurrencyKey) as string[];

    if (sourceCurrencyIds.length === 0) {
      setProductQuoteRates((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      setExchangeRateError((current) => (current === null ? current : null));
      setExchangeRateLoading((current) => (current ? false : current));
      return;
    }

    let cancelled = false;
    setExchangeRateLoading(true);

    void Promise.all(
      sourceCurrencyIds.map(async (fromId) => {
        const result = await fetchConversionRate(fromId, documentCurrencyId);
        return { fromId, ...result };
      }),
    )
      .then((results) => {
        if (cancelled) {
          return;
        }

        const nextRates: Record<string, number> = {};
        let missingRate = false;

        for (const result of results) {
          if (!result.configured) {
            missingRate = true;
            continue;
          }
          nextRates[result.fromId] = result.rate;
        }

        setProductQuoteRates(nextRates);
        setExchangeRateError(
          missingRate
            ? "Some products need an exchange rate before they can be quoted. Add rates under Settings → Currencies."
            : null,
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setExchangeRateError(
            err instanceof Error ? err.message : "Failed to load exchange rates",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setExchangeRateLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [defaultPricingCurrencyId, documentCurrencyId, sourceCurrencyKey]);

  const formatProductCatalogPrice = useCallback(
    (product: Product) => {
      const nativeAmount = parseSellingPrice(product.sellingPrice);
      const productCurrencyId = resolveProductCurrencyId(
        product,
        defaultPricingCurrencyId,
      );
      const nativeCurrency = currencyById(currencies, productCurrencyId);
      return formatCurrencyAmount(nativeAmount, nativeCurrency);
    },
    [currencies, defaultPricingCurrencyId],
  );

  const formatProductCatalogCost = useCallback(
    (product: Product) => {
      const nativeAmount = parseSellingPrice(product.costPrice);
      const productCurrencyId = resolveProductCurrencyId(
        product,
        defaultPricingCurrencyId,
      );
      const nativeCurrency = currencyById(currencies, productCurrencyId);
      return formatCurrencyAmount(nativeAmount, nativeCurrency);
    },
    [currencies, defaultPricingCurrencyId],
  );

  const convertProductForDocument = useCallback(
    async (product: Product) => {
      if (currencyLoading || !defaultPricingCurrencyId || !documentCurrencyId) {
        throw new Error("Currency settings are still loading.");
      }

      const productCurrencyId = resolveProductCurrencyId(
        product,
        defaultPricingCurrencyId,
      );
      const catalogUnitPrice = parseSellingPrice(product.sellingPrice);
      const catalogUnitCost = parseSellingPrice(product.costPrice);

      if (!productCurrencyId || productCurrencyId === documentCurrencyId) {
        return {
          unitPrice: catalogUnitPrice,
          unitCost: catalogUnitCost,
          rate: 1,
        };
      }

      if (exchangeRateLoading) {
        throw new Error("Exchange rate is still loading.");
      }

      const conversion = await fetchConversionRate(
        productCurrencyId,
        documentCurrencyId,
        productQuoteRatesRef.current,
      );

      if (!conversion.configured) {
        const fromCode =
          currencies.find((currency) => currency.id === productCurrencyId)?.code ??
          "product";
        const toCode = documentCurrency?.code ?? "document";
        throw new Error(
          `No exchange rate configured for ${fromCode} → ${toCode}. Add one under Settings → Currencies.`,
        );
      }

      if (productQuoteRatesRef.current[productCurrencyId] !== conversion.rate) {
        setProductQuoteRates((current) => ({
          ...current,
          [productCurrencyId]: conversion.rate,
        }));
      }

      return {
        unitPrice: convertAmount(catalogUnitPrice, conversion.rate),
        unitCost: convertAmount(catalogUnitCost, conversion.rate),
        rate: conversion.rate,
      };
    },
    [
      currencies,
      currencyLoading,
      defaultPricingCurrencyId,
      documentCurrency,
      documentCurrencyId,
      exchangeRateLoading,
    ],
  );

  return {
    currencyLoading,
    defaultPricingCurrencyId,
    documentCurrency,
    documentCurrencyCode: documentCurrency?.code ?? "USD",
    exchangeRateError,
    exchangeRateLoading,
    hasProductConversionRates: Object.keys(productQuoteRates).length > 0,
    fmt,
    formatProductCatalogPrice,
    formatProductCatalogCost,
    convertProductForDocument,
    pricePrefix,
  };
}
