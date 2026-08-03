"use client";

import { Thumbnail } from "@shopify/polaris";
import { ImageIcon } from "lucide-react";
import { getProductImageUrl } from "@/lib/product-images";

interface ProductListThumbnailProps {
  imagePath?: string | null;
  alt?: string;
  size?: "small" | "medium" | "large";
}

export function ProductListThumbnail({
  imagePath,
  alt = "Product",
  size = "small",
}: ProductListThumbnailProps) {
  const url = getProductImageUrl(imagePath);

  if (!url) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <ImageIcon aria-hidden size={16} />
      </div>
    );
  }

  return <Thumbnail alt={alt} size={size} source={url} />;
}
