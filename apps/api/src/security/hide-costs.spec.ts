import { describe, expect, it } from "vitest";
import { hideCosts } from "./hide-costs";

describe("hideCosts", () => {
  it("hides costs at any depth and keeps everything else", () => {
    const createdAt = new Date();
    const input = {
      data: [{ id: "p1", costPrice: "50.00", sellingPrice: "90.00", createdAt }],
      cogsLines: [{ unitCost: "5", costAmount: "10", quantity: "2" }],
      child: { items: [{ currentCostPrice: "7" }] },
    };
    expect(hideCosts(input)).toEqual({
      data: [{ id: "p1", costPrice: null, sellingPrice: "90.00", createdAt }],
      cogsLines: [{ unitCost: null, costAmount: null, quantity: "2" }],
      child: { items: [{ currentCostPrice: null }] },
    });
    expect(input.data[0].costPrice).toBe("50.00");
  });

  it("passes non-JSON values through", () => {
    const buffer = Buffer.from("x");
    expect(hideCosts(buffer)).toBe(buffer);
    expect(hideCosts(undefined)).toBeUndefined();
    expect(hideCosts(null)).toBeNull();
  });
});
