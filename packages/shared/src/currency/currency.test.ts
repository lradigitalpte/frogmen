import { describe, expect, it } from "vitest";
import { CurrencyConversionError } from "./errors";
import { requireRate } from "./require-rate";
import { convertAmount, roundMoney, sumDocumentAmounts } from "./money";
import { computeOutstandingInBase } from "./outstanding";
import { convertPaymentToInvoiceAmount } from "./payments";

describe("roundMoney", () => {
  it("rounds to two decimal places", () => {
    expect(roundMoney(1.006)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1);
    expect(roundMoney(10.999)).toBe(11);
  });
});

describe("convertAmount", () => {
  it("multiplies amount by rate and rounds", () => {
    expect(convertAmount(200, 3.17)).toBe(634);
    expect(convertAmount(100, 0.333333)).toBe(33.33);
  });
});

describe("sumDocumentAmounts", () => {
  it("sums line amounts in document currency", () => {
    const totals = sumDocumentAmounts([
      { priceSubtotal: 100, priceTax: 5, priceTotal: 105 },
      { priceSubtotal: 50, priceTax: 2.5, priceTotal: 52.5 },
    ]);

    expect(totals).toEqual({
      amountUntaxed: 150,
      amountTax: 7.5,
      amountTotal: 157.5,
      amountUntaxedBase: 150,
      amountTaxBase: 7.5,
      amountTotalBase: 157.5,
    });
  });

  it("computes base amounts using exchange rate", () => {
    const totals = sumDocumentAmounts(
      [{ priceSubtotal: 100, priceTax: 0, priceTotal: 100 }],
      3.67,
    );

    expect(totals.amountTotal).toBe(100);
    expect(totals.amountTotalBase).toBe(367);
  });
});

describe("requireRate", () => {
  it("does not throw when rate exists", () => {
    expect(() => requireRate(true)).not.toThrow();
  });

  it("throws CurrencyConversionError when rate is missing", () => {
    expect(() => requireRate(false)).toThrow(CurrencyConversionError);
    expect(() => requireRate(false, "Custom message")).toThrow("Custom message");
  });
});

describe("convertPaymentToInvoiceAmount", () => {
  it("converts payment amount to invoice currency", () => {
    expect(convertPaymentToInvoiceAmount(100, 3.67)).toBe(367);
  });
});

describe("computeOutstandingInBase", () => {
  it("returns zero when fully paid", () => {
    expect(
      computeOutstandingInBase({
        amountTotal: 1000,
        amountPaid: 1000,
        amountTotalBase: 3670,
      }),
    ).toBe(0);
  });

  it("uses proportional base when amountTotalBase is set", () => {
    expect(
      computeOutstandingInBase({
        amountTotal: 1000,
        amountPaid: 250,
        amountTotalBase: 3670,
      }),
    ).toBe(2752.5);
  });

  it("falls back to exchange rate when base column missing", () => {
    expect(
      computeOutstandingInBase({
        amountTotal: 100,
        amountPaid: 0,
        exchangeRate: 3.67,
      }),
    ).toBe(367);
  });

  it("falls back to document outstanding when no base data", () => {
    expect(
      computeOutstandingInBase({
        amountTotal: 500,
        amountPaid: 100,
      }),
    ).toBe(400);
  });
});
