import { sumByCurrencyParts } from "./customer-format";

/** Largest-currency total on top, any other currencies on a small second line. */
export function MultiCurrencyAmount({
  items,
  fallbackCurrency,
}: {
  items: { amount: number; currencyCode: string }[];
  fallbackCurrency: string | undefined;
}) {
  const [primary, ...rest] = sumByCurrencyParts(items, fallbackCurrency);
  return (
    <>
      {primary}
      {rest.length ? <small className="cmoney-extra">+ {rest.join(" + ")}</small> : null}
    </>
  );
}
