"use client";

import { Banner, BlockStack, Modal, Text } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { productArea } from "@/lib/product-areas";
import { buildClassificationTags, mergeProductTags, splitCustomTags } from "@/lib/product-tags";
import { getProduct, updateProduct } from "@/lib/products-api";
import type { Product, ProductUsageType } from "@/types/product";

export function otherUsageType(product: Product): ProductUsageType {
  return product.usageType === "operations" ? "for_sale" : "operations";
}

function moveOne(product: Product, usageType: ProductUsageType) {
  return updateProduct(product.id, {
    usageType,
    tags: mergeProductTags(splitCustomTags(product.tags ?? []), buildClassificationTags({ ...product, usageType })),
  });
}

/** Moves a product (and its sub-products) between the for-sale and operational pages. */
export function MoveProductModal({
  product,
  onClose,
  onMoved,
}: {
  product: Product | null;
  onClose: () => void;
  onMoved: (product: Product) => void;
}) {
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [product]);

  const target = product ? otherUsageType(product) : "operations";
  const label = productArea(target).label;

  async function handleMove() {
    if (!product) return;
    setMoving(true);
    setError(null);
    try {
      const detail = await getProduct(product.id);
      // The parent goes last, so a failure part-way can simply be retried.
      for (const sub of detail.subProducts) {
        if (sub.usageType !== target) await moveOne(sub, target);
      }
      await moveOne(detail, target);
      onMoved(product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't move the product");
    } finally {
      setMoving(false);
    }
  }

  return (
    <Modal
      open={Boolean(product)}
      primaryAction={{
        content: "Move product",
        destructive: target === "operations",
        loading: moving,
        onAction: () => void handleMove(),
      }}
      secondaryActions={[{ content: "Cancel", disabled: moving, onAction: onClose }]}
      title={`Move ${product?.name ?? "product"} to ${label}?`}
      onClose={() => {
        if (!moving) onClose();
      }}
    >
      <Modal.Section>
        <BlockStack gap="300">
          {error ? <Banner tone="critical">{error}</Banner> : null}
          <Text as="p">
            {target === "operations"
              ? "The selling price will be removed and it won't appear on new quotations or invoices. Existing documents aren't changed."
              : "It will be available on new quotations and invoices. Set a selling price after moving it."}
          </Text>
          <Text as="p" tone="subdued">
            Its sub-products move with it. Stock, serials and history stay as they are.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
