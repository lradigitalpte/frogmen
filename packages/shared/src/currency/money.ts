export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function convertAmount(amount: number, rate: number) {
  return roundMoney(amount * rate);
}

export function resolveDeliveryFee(
  lineNet: number,
  deliveryFeeAmount?: string | number | null,
  deliveryFeePercent?: string | number | null,
): number {
  const amount =
    deliveryFeeAmount != null && deliveryFeeAmount !== ""
      ? Number(deliveryFeeAmount)
      : 0;
  const percent =
    deliveryFeePercent != null && deliveryFeePercent !== ""
      ? Number(deliveryFeePercent)
      : 0;

  if (amount > 0) {
    return roundMoney(amount);
  }

  if (percent > 0) {
    return roundMoney(lineNet * (percent / 100));
  }

  return 0;
}

/** Fixed amount wins when > 0; otherwise percent of gross. */
export function resolveLineDiscount(
  gross: number,
  discountAmount?: string | number | null,
  discountPercent?: string | number | null,
): number {
  const amount =
    discountAmount != null && discountAmount !== ""
      ? Number(discountAmount)
      : 0;
  const percent =
    discountPercent != null && discountPercent !== ""
      ? Number(discountPercent)
      : 0;

  if (Number.isFinite(amount) && amount > 0) {
    return roundMoney(Math.min(Math.max(gross, 0), amount));
  }

  if (Number.isFinite(percent) && percent > 0) {
    return roundMoney(gross * (percent / 100));
  }

  return 0;
}

/** Distribute one document-level fixed discount across line gross amounts. */
export function allocateFixedDiscount(
  grossAmounts: number[],
  requestedDiscount: number,
): number[] {
  const grossCents = grossAmounts.map((gross) =>
    Math.max(0, Math.round((Number.isFinite(gross) ? gross : 0) * 100)),
  );
  const totalGrossCents = grossCents.reduce((sum, gross) => sum + gross, 0);
  const discountCents = Math.min(
    totalGrossCents,
    Math.max(0, Math.round((Number.isFinite(requestedDiscount) ? requestedDiscount : 0) * 100)),
  );

  if (totalGrossCents === 0 || discountCents === 0) {
    return grossCents.map(() => 0);
  }

  const shares = grossCents.map((gross, index) => {
    const exact = (discountCents * gross) / totalGrossCents;
    return { index, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = discountCents - shares.reduce((sum, share) => sum + share.cents, 0);

  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining === 0) break;
    share.cents += 1;
    remaining -= 1;
  }

  return shares.sort((a, b) => a.index - b.index).map((share) => share.cents / 100);
}

export function sumDocumentAmounts(
  lines: Array<{
    priceSubtotal: number;
    priceTax: number;
    priceTotal: number;
  }>,
  exchangeRate = 1,
  deliveryFeeAmount?: string | number | null,
  deliveryFeePercent?: string | number | null,
) {
  const lineNet = roundMoney(
    lines.reduce((sum, line) => sum + line.priceSubtotal, 0),
  );
  const deliveryFee = resolveDeliveryFee(
    lineNet,
    deliveryFeeAmount,
    deliveryFeePercent,
  );
  const amountUntaxed = roundMoney(lineNet + deliveryFee);
  const amountTax = roundMoney(
    lines.reduce((sum, line) => sum + line.priceTax, 0),
  );
  const amountTotal = roundMoney(amountUntaxed + amountTax);

  return {
    lineNet,
    deliveryFee,
    amountUntaxed,
    amountTax,
    amountTotal,
    amountUntaxedBase: roundMoney(amountUntaxed * exchangeRate),
    amountTaxBase: roundMoney(amountTax * exchangeRate),
    amountTotalBase: roundMoney(amountTotal * exchangeRate),
  };
}

export interface PurchaseOrderLineForLandedCost {
  id: string;
  priceSubtotal: number | string;
  unitPrice: number | string;
  quantity: number | string;
}

export interface PurchaseOrderChargesForLandedCost {
  freightAmount?: string | number | null;
  freightPercent?: string | number | null;
  otherChargesAmount?: string | number | null;
  namedCharges?: PurchaseOrderNamedChargeForLandedCost[];
}

export interface PurchaseOrderNamedChargeForLandedCost {
  scope: "order" | "line";
  amount: number | string;
  purchaseOrderLineId?: string | null;
}

export function suggestSellingPrice(
  landedUnitCost: number,
  targetMarginPercent: number,
): number | null {
  if (
    !Number.isFinite(landedUnitCost) ||
    landedUnitCost <= 0 ||
    !Number.isFinite(targetMarginPercent) ||
    targetMarginPercent >= 100
  ) {
    return null;
  }

  const sellMultiplier = 1 - targetMarginPercent / 100;
  if (sellMultiplier <= 0) {
    return null;
  }

  return roundMoney(landedUnitCost / sellMultiplier);
}

function sumNamedChargeAmounts(
  namedCharges: PurchaseOrderNamedChargeForLandedCost[] | undefined,
) {
  if (!namedCharges?.length) {
    return 0;
  }

  return roundMoney(
    namedCharges.reduce((sum, charge) => {
      const amount = Number(charge.amount);
      return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
    }, 0),
  );
}

function buildLineChargeTotals(
  namedCharges: PurchaseOrderNamedChargeForLandedCost[] | undefined,
) {
  const lineChargesByLineId = new Map<string, number>();

  for (const charge of namedCharges ?? []) {
    const amount = Number(charge.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    if (charge.scope === "line" && charge.purchaseOrderLineId) {
      const current = lineChargesByLineId.get(charge.purchaseOrderLineId) ?? 0;
      lineChargesByLineId.set(
        charge.purchaseOrderLineId,
        roundMoney(current + amount),
      );
      continue;
    }

    if (charge.scope === "order") {
      continue;
    }
  }

  return lineChargesByLineId;
}

function resolveOrderChargePool(
  lineNet: number,
  charges: PurchaseOrderChargesForLandedCost,
) {
  const freight = resolveDeliveryFee(
    lineNet,
    charges.freightAmount,
    charges.freightPercent,
  );

  if (charges.namedCharges?.length) {
    const orderScopedTotal = roundMoney(
      charges.namedCharges.reduce((sum, charge) => {
        if (charge.scope !== "order") {
          return sum;
        }

        const amount = Number(charge.amount);
        return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
      }, 0),
    );

    return roundMoney(freight + orderScopedTotal);
  }

  const other = Number(charges.otherChargesAmount ?? 0) || 0;
  return roundMoney(freight + other);
}

export function computeLandedUnitCost(
  unitPrice: number,
  quantity: number,
  lineSubtotal: number,
  lineNet: number,
  chargePool: number,
): number {
  if (lineNet <= 0 || chargePool <= 0 || quantity <= 0) {
    return roundMoney(unitPrice);
  }

  const lineShare = lineSubtotal / lineNet;
  const lineCharge = chargePool * lineShare;
  return roundMoney(unitPrice + lineCharge / quantity);
}

export function buildPoLandedUnitCostsByLineId(
  lines: PurchaseOrderLineForLandedCost[],
  charges: PurchaseOrderChargesForLandedCost,
): Map<string, number> {
  const lineNet = roundMoney(
    lines.reduce((sum, line) => sum + Number(line.priceSubtotal), 0),
  );
  const chargePool = resolveOrderChargePool(lineNet, charges);
  const lineChargesByLineId = buildLineChargeTotals(charges.namedCharges);
  const result = new Map<string, number>();

  for (const line of lines) {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const lineSubtotal = Number(line.priceSubtotal);
    let landed = unitPrice;

    if (chargePool > 0 && lineNet > 0 && quantity > 0) {
      const lineShare = lineSubtotal / lineNet;
      landed = roundMoney(unitPrice + (chargePool * lineShare) / quantity);
    }

    const lineSpecific = lineChargesByLineId.get(line.id) ?? 0;
    if (lineSpecific > 0 && quantity > 0) {
      landed = roundMoney(landed + lineSpecific / quantity);
    }

    result.set(line.id, landed);
  }

  return result;
}

export function sumPurchaseOrderAdditionalCharges(
  charges: PurchaseOrderChargesForLandedCost,
  lineNet: number,
) {
  const freight = resolveDeliveryFee(
    lineNet,
    charges.freightAmount,
    charges.freightPercent,
  );

  if (charges.namedCharges?.length) {
    return roundMoney(freight + sumNamedChargeAmounts(charges.namedCharges));
  }

  const other = Number(charges.otherChargesAmount ?? 0) || 0;
  return roundMoney(freight + other);
}
