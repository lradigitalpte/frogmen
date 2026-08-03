export function formatQuantity(
  value: string | number | null | undefined,
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  if (Number.isInteger(amount)) return String(amount);
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
