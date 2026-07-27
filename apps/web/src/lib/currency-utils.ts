import { formatMoney } from "@/components/sales/format-money";
import type { Currency } from "@/lib/currencies-api";
import { convertAmount, roundMoney } from "@frog1/shared";

export { convertAmount, roundMoney };
export type CurrencyLike = Pick<Currency, "code" | "decimalPlaces" | "symbol">;

export function trimCurrencyCode(code: string | null | undefined) {
  return code?.trim() || null;
}

export function formatCurrencyAmount(
  amount: string | number,
  currency?: CurrencyLike | null,
  fallbackCode = "USD",
) {
  const code = trimCurrencyCode(currency?.code) ?? fallbackCode;

  return formatMoney(amount, code, currency?.decimalPlaces ?? 2);
}

export function currencyInputPrefix(currency?: CurrencyLike | null) {
  return currency?.symbol ?? "$";
}

export function currencyById(
  currencies: Currency[],
  currencyId?: string | null,
) {
  if (!currencyId) {
    return null;
  }

  return currencies.find((currency) => currency.id === currencyId) ?? null;
}

