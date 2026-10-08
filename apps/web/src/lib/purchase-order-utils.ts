import {
  buildPoLandedUnitCostsByLineId,
  computeLandedUnitCost,
  distributePurchaseOrderVendorDiscount,
  resolveLineDiscount,
  suggestSellingPrice,
  type PurchaseOrderNamedChargeForLandedCost,
} from "@frog1/shared";
import { resolveDeliveryFee } from "@/lib/line-item-utils";

export type FreightMode = "none" | "amount" | "percent";
export type PurchaseOrderChargeScope = "order" | "line";

export interface PurchaseOrderNamedChargeRow {
  id: string;
  name: string;
  amount: string;
  scope: PurchaseOrderChargeScope;
  purchaseOrderLineId: string | null;
}

export interface PurchaseOrderChargeValues {
  freightMode: FreightMode;
  freightValue: string;
  vendorDiscountMode: FreightMode;
  vendorDiscountValue: string;
  additionalCharges: PurchaseOrderNamedChargeRow[];
  targetMarginPercent: string;
}

export interface PurchaseOrderNamedChargePayload {
  name: string;
  amount: number;
  scope: PurchaseOrderChargeScope;
  purchaseOrderLineId?: string | null;
}

export interface PurchaseOrderChargesPayload {
  freightAmount?: number | null;
  freightPercent?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
  otherChargesAmount?: number | null;
  targetMarginPercent?: number | null;
  additionalCharges?: PurchaseOrderNamedChargePayload[];
}

export interface PurchaseOrderLineOption {
  id: string;
  label: string;
}

export interface PurchaseOrderLineForTotals {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  taxRatePercent?: number;
}

export function purchaseOrderLineGross(line: {
  quantity: number;
  unitPrice: number;
}) {
  return line.quantity * line.unitPrice;
}

export function purchaseOrderLineNet(line: PurchaseOrderLineForTotals) {
  const gross = purchaseOrderLineGross(line);
  return roundMoney(
    gross -
      resolveLineDiscount(
        gross,
        line.discountAmount ?? 0,
        line.discountPercent ?? 0,
      ),
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function emptyPurchaseOrderCharges(): PurchaseOrderChargeValues {
  return {
    freightMode: "none",
    freightValue: "",
    vendorDiscountMode: "none",
    vendorDiscountValue: "",
    additionalCharges: [],
    targetMarginPercent: "",
  };
}

export function createEmptyNamedCharge(): PurchaseOrderNamedChargeRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    amount: "",
    scope: "order",
    purchaseOrderLineId: null,
  };
}

export function buildFreightPayload(
  mode: FreightMode,
  value: string,
): Pick<PurchaseOrderChargesPayload, "freightAmount" | "freightPercent"> {
  if (mode === "none") {
    return {
      freightAmount: null,
      freightPercent: null,
    };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      freightAmount: null,
      freightPercent: null,
    };
  }

  if (mode === "amount") {
    return {
      freightAmount: parsed,
      freightPercent: null,
    };
  }

  return {
    freightAmount: null,
    freightPercent: parsed,
  };
}

export function buildNamedChargesPayload(
  rows: PurchaseOrderNamedChargeRow[],
): PurchaseOrderNamedChargePayload[] {
  return rows
    .map((row) => {
      const amount = Number(row.amount);
      const name = row.name.trim();
      if (!name || !Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return {
        name,
        amount,
        scope: row.scope,
        purchaseOrderLineId:
          row.scope === "line" ? row.purchaseOrderLineId : null,
      };
    })
    .filter(Boolean) as PurchaseOrderNamedChargePayload[];
}

export function buildPurchaseOrderChargesPayload(
  charges: PurchaseOrderChargeValues,
): PurchaseOrderChargesPayload {
  const additionalCharges = buildNamedChargesPayload(charges.additionalCharges);
  const otherChargesAmount = additionalCharges.length
    ? roundMoney(additionalCharges.reduce((sum, row) => sum + row.amount, 0))
    : null;
  const targetMargin = Number(charges.targetMarginPercent);

  return {
    ...buildFreightPayload(charges.freightMode, charges.freightValue),
    ...buildVendorDiscountPayload(
      charges.vendorDiscountMode,
      charges.vendorDiscountValue,
    ),
    otherChargesAmount,
    targetMarginPercent:
      Number.isFinite(targetMargin) && targetMargin > 0 ? targetMargin : null,
    additionalCharges,
  };
}

export function buildVendorDiscountPayload(
  mode: FreightMode,
  value: string,
): Pick<PurchaseOrderChargesPayload, "discountAmount" | "discountPercent"> {
  if (mode === "none") {
    return {
      discountAmount: null,
      discountPercent: null,
    };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      discountAmount: null,
      discountPercent: null,
    };
  }

  if (mode === "amount") {
    return {
      discountAmount: parsed,
      discountPercent: null,
    };
  }

  return {
    discountAmount: null,
    discountPercent: parsed,
  };
}

function hasOrderVendorDiscount(payload: PurchaseOrderChargesPayload) {
  const amount = Number(payload.discountAmount ?? 0);
  const percent = Number(payload.discountPercent ?? 0);
  return amount > 0 || percent > 0;
}

export function applyOrderVendorDiscountToLines<T extends PurchaseOrderLineForTotals>(
  lines: T[],
  payload: PurchaseOrderChargesPayload,
): T[] {
  if (!hasOrderVendorDiscount(payload)) {
    return lines;
  }

  const allocations = distributePurchaseOrderVendorDiscount(
    lines,
    payload.discountPercent,
    payload.discountAmount,
  );

  return lines.map((line, index) => ({
    ...line,
    discountPercent: allocations[index]?.discountPercent ?? 0,
    discountAmount: allocations[index]?.discountAmount ?? 0,
  }));
}

export function chargesFromPurchaseOrder(order: {
  freightAmount?: string | null;
  freightPercent?: string | null;
  discountAmount?: string | null;
  discountPercent?: string | null;
  otherChargesAmount?: string | null;
  targetMarginPercent?: string | null;
  additionalCharges?: Array<{
    id: string;
    name: string;
    amount: string;
    scope: PurchaseOrderChargeScope;
    purchaseOrderLineId?: string | null;
  }>;
}): PurchaseOrderChargeValues {
  const freightAmount = Number(order.freightAmount ?? 0);
  const freightPercent = Number(order.freightPercent ?? 0);
  const discountAmount = Number(order.discountAmount ?? 0);
  const discountPercent = Number(order.discountPercent ?? 0);
  const targetMarginPercent = Number(order.targetMarginPercent ?? 0);

  let freightMode: FreightMode = "none";
  let freightValue = "";
  let vendorDiscountMode: FreightMode = "none";
  let vendorDiscountValue = "";

  if (Number.isFinite(freightAmount) && freightAmount > 0) {
    freightMode = "amount";
    freightValue = String(freightAmount);
  } else if (Number.isFinite(freightPercent) && freightPercent > 0) {
    freightMode = "percent";
    freightValue = String(freightPercent);
  }

  if (Number.isFinite(discountAmount) && discountAmount > 0) {
    vendorDiscountMode = "amount";
    vendorDiscountValue = String(discountAmount);
  } else if (Number.isFinite(discountPercent) && discountPercent > 0) {
    vendorDiscountMode = "percent";
    vendorDiscountValue = String(discountPercent);
  }

  const additionalCharges =
    order.additionalCharges?.map((row) => ({
      id: row.id,
      name: row.name,
      amount: String(row.amount),
      scope: row.scope,
      purchaseOrderLineId: row.purchaseOrderLineId ?? null,
    })) ?? [];

  if (additionalCharges.length === 0) {
    const legacyOther = Number(order.otherChargesAmount ?? 0);
    if (legacyOther > 0) {
      additionalCharges.push({
        id: crypto.randomUUID(),
        name: "Other charges",
        amount: String(legacyOther),
        scope: "order",
        purchaseOrderLineId: null,
      });
    }
  }

  return {
    freightMode,
    freightValue,
    vendorDiscountMode,
    vendorDiscountValue,
    additionalCharges,
    targetMarginPercent:
      Number.isFinite(targetMarginPercent) && targetMarginPercent > 0
        ? String(targetMarginPercent)
        : "",
  };
}

function buildNamedChargesForLandedCost(
  payload: PurchaseOrderChargesPayload,
): PurchaseOrderNamedChargeForLandedCost[] | undefined {
  if (!payload.additionalCharges?.length) {
    return undefined;
  }

  return payload.additionalCharges.map((charge) => ({
    scope: charge.scope,
    amount: charge.amount,
    purchaseOrderLineId: charge.purchaseOrderLineId ?? null,
  }));
}

export function computePurchaseOrderTotals(
  lines: PurchaseOrderLineForTotals[],
  payload: PurchaseOrderChargesPayload,
) {
  const pricedLines = applyOrderVendorDiscountToLines(lines, payload);
  const lineGross = roundMoney(
    pricedLines.reduce((sum, line) => sum + purchaseOrderLineGross(line), 0),
  );
  const lineNet = roundMoney(
    pricedLines.reduce((sum, line) => sum + purchaseOrderLineNet(line), 0),
  );
  const lineDiscount = roundMoney(Math.max(0, lineGross - lineNet));
  const freight = resolveDeliveryFee(
    lineNet,
    payload.freightAmount,
    payload.freightPercent,
  );
  const namedTotal = payload.additionalCharges?.length
    ? roundMoney(
        payload.additionalCharges.reduce((sum, charge) => sum + charge.amount, 0),
      )
    : Number(payload.otherChargesAmount ?? 0) || 0;
  const amountTax = roundMoney(
    pricedLines.reduce((sum, line) => {
      const subtotal = purchaseOrderLineNet(line);
      const taxRate = line.taxRatePercent ?? 0;
      return sum + subtotal * (taxRate / 100);
    }, 0),
  );
  const amountUntaxed = roundMoney(lineNet + freight + namedTotal);
  const amountTotal = roundMoney(amountUntaxed + amountTax);

  return {
    lineGross,
    lineDiscount,
    lineNet,
    freight,
    other: namedTotal,
    amountTax,
    amountUntaxed,
    amountTotal,
  };
}

export interface PurchaseOrderMarginLine {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal?: number;
  sellingPrice?: number | null;
}

export interface PurchaseOrderMarginRow {
  id: string;
  productName: string;
  unitPrice: number;
  landedUnitCost: number;
  sellingPrice: number | null;
  suggestedSellingPrice: number | null;
  marginPercent: number | null;
}

export function computePurchaseOrderMarginPreview(
  lines: PurchaseOrderMarginLine[],
  payload: PurchaseOrderChargesPayload,
): PurchaseOrderMarginRow[] {
  const lineInputs = lines.map((line) => ({
    id: line.id,
    priceSubtotal: line.lineSubtotal ?? purchaseOrderLineNet(line),
    unitPrice: line.unitPrice,
    quantity: line.quantity,
  }));
  const landedByLineId = buildPoLandedUnitCostsByLineId(lineInputs, {
    freightAmount: payload.freightAmount,
    freightPercent: payload.freightPercent,
    otherChargesAmount: payload.otherChargesAmount,
    namedCharges: buildNamedChargesForLandedCost(payload),
  });
  const targetMargin = Number(payload.targetMarginPercent ?? 0);

  return lines.map((line) => {
    const landedUnitCost =
      landedByLineId.get(line.id) ??
      computeLandedUnitCost(
        line.unitPrice,
        line.quantity,
        line.quantity * line.unitPrice,
        lineInputs.reduce((sum, item) => sum + Number(item.priceSubtotal), 0),
        0,
      );
    const sellingPrice =
      line.sellingPrice != null && Number.isFinite(line.sellingPrice)
        ? line.sellingPrice
        : null;
    const suggestedSellingPrice =
      Number.isFinite(targetMargin) && targetMargin > 0
        ? suggestSellingPrice(landedUnitCost, targetMargin)
        : null;
    const marginPercent =
      sellingPrice != null && sellingPrice > 0
        ? ((sellingPrice - landedUnitCost) / sellingPrice) * 100
        : null;

    return {
      id: line.id,
      productName: line.productName,
      unitPrice: line.unitPrice,
      landedUnitCost,
      sellingPrice,
      suggestedSellingPrice,
      marginPercent,
    };
  });
}

export function computeBlendedMarginPercent(rows: PurchaseOrderMarginRow[]) {
  let totalSell = 0;
  let totalProfit = 0;

  for (const row of rows) {
    const sell = row.sellingPrice ?? row.suggestedSellingPrice;
    if (sell == null || sell <= 0) {
      continue;
    }

    totalSell += sell;
    totalProfit += sell - row.landedUnitCost;
  }

  if (totalSell <= 0) {
    return null;
  }

  return (totalProfit / totalSell) * 100;
}
