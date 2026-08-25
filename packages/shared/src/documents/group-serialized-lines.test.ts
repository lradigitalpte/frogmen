import { describe, expect, it } from "vitest";
import { groupSerializedLines } from "./group-serialized-lines";

describe("groupSerializedLines", () => {
  it("groups matching serialized units and preserves their totals", () => {
    const grouped = groupSerializedLines([
      {
        productId: "product-1",
        description: "ROV",
        serialNumber: "SN-1",
        quantity: "1",
        unitPrice: "1000",
        discountPercent: "0",
        discountAmount: "100",
        taxRatePercent: "5",
        priceSubtotal: "900",
      },
      {
        productId: "product-1",
        description: "ROV",
        serialNumber: "SN-2",
        quantity: "1",
        unitPrice: "1000",
        discountPercent: "0",
        discountAmount: "100",
        taxRatePercent: "5",
        priceSubtotal: "900",
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      quantity: "2",
      discountAmount: "200",
      priceSubtotal: "1800",
      serialNumbers: ["SN-1", "SN-2"],
    });
    expect(grouped[0].sourceLines).toHaveLength(2);
  });

  it("does not group non-serialized or differently priced lines", () => {
    const base = {
      productId: "product-1",
      description: "ROV",
      quantity: "1",
      discountPercent: "0",
      taxRatePercent: "0",
      priceSubtotal: "1000",
    };
    const grouped = groupSerializedLines([
      { ...base, serialNumber: "SN-1", unitPrice: "1000" },
      { ...base, serialNumber: "SN-2", unitPrice: "1200" },
      { ...base, serialNumber: null, unitPrice: "1000" },
    ]);

    expect(grouped).toHaveLength(3);
  });
});
