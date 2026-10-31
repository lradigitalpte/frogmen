import { Injectable } from "@nestjs/common";
import Holidays from "date-holidays";

export interface HolidayCountry {
  code: string;
  name: string;
}

export interface PublicHoliday {
  countryCode: string;
  countryName: string;
  date: string;
  name: string;
  type: string;
}

// Only days people actually take off — skip observances, school and optional days.
const HOLIDAY_TYPES = ["public", "bank"] as const;

@Injectable()
export class HolidaysService {
  private countries: HolidayCountry[] | null = null;
  private readonly cache = new Map<string, PublicHoliday[]>();

  listCountries(): HolidayCountry[] {
    if (!this.countries) {
      const raw = new Holidays().getCountries("en") as Record<string, string>;
      this.countries = Object.entries(raw)
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return this.countries;
  }

  countryName(code: string) {
    return this.listCountries().find((country) => country.code === code)?.name ?? code;
  }

  isSupported(code: string) {
    return this.listCountries().some((country) => country.code === code);
  }

  /** Public holidays for the given countries that fall within [from, to] (inclusive). */
  getHolidays(countryCodes: string[], from: string, to: string): PublicHoliday[] {
    const startYear = Number(from.slice(0, 4));
    const endYear = Number(to.slice(0, 4));
    const result: PublicHoliday[] = [];

    for (const code of countryCodes) {
      for (let year = startYear; year <= endYear; year += 1) {
        for (const holiday of this.getYear(code, year)) {
          if (holiday.date >= from && holiday.date <= to) {
            result.push(holiday);
          }
        }
      }
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  private getYear(code: string, year: number): PublicHoliday[] {
    const key = `${code}:${year}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    if (!this.isSupported(code)) {
      return [];
    }

    const engine = new Holidays(code, {
      languages: ["en"],
      types: [...HOLIDAY_TYPES],
    });
    const countryName = this.countryName(code);
    const seen = new Set<string>();
    const holidays: PublicHoliday[] = [];

    for (const holiday of engine.getHolidays(year, "en") || []) {
      const date = holiday.date.slice(0, 10);
      const dedupeKey = `${date}:${holiday.name}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      holidays.push({
        countryCode: code,
        countryName,
        date,
        name: holiday.name,
        type: holiday.type,
      });
    }

    this.cache.set(key, holidays);
    return holidays;
  }
}
