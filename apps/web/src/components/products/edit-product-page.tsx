"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, BlockStack } from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import {
  ProductForm,
  formValuesToInput,
  productToFormValues,
} from "@/components/products/product-form";
import { getProduct, listProducts, updateProduct } from "@/lib/products-api";

interface EditProductPageProps {
  productId: string;
}

export function EditProductPage({ productId }: EditProductPageProps) {
  const router = useRouter();
  const [values, setValues] = useState(productToFormValues({
    id: "",
    organizationId: "",
    parentId: null,
    equipmentRole: "general",
    usageType: "for_sale",
    isRovEquipment: false,
    type: "goods",
    name: "",
    sku: null,
    barcode: null,
    description: null,
    images: [],
    costPrice: "0",
    sellingPrice: "0",
    priceCurrencyId: null,
    isStorable: true,
    trackSerial: false,
    weight: null,
    volume: null,
    isActive: true,
    tags: [],
    categoryId: null,
    defaultWarrantyPolicyId: null,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
  }));
  const [images, setImages] = useState<string[]>([]);
  const [parentOptions, setParentOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [originalUsageType, setOriginalUsageType] = useState<
    "for_sale" | "operations"
  >("for_sale");

  useEffect(() => {
    Promise.all([
      getProduct(productId),
      listProducts({ type: "goods", rootOnly: true, perPage: 100 }),
    ])
      .then(([product, parents]) => {
        setValues(productToFormValues(product));
        setOriginalUsageType(product.usageType ?? "for_sale");
        setImages(product.images ?? []);
        setParentOptions(
          parents.data
            .filter((item) => item.id !== productId)
            .map((item) => ({
              label: item.name,
              value: item.id,
              description: item.sku ? `SKU ${item.sku}` : undefined,
            })),
        );
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Product not found"),
      )
      .finally(() => setLoading(false));
  }, [productId]);

  async function handleSave() {
    if (!values.name.trim()) {
      setError("Name is required");
      return;
    }

    if (
      originalUsageType === "for_sale" &&
      values.usageType === "operations" &&
      values.sellingPrice &&
      values.sellingPrice !== "0"
    ) {
      const confirmed = window.confirm(
        "Switching to Operations will remove the selling price. This product will no longer appear in sales. Continue?",
      );
      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      await updateProduct(productId, formValuesToInput(values));
      router.push(`/dashboard/inventory/products/${productId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product");
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{
        content: "Product",
        url: `/dashboard/inventory/products/${productId}`,
      }}
      primaryAction={{
        content: "Save",
        loading: saving,
        onAction: handleSave,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () =>
            router.push(`/dashboard/inventory/products/${productId}`),
        },
      ]}
      subtitle="Update product details."
      title="Edit product"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <ProductForm
          disabled={loading}
          images={images}
          parentOptions={parentOptions}
          productId={productId}
          values={values}
          onChange={setValues}
          onImagesChange={setImages}
        />
      </BlockStack>
    </AppPage>
  );
}
