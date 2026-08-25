export type GroupableSerializedLine = {
  productId?: string | null;
  description: string;
  details?: string | null;
  productDescription?: string | null;
  serialNumber?: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent?: string | null;
  discountAmount?: string | null;
  taxRatePercent?: string | null;
  priceSubtotal: string;
};

export type GroupedSerializedLine<T extends GroupableSerializedLine> = T & {
  serialNumbers: string[];
  sourceLines: T[];
};

/** Groups identical serialized units for presentation without merging inventory records. */
export function groupSerializedLines<T extends GroupableSerializedLine>(
  lines: T[],
): GroupedSerializedLine<T>[] {
  const groups = new Map<string, GroupedSerializedLine<T>>();

  lines.forEach((line, index) => {
    const serialNumber = line.serialNumber?.trim();
    const details = line.details ?? line.productDescription ?? "";
    const key = serialNumber
      ? JSON.stringify([
          line.productId ?? line.description,
          line.description,
          details,
          line.unitPrice,
          line.discountPercent ?? "0",
          line.taxRatePercent ?? "0",
        ])
      : `ungrouped:${index}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ...line,
        serialNumbers: serialNumber ? [serialNumber] : [],
        sourceLines: [line],
      });
      return;
    }

    existing.quantity = String(Number(existing.quantity) + Number(line.quantity));
    existing.priceSubtotal = String(Number(existing.priceSubtotal) + Number(line.priceSubtotal));
    existing.discountAmount = String(
      Number(existing.discountAmount ?? 0) + Number(line.discountAmount ?? 0),
    );
    existing.serialNumbers.push(serialNumber!);
    existing.sourceLines.push(line);
  });

  return [...groups.values()];
}
