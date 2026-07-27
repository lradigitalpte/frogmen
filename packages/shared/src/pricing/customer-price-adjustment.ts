export const DEFAULT_LOCAL_ADJUSTMENT_PERCENT = 5;
export const DEFAULT_NON_LOCAL_ADJUSTMENT_PERCENT = -5;

export interface SalesPricingSettings {
  localAdjustmentPercent?: number;
  nonLocalAdjustmentPercent?: number;
  defaultVatRatePercent?: number;
  vatRates?: number[];
}

export interface OrgMetadataWithSalesPricing {
  salesPricing?: SalesPricingSettings;
}

export function parseOrgSalesPricing(
  metadata: string | null | undefined,
): SalesPricingSettings {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata) as OrgMetadataWithSalesPricing;
    return parsed.salesPricing ?? {};
  } catch {
    return {};
  }
}

export function getAdjustmentPercent(
  isLocal: boolean,
  settings: SalesPricingSettings = {},
): number {
  if (isLocal) {
    return settings.localAdjustmentPercent ?? DEFAULT_LOCAL_ADJUSTMENT_PERCENT;
  }

  return (
    settings.nonLocalAdjustmentPercent ?? DEFAULT_NON_LOCAL_ADJUSTMENT_PERCENT
  );
}

export function applyPriceAdjustment(
  basePrice: number,
  isLocal: boolean,
  enabled: boolean,
  settings: SalesPricingSettings = {},
): number {
  if (!enabled || !Number.isFinite(basePrice)) {
    return basePrice;
  }

  const adjustmentPercent = getAdjustmentPercent(isLocal, settings);
  const adjusted = basePrice * (1 + adjustmentPercent / 100);
  return Math.round(adjusted * 100) / 100;
}

export function formatAdjustmentPercent(percent: number): string {
  if (percent === 0) {
    return "no change";
  }

  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent}%`;
}

export function resolveSalesPricingSettings(
  settings: SalesPricingSettings = {},
): Required<SalesPricingSettings> {
  return {
    localAdjustmentPercent:
      settings.localAdjustmentPercent ?? DEFAULT_LOCAL_ADJUSTMENT_PERCENT,
    nonLocalAdjustmentPercent:
      settings.nonLocalAdjustmentPercent ?? DEFAULT_NON_LOCAL_ADJUSTMENT_PERCENT,
    defaultVatRatePercent: settings.defaultVatRatePercent ?? 5,
    vatRates:
      settings.vatRates && settings.vatRates.length > 0
        ? [...new Set(settings.vatRates)].sort((a, b) => a - b)
        : [0, 5],
  };
}

export function pricingAdjustmentHelpText(
  settings: SalesPricingSettings = {},
): string {
  const resolved = resolveSalesPricingSettings(settings);
  return `Local customers: ${formatAdjustmentPercent(resolved.localAdjustmentPercent)}. Non-local customers: ${formatAdjustmentPercent(resolved.nonLocalAdjustmentPercent)}. Configure these in Settings.`;
}

export function pricingAdjustmentLabel(
  isLocal: boolean,
  enabled: boolean,
  settings: SalesPricingSettings = {},
): string | null {
  if (!enabled) {
    return null;
  }

  const percent = getAdjustmentPercent(isLocal, settings);
  if (percent === 0) {
    const scope = isLocal ? "Local" : "Non-local";
    return `${scope} pricing — no adjustment applied`;
  }

  const sign = percent > 0 ? "+" : "";
  const scope = isLocal ? "Local" : "Non-local";
  return `${scope} pricing ${sign}${percent}% applied`;
}
