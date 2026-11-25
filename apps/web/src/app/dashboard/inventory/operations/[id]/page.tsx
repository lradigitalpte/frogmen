"use client";

import { use } from "react";
import { ViewProductPage } from "@/components/products/view-product-page";

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ViewProductPage productId={id} />;
}
