import type { Product } from "@/types/product";
import { convertAmount } from "@/lib/currency-utils";
import { getLatestExchangeRate } from "@/lib/exchange-rates-api";

export function resolveProductCurrencyId(
  product: Pick<Product, "priceCurrencyId">,
  defaultPricingCurrencyId: string | null,
) {
  return product.priceCurrencyId ?? defaultPricingCurrencyId;
}

export function needsCurrencyConversion(
  fromCurrencyId: string | null | undefined,
  toCurrencyId: string | null | undefined,
) {
  return Boolean(
    fromCurrencyId && toCurrencyId && fromCurrencyId !== toCurrencyId,
  );
}

export async function fetchConversionRate(
  fromCurrencyId: string,
  toCurrencyId: string,
  cachedRates: Record<string, number> = {},
) {
  if (fromCurrencyId === toCurrencyId) {
    return { rate: 1, configured: true };
  }

  const cachedRate = cachedRates[fromCurrencyId];
  if (cachedRate) {
    return { rate: cachedRate, configured: true };
  }

  const result = await getLatestExchangeRate(fromCurrencyId, toCurrencyId);
  if (!result.configured) {
    return result;
  }

  return result;
}

export function convertProductAmount(amount: number, rate: number) {
  return convertAmount(amount, rate);
}
