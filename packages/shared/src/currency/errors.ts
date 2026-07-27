export class CurrencyConversionError extends Error {
  constructor(
    message = "No exchange rate is configured for this currency pair.",
  ) {
    super(message);
    this.name = "CurrencyConversionError";
  }
}
