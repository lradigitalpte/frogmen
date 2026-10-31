import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  anniversariesInRange,
  daysBetween,
  ordinal,
} from "./calendar-dates";
import { HolidaysService } from "./holidays.service";

describe("calendar dates", () => {
  it("lists anniversaries from the first full year", () => {
    expect(anniversariesInRange("2024-11-05", "2024-11-01", "2024-11-30")).toEqual([]);
    expect(anniversariesInRange("2024-11-05", "2026-11-01", "2026-11-30")).toEqual([
      { date: "2026-11-05", years: 2 },
    ]);
  });

  it("handles ranges spanning a new year", () => {
    expect(anniversariesInRange("2020-01-02", "2025-12-29", "2026-01-04")).toEqual([
      { date: "2026-01-02", years: 6 },
    ]);
  });

  it("moves Feb 29 anniversaries to Feb 28 in non-leap years", () => {
    expect(anniversariesInRange("2024-02-29", "2025-02-01", "2025-03-01")).toEqual([
      { date: "2025-02-28", years: 1 },
    ]);
    expect(anniversariesInRange("2024-02-29", "2028-02-01", "2028-03-01")).toEqual([
      { date: "2028-02-29", years: 4 },
    ]);
  });

  it("does day arithmetic on ISO dates", () => {
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysBetween("2026-10-31", "2026-11-03")).toBe(3);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("formats ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st",
    ]);
  });
});

describe("HolidaysService", () => {
  const service = new HolidaysService();

  it("lists supported countries by name", () => {
    const countries = service.listCountries();
    expect(countries.length).toBeGreaterThan(100);
    expect(countries.find((country) => country.code === "CN")?.name).toBe("China");
  });

  it("returns English public holidays within the range", () => {
    const holidays = service.getHolidays(["GH", "CN"], "2026-03-01", "2026-03-31");
    expect(holidays.every((holiday) => holiday.date >= "2026-03-01" && holiday.date <= "2026-03-31")).toBe(true);
    expect(holidays.some((holiday) => holiday.countryCode === "GH" && holiday.name === "Independence Day")).toBe(true);
  });

  it("ignores unsupported country codes", () => {
    expect(service.getHolidays(["ZZ"], "2026-01-01", "2026-12-31")).toEqual([]);
  });
});
