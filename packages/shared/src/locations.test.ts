import { describe, expect, it } from "vitest";
import {
  formatCountryLabel,
  formatPostalAddressLines,
  formatStateLabel,
} from "./locations";

describe("formatCountryLabel", () => {
  it("resolves ISO country codes to names", () => {
    expect(formatCountryLabel("AE")).toBe("United Arab Emirates");
  });

  it("falls back to the stored value when unknown", () => {
    expect(formatCountryLabel("United Arab Emirates")).toBe(
      "United Arab Emirates",
    );
  });
});

describe("formatStateLabel", () => {
  it("resolves UAE emirate codes to names", () => {
    expect(formatStateLabel("AE", "AZ")).toBe("Abu Dhabi");
  });
});

describe("formatPostalAddressLines", () => {
  it("prints names instead of ISO codes", () => {
    expect(
      formatPostalAddressLines({
        street1: "AM Tower (Nissan Tower), Najda Street,",
        city: "",
        stateCode: "AZ",
        zip: "",
        countryCode: "AE",
      }),
    ).toEqual([
      "AM Tower (Nissan Tower), Najda Street,",
      "Abu Dhabi",
      "United Arab Emirates",
    ]);
  });
});
