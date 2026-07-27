import { CurrencyConversionError } from "./errors";

export function requireRate(hasRate: boolean, message?: string): void {
  if (!hasRate) {
    throw new CurrencyConversionError(message);
  }
}
