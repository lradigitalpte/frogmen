import { apiFetch } from "./api";

export interface ExchangeRateRow {
  id: string;
  fromCurrencyId: string;
  toCurrencyId: string;
  fromCurrencyCode: string | null;
  toCurrencyCode: string | null;
  rate: number;
  effectiveDate: string;
  source: string;
}

export function listExchangeRates() {
  return apiFetch<ExchangeRateRow[]>("/api/v1/currencies/exchange-rates");
}

export function getLatestExchangeRate(fromCurrencyId: string, toCurrencyId: string) {
  const params = new URLSearchParams({
    fromCurrencyId,
    toCurrencyId,
  });

  return apiFetch<{ rate: number; configured: boolean }>(
    `/api/v1/currencies/exchange-rates/latest?${params.toString()}`,
  );
}

export function upsertExchangeRate(input: {
  fromCurrencyId: string;
  toCurrencyId: string;
  rate: number;
  effectiveDate?: string;
}) {
  return apiFetch<{ rate: number }>("/api/v1/currencies/exchange-rates", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function findLatestRateForPair(
  rates: ExchangeRateRow[],
  fromCurrencyId: string,
  toCurrencyId: string,
) {
  let latest: ExchangeRateRow | undefined;

  for (const rate of rates) {
    if (
      rate.fromCurrencyId !== fromCurrencyId ||
      rate.toCurrencyId !== toCurrencyId
    ) {
      continue;
    }

    if (!latest || rate.effectiveDate > latest.effectiveDate) {
      latest = rate;
    }
  }

  return latest;
}
