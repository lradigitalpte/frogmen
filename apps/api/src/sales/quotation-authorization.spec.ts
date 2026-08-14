import { describe, expect, it } from "vitest";
import { hasCustomerAuthorization } from "./quotation-authorization";

describe("hasCustomerAuthorization", () => {
  it("accepts a sent quotation with a customer PO reference", () => {
    expect(
      hasCustomerAuthorization({
        state: "sent",
        customerReference: "PO-1234",
      }),
    ).toBe(true);
  });

  it("accepts a digitally signed quotation without a PO", () => {
    expect(
      hasCustomerAuthorization({
        state: "signed",
        customerReference: null,
        signedOn: new Date(),
      }),
    ).toBe(true);
  });

  it("accepts an uploaded customer PO document without a typed reference", () => {
    expect(
      hasCustomerAuthorization({
        state: "sent",
        customerReference: null,
        customerPoDocumentUrl: "/uploads/customer-po.pdf",
      }),
    ).toBe(true);
  });

  it("rejects a sent quotation without a PO or signature", () => {
    expect(
      hasCustomerAuthorization({
        state: "sent",
        customerReference: null,
        signedOn: null,
      }),
    ).toBe(false);
  });
});
