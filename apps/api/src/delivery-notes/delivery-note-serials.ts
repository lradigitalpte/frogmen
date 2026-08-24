import { and, asc, eq } from "drizzle-orm";
import { productUnits, products, type Database } from "@frog1/db";

export interface DeliveryNoteSerialEntry {
  productName: string;
  serialNumber: string;
  isKit?: boolean;
}

export async function resolveDeliveryNoteSerialEntries(
  db: Database,
  organizationId: string,
  input: {
    productUnitId: string | null;
    productName: string;
    serialNumber: string | null;
  },
): Promise<DeliveryNoteSerialEntry[]> {
  const entries: DeliveryNoteSerialEntry[] = [];

  if (input.productUnitId) {
    let mainSerial = "";
    const [unit] = await db
      .select({ serialNumber: productUnits.serialNumber })
      .from(productUnits)
      .where(
        and(
          eq(productUnits.id, input.productUnitId),
          eq(productUnits.organizationId, organizationId),
        ),
      )
      .limit(1);

    mainSerial = unit?.serialNumber?.trim() ?? "";

    if (!mainSerial && input.serialNumber?.trim()) {
      const firstLine = input.serialNumber.trim().split("\n")[0]?.trim() ?? "";
      const splitIndex = firstLine.indexOf(" · ");
      mainSerial = splitIndex !== -1 ? firstLine.slice(splitIndex + 3).trim() : firstLine;
    }

    if (mainSerial) {
      entries.push({
        productName: input.productName,
        serialNumber: mainSerial,
        isKit: true,
      });
    }

    const childUnits = await db
      .select({
        serialNumber: productUnits.serialNumber,
        productName: products.name,
      })
      .from(productUnits)
      .innerJoin(products, eq(products.id, productUnits.productId))
      .where(
        and(
          eq(productUnits.parentUnitId, input.productUnitId),
          eq(productUnits.organizationId, organizationId),
        ),
      )
      .orderBy(asc(products.name));

    for (const child of childUnits) {
      entries.push({
        productName: child.productName,
        serialNumber: child.serialNumber,
      });
    }

    return entries;
  }

  if (input.serialNumber?.trim()) {
    const lines = input.serialNumber
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (const [index, line] of lines.entries()) {
      const splitIndex = line.indexOf(" · ");
      if (splitIndex !== -1) {
        entries.push({
          productName: line.slice(0, splitIndex).trim(),
          serialNumber: line.slice(splitIndex + 3).trim(),
          isKit: index === 0 && lines.length > 1,
        });
      } else {
        entries.push({
          productName: input.productName,
          serialNumber: line,
        });
      }
    }
  }

  return entries;
}

export function formatDeliveryNoteSerialEntries(
  entries: DeliveryNoteSerialEntry[],
): string | null {
  if (entries.length === 0) {
    return null;
  }

  return entries
    .map((entry) => `${entry.productName} · ${entry.serialNumber}`)
    .join("\n");
}
