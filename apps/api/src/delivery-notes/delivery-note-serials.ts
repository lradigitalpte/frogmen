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
    let mainSerial = input.serialNumber?.trim() ?? "";
    if (!mainSerial) {
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
    entries.push({
      productName: input.productName,
      serialNumber: input.serialNumber.trim(),
    });
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
