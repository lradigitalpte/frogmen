import { describe, expect, it } from "vitest";
import { convertPaymentToInvoiceAmount } from "@frog1/shared";

describe("registerPayment conversion", () => {
  it("converts USD payment to AED invoice credit", () => {
    expect(convertPaymentToInvoiceAmount(100, 3.67)).toBe(367);
  });

  it("keeps same amount when rate is 1", () => {
    expect(convertPaymentToInvoiceAmount(250, 1)).toBe(250);
  });
});
