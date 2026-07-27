import { roundMoney, sumDocumentAmounts } from "@frog1/shared";

export { roundMoney, sumDocumentAmounts };

export function calculateLineAmounts(input: {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRatePercent: number;
}) {
  const gross = input.quantity * input.unitPrice;
  const discountAmount = gross * (input.discountPercent / 100);
  const subtotal = roundMoney(gross - discountAmount);
  const tax = roundMoney(subtotal * (input.taxRatePercent / 100));
  const total = roundMoney(subtotal + tax);

  return {
    priceSubtotal: subtotal,
    priceTax: tax,
    priceTotal: total,
  };
}
