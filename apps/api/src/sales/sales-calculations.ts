import {
  resolveLineDiscount,
  roundMoney,
  sumDocumentAmounts,
} from "@frog1/shared";

export { roundMoney, sumDocumentAmounts };

export function calculateLineAmounts(input: {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  taxRatePercent: number;
}) {
  const gross = input.quantity * input.unitPrice;
  const discount = resolveLineDiscount(
    gross,
    input.discountAmount,
    input.discountPercent,
  );
  const subtotal = roundMoney(gross - discount);
  const tax = roundMoney(subtotal * (input.taxRatePercent / 100));
  const total = roundMoney(subtotal + tax);

  return {
    priceSubtotal: subtotal,
    priceTax: tax,
    priceTotal: total,
  };
}
