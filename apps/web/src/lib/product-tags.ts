import type { ProductEquipmentRole, ProductType, ProductUsageType } from "@/types/product";

const CLASSIFICATION_TAG_LABELS = new Set(
  [
    "goods",
    "service",
    "for sale",
    "operations",
    "rov",
    "main equipment",
    "component",
    "serialized",
  ].map((tag) => tag.toLowerCase()),
);

export function buildClassificationTags(input: {
  type: ProductType;
  usageType: ProductUsageType;
  isRovEquipment: boolean;
  equipmentRole: ProductEquipmentRole;
  trackSerial: boolean;
}): string[] {
  const tags = [
    input.type === "goods" ? "Goods" : "Service",
    input.usageType === "for_sale" ? "For sale" : "Operations",
  ];

  if (input.isRovEquipment) {
    tags.push("ROV");
  }

  if (input.equipmentRole === "main_equipment") {
    tags.push("Main equipment");
  } else if (input.equipmentRole === "component") {
    tags.push("Component");
  }

  if (input.trackSerial) {
    tags.push("Serialized");
  }

  return tags;
}

export function mergeProductTags(
  customTags: string[],
  classificationTags: string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const tag of [...classificationTags, ...customTags]) {
    const normalized = tag.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(normalized);
  }

  return merged;
}

export function splitCustomTags(tags: string[]): string[] {
  return tags.filter((tag) => !CLASSIFICATION_TAG_LABELS.has(tag.trim().toLowerCase()));
}

export function normalizeTagInput(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getProductDisplayTags(product: {
  tags?: string[];
  type: ProductType;
  usageType: ProductUsageType;
  isRovEquipment: boolean;
  equipmentRole: ProductEquipmentRole;
  trackSerial: boolean;
}): string[] {
  if (product.tags?.length) {
    return product.tags;
  }

  return buildClassificationTags({
    type: product.type,
    usageType: product.usageType,
    isRovEquipment: product.isRovEquipment,
    equipmentRole: product.equipmentRole,
    trackSerial: product.trackSerial,
  });
}
