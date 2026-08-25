import { describe, expect, it } from "vitest";
import { calculateLineAmounts } from "./sales-calculations";

describe("calculateLineAmounts", () => {
  it("computes subtotal, tax, and total without discount", () => {
    expect(
      calculateLineAmounts({
        quantity: 2,
        unitPrice: 100,
        discountPercent: 0,
        taxRatePercent: 5,
      }),
    ).toEqual({
      priceSubtotal: 200,
      priceTax: 10,
      priceTotal: 210,
    });
  });

  it("applies percent discount before tax", () => {
    expect(
      calculateLineAmounts({
        quantity: 1,
        unitPrice: 200,
        discountPercent: 10,
        taxRatePercent: 5,
      }),
    ).toEqual({
      priceSubtotal: 180,
      priceTax: 9,
      priceTotal: 189,
    });
  });

  it("applies fixed discount amount before tax", () => {
    expect(
      calculateLineAmounts({
        quantity: 2,
        unitPrice: 100,
        discountAmount: 25,
        discountPercent: 0,
        taxRatePercent: 5,
      }),
    ).toEqual({
      priceSubtotal: 175,
      priceTax: 8.75,
      priceTotal: 183.75,
    });
  });

  it("prefers fixed discount amount over percent when both are set", () => {
    expect(
      calculateLineAmounts({
        quantity: 1,
        unitPrice: 200,
        discountAmount: 20,
        discountPercent: 50,
        taxRatePercent: 0,
      }),
    ).toEqual({
      priceSubtotal: 180,
      priceTax: 0,
      priceTotal: 180,
    });
  });

  it("caps fixed discount at line gross", () => {
    expect(
      calculateLineAmounts({
        quantity: 1,
        unitPrice: 50,
        discountAmount: 100,
        taxRatePercent: 0,
      }),
    ).toEqual({
      priceSubtotal: 0,
      priceTax: 0,
      priceTotal: 0,
    });
  });

  it("rounds money to two decimal places", () => {
    expect(
      calculateLineAmounts({
        quantity: 3,
        unitPrice: 33.33,
        discountPercent: 0,
        taxRatePercent: 10,
      }),
    ).toEqual({
      priceSubtotal: 99.99,
      priceTax: 10,
      priceTotal: 109.99,
    });
  });
});
