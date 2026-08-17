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

function nonempty(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Display label for a stored ISO country code, falling back to the raw value. */
export function formatCountryLabel(code: string | null | undefined) {
  const value = nonempty(code);
  if (!value) {
    return undefined;
  }

  return getCountryName(value) ?? value;
}

/** Display label for a stored ISO state/emirate code, falling back to the raw value. */
export function formatStateLabel(
  countryCode: string | null | undefined,
  stateCode: string | null | undefined,
) {
  const value = nonempty(stateCode);
  if (!value) {
    return undefined;
  }

  return getStateName(countryCode, value) ?? value;
}

export interface PostalAddressInput {
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  stateCode?: string | null;
  zip?: string | null;
  countryCode?: string | null;
}

/** Human-readable postal lines: names, not ISO codes. */
export function formatPostalAddressLines(address: PostalAddressInput): string[] {
  const lines: string[] = [];
  const street1 = nonempty(address.street1);
  const street2 = nonempty(address.street2);

  if (street1) {
    lines.push(street1);
  }
  if (street2) {
    lines.push(street2);
  }

  const locality = [
    nonempty(address.city),
    formatStateLabel(address.countryCode, address.stateCode),
    nonempty(address.zip),
  ]
    .filter(Boolean)
    .join(", ");

  if (locality) {
    lines.push(locality);
  }

  const country = formatCountryLabel(address.countryCode);
  if (country) {
    lines.push(country);
  }

  return lines;
}
