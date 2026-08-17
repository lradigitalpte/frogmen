"use client";

import { BlockStack, Link, Text } from "@shopify/polaris";
import {
  formatProductDetailsInline,
  productDetailsLines,
  type LineItemDetailsLayout,
} from "@frog1/shared";
import { useLineItemDetailsLayout } from "@/hooks/use-line-item-details-layout";

interface LineItemDescriptionProps {
  title: string;
  details?: string | null;
  boldTitle?: boolean;
  layout?: LineItemDetailsLayout;
  productId?: string | null;
}

export function LineItemDescription({
  title,
  details,
  boldTitle = true,
  layout: layoutOverride,
  productId,
}: LineItemDescriptionProps) {
  const layout = useLineItemDetailsLayout(layoutOverride);
  const items = productDetailsLines(title, details);
  const inlineDetails = formatProductDetailsInline(title, details);
  const showTitle = Boolean(title.trim());
  const productUrl = productId
    ? `/dashboard/inventory/products/${productId}`
    : null;

  if (!showTitle && items.length === 0) {
    return null;
  }

  const titleNode = productUrl ? (
    <Link url={productUrl}>{title}</Link>
  ) : (
    title
  );

  return (
    <BlockStack gap="050">
      {showTitle ? (
        <Text as="span" fontWeight={boldTitle ? "bold" : "regular"}>
          {titleNode}
        </Text>
      ) : null}
      {items.length === 0 ? null : layout === "comma" && inlineDetails ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {inlineDetails}
        </Text>
      ) : (
        <ul className="line-item-details">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </BlockStack>
  );
}
