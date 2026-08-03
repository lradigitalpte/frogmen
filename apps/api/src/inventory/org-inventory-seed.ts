import { and, eq, isNull, sql } from "drizzle-orm";
import {
  productCategoryCatalog,
  productTagCatalog,
  warrantyPolicies,
  type Database,
} from "@frog1/db";

export const DEFAULT_PRODUCT_CATEGORIES = [
  "Sonar & imaging",
  "USBL & positioning",
  "ROV accessories",
  "Cameras & sensors",
  "Packages & kits",
  "Spare parts",
] as const;

export const DEFAULT_PRODUCT_TAGS = [
  "CHASING M2 S/M2 PRO/M2 PRO MAX/ MINIS ACCESSORIES",
  "Blueprint",
  "Cerulean",
  "Chasing",
  "Sonar",
  "USBL",
  "DVL",
  "Packages",
] as const;

export const DEFAULT_WARRANTY_POLICIES = [
  {
    name: "12-month manufacturer warranty",
    description:
      "Standard manufacturer warranty for ROVs, high-pressure hose systems, and diving regulators.",
    durationMonths: 12,
  },
  {
    name: "24-month extended warranty",
    description: "Extended coverage for premium equipment and bundled kits.",
    durationMonths: 24,
  },
  {
    name: "90-day parts warranty",
    description: "Short-term coverage for spare parts and consumables.",
    durationMonths: 3,
  },
] as const;

async function ensureProductCategory(
  db: Database,
  organizationId: string,
  name: string,
) {
  const [existing] = await db
    .select({ id: productCategoryCatalog.id })
    .from(productCategoryCatalog)
    .where(
      and(
        eq(productCategoryCatalog.organizationId, organizationId),
        isNull(productCategoryCatalog.deletedAt),
        sql`lower(${productCategoryCatalog.name}) = lower(${name})`,
      ),
    )
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(productCategoryCatalog).values({
    organizationId,
    name,
  });
}

async function ensureProductTag(
  db: Database,
  organizationId: string,
  name: string,
) {
  const [existing] = await db
    .select({ id: productTagCatalog.id })
    .from(productTagCatalog)
    .where(
      and(
        eq(productTagCatalog.organizationId, organizationId),
        isNull(productTagCatalog.deletedAt),
        sql`lower(${productTagCatalog.name}) = lower(${name})`,
      ),
    )
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(productTagCatalog).values({
    organizationId,
    name,
  });
}

async function ensureWarrantyPolicy(
  db: Database,
  organizationId: string,
  policy: (typeof DEFAULT_WARRANTY_POLICIES)[number],
) {
  const [existing] = await db
    .select({ id: warrantyPolicies.id })
    .from(warrantyPolicies)
    .where(
      and(
        eq(warrantyPolicies.organizationId, organizationId),
        sql`lower(${warrantyPolicies.name}) = lower(${policy.name})`,
      ),
    )
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(warrantyPolicies).values({
    organizationId,
    name: policy.name,
    description: policy.description,
    durationMonths: policy.durationMonths,
    isActive: true,
  });
}

/** Uses a non-RLS database connection; pass RAW_DATABASE from Nest. */
export async function provisionOrgInventory(
  db: Database,
  organizationId: string,
) {
  for (const name of DEFAULT_PRODUCT_CATEGORIES) {
    await ensureProductCategory(db, organizationId, name);
  }

  for (const name of DEFAULT_PRODUCT_TAGS) {
    await ensureProductTag(db, organizationId, name);
  }

  for (const policy of DEFAULT_WARRANTY_POLICIES) {
    await ensureWarrantyPolicy(db, organizationId, policy);
  }
}
