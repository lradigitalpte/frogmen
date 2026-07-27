import { apiFetch } from "./api";

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

export async function listCurrencies() {
  const endpoints = [
    "/api/v1/quotations/options/currencies",
    "/api/v1/currencies",
    "/api/health/currencies",
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      return await apiFetch<Currency[]>(endpoint);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Request failed");
    }
  }

  throw lastError ?? new Error("Could not load currencies");
}

export function getExchangeRate(
  fromCurrencyId: string,
  toCurrencyId: string,
  asOfDate?: string,
) {
  const query = new URLSearchParams({ fromCurrencyId, toCurrencyId });
  if (asOfDate) query.set("asOfDate", asOfDate);

  return apiFetch<{ rate: number; configured: boolean }>(
    `/api/v1/currencies/exchange-rates/latest?${query.toString()}`,
  );
}
