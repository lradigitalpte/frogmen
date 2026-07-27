import countries from "./data/countries.json";
import statesByCountry from "./data/states-by-country.json";

export interface Country {
  code: string;
  name: string;
}

export interface State {
  code: string;
  name: string;
}

export const COUNTRIES = countries as Country[];
export const STATES_BY_COUNTRY = statesByCountry as Record<string, State[]>;

export const COUNTRY_CODES = new Set(COUNTRIES.map((country) => country.code));

export function getCountryOptions() {
  return COUNTRIES.map((country) => ({
    label: country.name,
    value: country.code,
  }));
}

export function getCountryName(code: string | null | undefined) {
  if (!code) {
    return undefined;
  }

  return COUNTRIES.find((country) => country.code === code)?.name;
}

export function getStatesForCountry(code: string | null | undefined) {
  if (!code) {
    return [];
  }

  return STATES_BY_COUNTRY[code] ?? [];
}

export function countryHasStates(code: string | null | undefined) {
  return getStatesForCountry(code).length > 0;
}

export function getStateOptions(code: string | null | undefined) {
  return getStatesForCountry(code).map((state) => ({
    label: state.name,
    value: state.code,
  }));
}

export function getStateName(
  countryCode: string | null | undefined,
  stateCode: string | null | undefined,
) {
  if (!countryCode || !stateCode) {
    return undefined;
  }

  return getStatesForCountry(countryCode).find((state) => state.code === stateCode)
    ?.name;
}
