import { BadRequestException } from "@nestjs/common";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { products, type Database } from "@frog1/db";

export function productReferencePrefix(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();

  if (letters.length >= 3) {
    return letters.slice(0, 3);
  }

  if (letters.length > 0) {
    return letters.padEnd(3, "X");
  }

  return "PRD";
}

function randomReferenceSuffix(): string {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
}

export function buildProductReference(name: string, suffix?: string): string {
  return `${productReferencePrefix(name)}${suffix ?? randomReferenceSuffix()}`;
}

export async function isProductSkuTaken(
  db: Database,
  organizationId: string,
  sku: string,
  excludeProductId?: string,
) {
  const filters: SQL[] = [
    eq(products.organizationId, organizationId),
    isNull(products.deletedAt),
    sql`lower(${products.sku}) = lower(${sku})`,
  ];

  if (excludeProductId) {
    filters.push(sql`${products.id} <> ${excludeProductId}`);
  }

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...filters))
    .limit(1);

  return Boolean(existing);
}

export async function generateUniqueProductSku(
  db: Database,
  organizationId: string,
  name: string,
  excludeProductId?: string,
) {
  const prefix = productReferencePrefix(name);
  const maxAttempts = 50;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sku = `${prefix}${randomReferenceSuffix()}`;
    const taken = await isProductSkuTaken(
      db,
      organizationId,
      sku,
      excludeProductId,
    );

    if (!taken) {
      return sku;
    }
  }

  throw new BadRequestException(
    "Unable to generate a unique product reference. Try again.",
  );
}

export async function assertUniqueProductSku(
  db: Database,
  organizationId: string,
  sku: string,
  excludeProductId?: string,
) {
  const taken = await isProductSkuTaken(
    db,
    organizationId,
    sku,
    excludeProductId,
  );

  if (taken) {
    throw new BadRequestException(
      `Product reference "${sku}" is already in use`,
    );
  }

  return sku;
}
