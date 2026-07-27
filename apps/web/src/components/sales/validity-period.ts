export type ValidityPreset =
  | "10_days"
  | "15_days"
  | "30_days"
  | "month_end"
  | "custom";

export const validityPresetOptions: {
  value: ValidityPreset;
  label: string;
}[] = [
  { value: "10_days", label: "10 days" },
  { value: "15_days", label: "15 days" },
  { value: "30_days", label: "30 days" },
  { value: "month_end", label: "Month end" },
  { value: "custom", label: "Custom date" },
];

function parseIsoDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function computeValidityDate(
  quoteDate: string,
  preset: ValidityPreset,
): string {
  if (!quoteDate) return "";

  const base = parseIsoDate(quoteDate);

  if (preset === "10_days") {
    base.setDate(base.getDate() + 10);
    return toIsoDate(base);
  }

  if (preset === "15_days") {
    base.setDate(base.getDate() + 15);
    return toIsoDate(base);
  }

  if (preset === "30_days") {
    base.setDate(base.getDate() + 30);
    return toIsoDate(base);
  }

  if (preset === "month_end") {
    const endOfMonth = new Date(
      base.getFullYear(),
      base.getMonth() + 1,
      0,
      12,
    );
    return toIsoDate(endOfMonth);
  }

  return "";
}

export function inferValidityPreset(
  quoteDate: string,
  validityDate: string,
): ValidityPreset {
  if (!quoteDate || !validityDate) {
    return "30_days";
  }

  for (const option of validityPresetOptions) {
    if (option.value === "custom") continue;

    if (computeValidityDate(quoteDate, option.value) === validityDate) {
      return option.value;
    }
  }

  return "custom";
}

export function defaultValidityHeader(quoteDate: string) {
  const preset: ValidityPreset = "30_days";

  return {
    validityPreset: preset,
    validityDate: computeValidityDate(quoteDate, preset),
  };
}
