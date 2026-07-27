"use client";

import { BlockStack, Box, Button, InlineStack, Text } from "@shopify/polaris";
import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { getProductImageUrl } from "@/lib/product-images";

interface ProductImageGalleryProps {
  images: string[];
  productName: string;
  editUrl?: string;
}

export function ProductImageGallery({
  images,
  productName,
  editUrl,
}: ProductImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resolvedImages = images
    .map((path) => ({ path, url: getProductImageUrl(path) }))
    .filter((item): item is { path: string; url: string } => Boolean(item.url));

  if (resolvedImages.length === 0) {
    return (
      <Box
        background="bg-surface-secondary"
        borderColor="border"
        borderRadius="300"
        borderStyle="dashed"
        borderWidth="025"
        padding="800"
      >
        <BlockStack align="center" gap="300" inlineAlign="center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ImageIcon aria-hidden size={32} />
          </div>
          <BlockStack gap="100" inlineAlign="center">
            <Text as="p" fontWeight="semibold" variant="bodyMd">
              No product photos yet
            </Text>
            <Text as="p" alignment="center" tone="subdued">
              Add images so your team can quickly identify this item in stock and
              on orders.
            </Text>
          </BlockStack>
          {editUrl ? (
            <Button url={editUrl}>Upload photos</Button>
          ) : null}
        </BlockStack>
      </Box>
    );
  }

  const active = resolvedImages[selectedIndex] ?? resolvedImages[0];

  return (
    <BlockStack gap="300">
      <Box
        background="bg-surface-secondary"
        borderColor="border"
        borderRadius="300"
        borderWidth="025"
        overflowX="hidden"
        overflowY="hidden"
      >
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/30 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={productName}
            className="max-h-full max-w-full object-contain"
            src={active.url}
          />
        </div>
      </Box>

      {resolvedImages.length > 1 ? (
        <InlineStack gap="200" wrap>
          {resolvedImages.map((image, index) => (
            <button
              key={image.path}
              aria-label={`View image ${index + 1}`}
              className={`overflow-hidden rounded-lg border-2 bg-muted/20 p-0.5 transition ${
                index === selectedIndex
                  ? "border-primary"
                  : "border-transparent hover:border-border"
              }`}
              type="button"
              onClick={() => setSelectedIndex(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="h-16 w-16 object-cover"
                src={image.url}
              />
            </button>
          ))}
        </InlineStack>
      ) : null}
    </BlockStack>
  );
}
