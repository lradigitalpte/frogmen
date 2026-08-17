import { describe, expect, it } from "vitest";
import {
  formatDocumentDate,
  formatTrnLabel,
  formatVatLabel,
} from "./quotation-document";

describe("formatDocumentDate", () => {
  it("converts ISO dates to DD-MM-YYYY", () => {
    expect(formatDocumentDate("2026-08-17")).toBe("17-08-2026");
    expect(formatDocumentDate("2026-08-17T09:30:00.000Z")).toBe("17-08-2026");
  });

  it("returns empty for missing values", () => {
    expect(formatDocumentDate(null)).toBe("");
    expect(formatDocumentDate(undefined)).toBe("");
  });
});

describe("formatTrnLabel", () => {
  it("prints TRN once when the stored value already includes the prefix", () => {
    expect(formatTrnLabel("TRN :104740930300003")).toBe("TRN: 104740930300003");
    expect(formatTrnLabel("TRN: TRN :104740930300003")).toBe(
      "TRN: 104740930300003",
    );
  });

  it("adds the TRN prefix when the stored value is only the number", () => {
    expect(formatTrnLabel("104740930300003")).toBe("TRN: 104740930300003");
  });
});

describe("formatVatLabel", () => {
  it("includes the rate when every line uses the same VAT", () => {
    expect(
      formatVatLabel([{ taxRatePercent: "5" }, { taxRatePercent: "5.00" }]),
    ).toBe("VAT (5%)");
  });

  it("uses the charged VAT rate when some lines are zero-rated", () => {
    expect(
      formatVatLabel([{ taxRatePercent: "5" }, { taxRatePercent: "0" }]),
    ).toBe("VAT (5%)");
  });

  it("falls back to VAT when more than one non-zero rate is charged", () => {
    expect(
      formatVatLabel([{ taxRatePercent: "5" }, { taxRatePercent: "10" }]),
    ).toBe("VAT");
  });
});
