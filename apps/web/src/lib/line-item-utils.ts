import {
  applyPriceAdjustment,
  type SalesPricingSettings,
} from "@frog1/shared";
import type { ProductStock } from "@/types/product";

export interface PricedLineItem {
  id: string;
  productId?: string;
  productUnitId?: string;
  quantity: number;
  baseUnitPrice: number;
  unitPrice: number;
  availableQuantity?: number;
}

export function sumStockQuantity(stock: ProductStock | null | undefined): number {
  if (!stock) {
    return 0;
  }

  return stock.levels.reduce(
    (sum, level) => sum + (Number(level.quantity) || 0),
    0,
  );
}

export function getAllocatedQuantity<
  T extends {
    id: string;
    productId?: string;
    productUnitId?: string;
    quantity: number;
  },
>(lines: T[], productId: string, excludeLineId?: string): number {
  return lines
    .filter(
      (line) =>
        line.productId === productId &&
        line.id !== excludeLineId &&
        !line.productUnitId,
    )
    .reduce((sum, line) => sum + line.quantity, 0);
}

export function getMaxAllowedQuantity<
  T extends {
    id: string;
    productId?: string;
    productUnitId?: string;
    quantity: number;
  },
>(
  availableQuantity: number,
  lines: T[],
  productId: string,
  excludeLineId?: string,
): number {
  const allocated = getAllocatedQuantity(lines, productId, excludeLineId);
  return Math.max(0, availableQuantity - allocated);
}

export function clampQuantity<
  T extends {
    id: string;
    productId?: string;
    productUnitId?: string;
    quantity: number;
    availableQuantity?: number;
  },
>(
  requestedQty: number,
  lines: T[],
  line: T,
): number {
  if (line.productUnitId) {
    return 1;
  }

  if (!line.productId) {
    return Math.max(requestedQty, 0);
  }

  const available = line.availableQuantity ?? 0;
  const maxAllowed = getMaxAllowedQuantity(
    available,
    lines,
    line.productId,
    line.id,
  );

  return Math.min(Math.max(requestedQty, 0), maxAllowed);
}

export function applyPricingToLine<T extends PricedLineItem>(
  line: T,
  isLocal: boolean,
  enabled: boolean,
  settings?: SalesPricingSettings,
): T {
  return {
    ...line,
    unitPrice: applyPriceAdjustment(
      line.baseUnitPrice,
      isLocal,
      enabled,
      settings,
    ),
  };
}

export function applyPricingToLines<T extends PricedLineItem>(
  lines: T[],
  isLocal: boolean,
  enabled: boolean,
  settings?: SalesPricingSettings,
): T[] {
  return lines.map((line) =>
    applyPricingToLine(line, isLocal, enabled, settings),
  );
}

export function parseSellingPrice(value: string | number | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface LineFinancialSummary {
  catalogSubtotal: number;
  pricingAdjustmentTotal: number;
  lineSubtotal: number;
  totalDiscount: number;
  netSubtotal: number;
  deliveryFee: number;
  totalVat: number;
  grandTotal: number;
  totalCost: number;
  grossProfit: number;
  profitMarginPercent: number | null;
}

export function resolveDeliveryFee(
  lineNet: number,
  deliveryFeeAmount?: number | string | null,
  deliveryFeePercent?: number | string | null,
): number {
  const amount =
    deliveryFeeAmount != null && deliveryFeeAmount !== ""
      ? Number(deliveryFeeAmount)
      : 0;
  const percent =
    deliveryFeePercent != null && deliveryFeePercent !== ""
      ? Number(deliveryFeePercent)
      : 0;

  if (Number.isFinite(amount) && amount > 0) {
    return Math.round(amount * 100) / 100;
  }

  if (Number.isFinite(percent) && percent > 0) {
    return Math.round(lineNet * (percent / 100) * 100) / 100;
  }

  return 0;
}

export function computeLineNetRevenue<
  T extends {
    quantity: number;
    unitPrice: number;
    discountPercent: number;
  },
>(line: T): number {
  return (
    line.quantity * line.unitPrice * (1 - line.discountPercent / 100)
  );
}

export function computeLineCost<
  T extends {
    quantity: number;
    unitCost?: number;
  },
>(line: T): number {
  return line.quantity * (line.unitCost ?? 0);
}

export function computeLineProfit<
  T extends {
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    unitCost?: number;
  },
>(line: T): number {
  return computeLineNetRevenue(line) - computeLineCost(line);
}

export function computeLineMarginPercent<
  T extends {
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    unitCost?: number;
  },
>(line: T): number | null {
  const revenue = computeLineNetRevenue(line);
  if (revenue <= 0) {
    return null;
  }

  return (computeLineProfit(line) / revenue) * 100;
}

export function formatMarginPercent(
  value: number | string | null | undefined,
): string {
  const numeric = value == null ? null : Number(value);
  if (numeric === null || !Number.isFinite(numeric)) {
    return "—";
  }

  return `${numeric.toFixed(1)}%`;
}

export function computeLineFinancialSummary<
  T extends {
    quantity: number;
    baseUnitPrice: number;
    unitPrice: number;
    discountPercent: number;
    taxRatePercent: number;
    unitCost?: number;
  },
>(
  lines: T[],
  options?: {
    deliveryFeeAmount?: number | string | null;
    deliveryFeePercent?: number | string | null;
  },
): LineFinancialSummary {
  const catalogSubtotal = lines.reduce(
    (sum, item) => sum + item.quantity * item.baseUnitPrice,
    0,
  );

  const lineSubtotal = lines.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  const pricingAdjustmentTotal = catalogSubtotal - lineSubtotal;

  const totalDiscount = lines.reduce(
    (sum, item) =>
      sum + item.quantity * item.unitPrice * (item.discountPercent / 100),
    0,
  );

  const netSubtotal = lineSubtotal - totalDiscount;

  const totalVat = lines.reduce((sum, item) => {
    const itemNet =
      item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
    return sum + itemNet * (item.taxRatePercent / 100);
  }, 0);

  const totalCost = lines.reduce((sum, item) => sum + computeLineCost(item), 0);
  const deliveryFee = resolveDeliveryFee(
    netSubtotal,
    options?.deliveryFeeAmount,
    options?.deliveryFeePercent,
  );
  const grossProfit = netSubtotal - totalCost;
  const profitMarginPercent =
    netSubtotal > 0 ? (grossProfit / netSubtotal) * 100 : null;

  return {
    catalogSubtotal,
    pricingAdjustmentTotal,
    lineSubtotal,
    totalDiscount,
    netSubtotal,
    deliveryFee,
    totalVat,
    grandTotal: netSubtotal + deliveryFee + totalVat,
    totalCost,
    grossProfit,
    profitMarginPercent,
  };
}

export function computeLineTotal<
  T extends {
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxRatePercent: number;
  },
>(line: T): number {
  return (
    line.quantity *
    line.unitPrice *
    (1 - line.discountPercent / 100) *
    (1 + line.taxRatePercent / 100)
  );
}
