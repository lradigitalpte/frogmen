/** Response fields that reveal what the company pays for a product. */
const COST_FIELDS = new Set([
  "costPrice",
  "productCostPrice",
  "currentCostPrice",
  "costAmount",
  "costAmountBase",
  "unitCost",
  "previousUnitCost",
]);

/** A copy of a JSON-like value with every cost field set to null. */
export function hideCosts<T>(value: T): T {
  if (Array.isArray(value)) return value.map(hideCosts) as T;
  if (!value || typeof value !== "object") return value;
  // Leave dates, buffers, streams and other class instances untouched.
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      COST_FIELDS.has(key) ? null : hideCosts(item),
    ]),
  ) as T;
}
