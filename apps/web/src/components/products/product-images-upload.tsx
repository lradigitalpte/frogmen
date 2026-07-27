"use client";

import {
  BlockStack,
  Button,
  DropZone,
  InlineGrid,
  InlineStack,
  Spinner,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { getProductImageUrl } from "@/lib/product-images";
import {
  removeProductImage,
  uploadProductImage,
} from "@/lib/products-api";

interface ProductImagesUploadProps {
  productId?: string;
  images: string[];
  pendingFiles?: File[];
  disabled?: boolean;
  onImagesChange?: (images: string[]) => void;
  onPendingFilesChange?: (files: File[]) => void;
}

export function ProductImagesUpload({
  productId,
  images,
  pendingFiles = [],
  disabled,
  onImagesChange,
  onPendingFilesChange,
}: ProductImagesUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urls = pendingFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pendingFiles]);

  const handleDrop = useCallback(
    async (_dropFiles: File[], acceptedFiles: File[]) => {
      if (!acceptedFiles.length || disabled || uploading) {
        return;
      }

      setError(null);

      if (productId) {
        setUploading(true);

        try {
          let nextImages = [...images];

          for (const file of acceptedFiles) {
            const product = await uploadProductImage(productId, file);
            nextImages = product.images ?? nextImages;
          }

          onImagesChange?.(nextImages);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to upload images",
          );
        } finally {
          setUploading(false);
        }

        return;
      }

      onPendingFilesChange?.([...pendingFiles, ...acceptedFiles]);
    },
    [
      disabled,
      images,
      onImagesChange,
      onPendingFilesChange,
      pendingFiles,
      productId,
      uploading,
    ],
  );

  async function handleRemoveStored(imagePath: string) {
    if (!productId) return;

    const product = await removeProductImage(productId, imagePath);
    onImagesChange?.(product.images ?? []);
  }

  function handleRemovePending(index: number) {
    onPendingFilesChange?.(pendingFiles.filter((_, i) => i !== index));
  }

  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
        {images.map((imagePath) => (
          <BlockStack gap="200" key={imagePath}>
            <Thumbnail
              alt="Product"
              size="large"
              source={getProductImageUrl(imagePath) ?? ""}
            />
            {productId ? (
              <Button
                disabled={disabled}
                size="slim"
                tone="critical"
                variant="plain"
                onClick={() => handleRemoveStored(imagePath)}
              >
                Remove
              </Button>
            ) : null}
          </BlockStack>
        ))}

        {previewUrls.map((url, index) => (
          <BlockStack gap="200" key={url}>
            <Thumbnail alt="Pending product" size="large" source={url} />
            <Button
              disabled={disabled}
              size="slim"
              tone="critical"
              variant="plain"
              onClick={() => handleRemovePending(index)}
            >
              Remove
            </Button>
          </BlockStack>
        ))}
      </InlineGrid>

      <DropZone
        accept="image/*"
        disabled={disabled || uploading}
        type="image"
        onDrop={handleDrop}
      >
        {uploading ? (
          <InlineStack align="center" blockAlign="center" gap="200">
            <Spinner size="small" />
            <Text as="span" tone="subdued">
              Uploading images...
            </Text>
          </InlineStack>
        ) : (
          <DropZone.FileUpload
            actionHint="Accepts .jpg, .png, .webp up to 5 MB each"
            actionTitle="Add images"
          />
        )}
      </DropZone>

      {!productId ? (
        <Text as="p" tone="subdued" variant="bodySm">
          Images upload after you save the product.
        </Text>
      ) : null}

      {error ? (
        <Text as="p" tone="critical" variant="bodySm">
          {error}
        </Text>
      ) : null}
    </BlockStack>
  );
}
