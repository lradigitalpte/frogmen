"use client";

import { Suspense } from "react";
import { CreateProductPage } from "@/components/products/create-product-page";

export default function NewProductPage() {
  return (
    <Suspense>
      <CreateProductPage />
    </Suspense>
  );
}
