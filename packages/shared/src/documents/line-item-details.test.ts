import { describe, expect, it } from "vitest";
import {
  formatProductDetailsInline,
  productDetailsLines,
  renderLineItemDescriptionHtml,
} from "./line-item-details";

describe("productDetailsLines", () => {
  it("splits kit contents into lines", () => {
    expect(
      productDetailsLines(
        "CHASING M2 PRO MAX Advanced Set",
        "1x Chasing M2 ROV\n1x Remote Controller\n\n1x Carrying Case",
      ),
    ).toEqual([
      "1x Chasing M2 ROV",
      "1x Remote Controller",
      "1x Carrying Case",
    ]);
  });

  it("skips details already stored on the line", () => {
    expect(
      productDetailsLines(
        "CHASING M2\n1x Chasing M2 ROV",
        "1x Chasing M2 ROV",
      ),
    ).toEqual([]);
  });
});

describe("formatProductDetailsInline", () => {
  it("joins kit contents with commas", () => {
    expect(
      formatProductDetailsInline(
        "CHASING M2 PRO MAX Advanced Set",
        "1x Chasing M2 ROV\n1x Remote Controller\n1x Carrying Case",
      ),
    ).toBe("1x Chasing M2 ROV, 1x Remote Controller, 1x Carrying Case");
  });
});

describe("renderLineItemDescriptionHtml", () => {
  it("renders a bullet list by default", () => {
    const html = renderLineItemDescriptionHtml("CHASING M2", "1x ROV\n1x Case");
    expect(html).toContain('<ul class="line-details">');
    expect(html).toContain("<li>1x ROV</li>");
  });

  it("renders comma-separated details when selected", () => {
    const html = renderLineItemDescriptionHtml(
      "CHASING M2",
      "1x ROV\n1x Case",
      "comma",
    );
    expect(html).toContain("1x ROV, 1x Case");
    expect(html).not.toContain("<ul");
  });
});
