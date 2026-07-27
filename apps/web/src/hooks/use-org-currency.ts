"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  currencyById,
  formatCurrencyAmount,
  type CurrencyLike,
} from "@/lib/currency-utils";
import { listCurrencies, type Currency } from "@/lib/currencies-api";
import { listExchangeRates } from "@/lib/exchange-rates-api";
import { getCompanySettings } from "@/lib/settings-api";

export function useOrgCurrency() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [baseCurrencyId, setBaseCurrencyId] = useState<string | null>(null);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState("USD");
  const [catalogCurrencyId, setCatalogCurrencyId] = useState<string | null>(null);
  const [defaultPricingCurrencyId, setDefaultPricingCurrencyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [company, currencyRows, exchangeRates] = await Promise.all([
        getCompanySettings(),
        listCurrencies(),
        listExchangeRates().catch(() => []),
      ]);

      const normalizedCurrencies = currencyRows.map((currency) => ({
        ...currency,
        code: currency.code.trim(),
      }));

      setCurrencies(normalizedCurrencies);
      const resolvedBaseCurrencyId = company.baseCurrencyId;
      const resolvedBaseCurrencyCode = company.baseCurrencyCode?.trim() ?? null;
      setBaseCurrencyId(resolvedBaseCurrencyId);
      setBaseCurrencyCode(resolvedBaseCurrencyCode ?? "USD");

      const resolvedCatalogCurrencyId =
        company.catalogCurrencyId ?? company.baseCurrencyId;
      setCatalogCurrencyId(resolvedCatalogCurrencyId);

      // Prefer explicit catalog/pricing currency from org settings. Only infer from
      // exchange rates when catalogCurrencyId is not stored in metadata (legacy orgs
      // that priced in USD because a "1 USD = X base" rate was configured).
      const ratesIntoBase = exchangeRates.filter((rate) => {
        if (rate.toCurrencyId === resolvedBaseCurrencyId) {
          return true;
        }

        if (
          resolvedBaseCurrencyCode &&
          rate.toCurrencyCode?.trim() === resolvedBaseCurrencyCode
        ) {
          return true;
        }

        return false;
      });

      const usdCurrencyId =
        normalizedCurrencies.find((currency) => currency.code === "USD")?.id ??
        null;
      const usdRate = ratesIntoBase.find(
        (rate) => rate.fromCurrencyCode?.trim() === "USD",
      );
      const inferredFromExchangeRates =
        usdRate?.fromCurrencyId ??
        ratesIntoBase[0]?.fromCurrencyId ??
        usdCurrencyId;

      setDefaultPricingCurrencyId(
        company.catalogCurrencyId ??
          inferredFromExchangeRates ??
          resolvedCatalogCurrencyId,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load currency settings");
      setCurrencies([]);
      setBaseCurrencyId(null);
      setBaseCurrencyCode("USD");
      setCatalogCurrencyId(null);
      setDefaultPricingCurrencyId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onSettingsUpdated = () => {
      void reload();
    };

    window.addEventListener("frog1:currency-settings-updated", onSettingsUpdated);
    return () => {
      window.removeEventListener(
        "frog1:currency-settings-updated",
        onSettingsUpdated,
      );
    };
  }, [reload]);

  const baseCurrency = useMemo(
    () => currencyById(currencies, baseCurrencyId),
    [currencies, baseCurrencyId],
  );

  const catalogCurrency = useMemo(
    () => currencyById(currencies, catalogCurrencyId) ?? baseCurrency,
    [currencies, catalogCurrencyId, baseCurrency],
  );

  const defaultPricingCurrency = useMemo(
    () =>
      currencyById(currencies, defaultPricingCurrencyId) ?? catalogCurrency ?? baseCurrency,
    [baseCurrency, catalogCurrency, currencies, defaultPricingCurrencyId],
  );

  const formatOrgMoney = useCallback(
    (amount: string | number, currency?: CurrencyLike | null) =>
      formatCurrencyAmount(amount, currency ?? baseCurrency),
    [baseCurrency],
  );

  /** KPIs and dashboards only   amount must already be in base currency. */
  const formatBaseMoney = useCallback(
    (amount: string | number) =>
      formatCurrencyAmount(
        amount,
        baseCurrency ?? {
          code: baseCurrencyCode,
          decimalPlaces: 2,
          symbol: baseCurrencyCode,
        },
        baseCurrencyCode,
      ),
    [baseCurrency, baseCurrencyCode],
  );

  const formatCatalogMoney = useCallback(
    (amount: string | number) => formatCurrencyAmount(amount, catalogCurrency),
    [catalogCurrency],
  );

  const resolveCurrency = useCallback(
    (currencyId?: string | null) =>
      currencyById(currencies, currencyId) ?? baseCurrency,
    [currencies, baseCurrency],
  );

  return {
    currencies,
    baseCurrencyId,
    baseCurrency,
    baseCurrencyCode: baseCurrency?.code ?? baseCurrencyCode,
    catalogCurrencyId,
    catalogCurrency,
    catalogCurrencyCode: catalogCurrency?.code ?? baseCurrency?.code ?? "USD",
    defaultPricingCurrencyId,
    defaultPricingCurrency,
    defaultPricingCurrencyCode:
      defaultPricingCurrency?.code ?? catalogCurrency?.code ?? baseCurrency?.code ?? "USD",
    currencyPrefix: baseCurrency?.symbol ?? "$",
    catalogCurrencyPrefix: catalogCurrency?.symbol ?? baseCurrency?.symbol ?? "$",
    loading,
    error,
    reload,
    formatOrgMoney,
    formatBaseMoney,
    formatCatalogMoney,
    resolveCurrency,
  };
}
