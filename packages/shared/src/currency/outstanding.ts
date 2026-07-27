import { convertAmount, roundMoney } from "./money";

/** Proportional outstanding in base currency for KPIs and alerts. */
export function computeOutstandingInBase(input: {
  amountTotal: number;
  amountPaid: number;
  amountTotalBase?: number | null;
  exchangeRate?: number | null;
}) {
  const amountOutstanding = Math.max(input.amountTotal - input.amountPaid, 0);

  if (amountOutstanding <= 0) {
    return 0;
  }

  const { amountTotal, amountTotalBase, exchangeRate } = input;

  if (
    amountTotalBase != null &&
    Number.isFinite(amountTotalBase) &&
    amountTotalBase > 0 &&
    amountTotal > 0
  ) {
    return roundMoney(
      Math.max(amountTotalBase - (input.amountPaid / amountTotal) * amountTotalBase, 0),
    );
  }

  if (exchangeRate != null && Number.isFinite(exchangeRate) && exchangeRate > 0) {
    return convertAmount(amountOutstanding, exchangeRate);
  }

  return roundMoney(amountOutstanding);
}
