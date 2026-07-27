export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function convertAmount(amount: number, rate: number) {
  return roundMoney(amount * rate);
}

export function sumDocumentAmounts(
  lines: Array<{
    priceSubtotal: number;
    priceTax: number;
    priceTotal: number;
  }>,
  exchangeRate = 1,
) {
  const amountUntaxed = roundMoney(
    lines.reduce((sum, line) => sum + line.priceSubtotal, 0),
  );
  const amountTax = roundMoney(
    lines.reduce((sum, line) => sum + line.priceTax, 0),
  );
  const amountTotal = roundMoney(
    lines.reduce((sum, line) => sum + line.priceTotal, 0),
  );

  return {
    amountUntaxed,
    amountTax,
    amountTotal,
    amountUntaxedBase: roundMoney(amountUntaxed * exchangeRate),
    amountTaxBase: roundMoney(amountTax * exchangeRate),
    amountTotalBase: roundMoney(amountTotal * exchangeRate),
  };
}
