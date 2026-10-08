import { describe, expect, it } from "vitest";
import { formatAppDate, formatAppDateTime } from "./format-date";

describe("formatAppDate", () => {
  it("formats ISO dates as DD/MM/YYYY", () => {
    expect(formatAppDate("2026-08-17")).toBe("17/08/2026");
    expect(formatAppDate("2026-08-17T09:30:00.000Z")).toBe("17/08/2026");
  });

  it("handles empty values", () => {
    expect(formatAppDate(null)).toBe("");
    expect(formatAppDate(undefined)).toBe("");
    expect(formatAppDate("")).toBe("");
  });
});

describe("formatAppDateTime", () => {
  it("includes a slash date and time", () => {
    const formatted = formatAppDateTime("2026-08-17T14:30:00.000Z");
    expect(formatted).toContain("17/08/2026");
    expect(formatted).toMatch(/,/);
  });
});
