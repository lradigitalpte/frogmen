"use client";

import { use } from "react";
import { EditProductPage } from "@/components/products/edit-product-page";

export default function EditProductRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EditProductPage productId={id} />;
}
