"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, BlockStack } from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  ProductForm,
  emptyProductForm,
  formValuesToInput,
} from "@/components/products/product-form";
import { productSerialsAreValid } from "@/components/products/product-serial-entry";
import {
  createProduct,
  listProducts,
  uploadProductImage,
} from "@/lib/products-api";
import { getCompanySettings } from "@/lib/settings-api";
import { listWarehouses } from "@/lib/warehouses-api";

export function CreateProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentId = searchParams.get("parentId") ?? "";
  const { defaultPricingCurrencyId } = useOrgCurrency();
  const [values, setValues] = useState(emptyProductForm("goods", parentId));
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [parentOptions, setParentOptions] = useState<
    Array<{ label: string; value: string; description?: string }>
  >([]);
  const [warehouseOptions, setWarehouseOptions] = useState<
    Array<{ label: string; value: string; description?: string }>
  >([]);
  const [lockedParentLabel, setLockedParentLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!defaultPricingCurrencyId || values.priceCurrencyId) {
      return;
    }

    setValues((current) => ({
      ...current,
      priceCurrencyId: defaultPricingCurrencyId,
    }));
  }, [defaultPricingCurrencyId, values.priceCurrencyId]);

  useEffect(() => {
    void Promise.all([
      listProducts({ type: "goods", rootOnly: true, perPage: 100 }),
      listWarehouses({ perPage: 100 }),
      getCompanySettings().catch(() => null),
    ])
      .then(([productsResult, warehousesResult, company]) => {
        setParentOptions(
          productsResult.data.map((product) => ({
            label: product.name,
            value: product.id,
            description: product.sku ? `SKU ${product.sku}` : undefined,
          })),
        );

        const warehouses = warehousesResult.data.map((warehouse) => ({
          label: warehouse.name,
          value: warehouse.id,
          description: warehouse.code,
        }));
        setWarehouseOptions(warehouses);

        const defaultWarehouseId =
          company?.defaultWarehouseId ?? warehousesResult.data[0]?.id ?? "";

        setValues((current) => ({
          ...current,
          initialWarehouseId: current.initialWarehouseId || defaultWarehouseId,
        }));

        if (parentId) {
          const parent = productsResult.data.find(
            (product) => product.id === parentId,
          );
          if (parent) {
            setLockedParentLabel(
              parent.sku
                ? `${parent.name} · SKU ${parent.sku}`
                : parent.name,
            );
          }
        }
      })
      .catch(() => {
        setParentOptions([]);
        setWarehouseOptions([]);
      });
  }, [parentId]);

  async function handleSave() {
    if (!values.name.trim()) {
      setError("Name is required");
      return;
    }

    if (
      values.trackSerial &&
      values.initialSerials.some((serial) => serial.trim()) &&
      !productSerialsAreValid(values.initialSerials)
    ) {
      setError("Enter unique serial numbers or remove duplicates.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const product = await createProduct(
        formValuesToInput(values, { includeInitialStock: true }),
      );

      for (const file of pendingImages) {
        await uploadProductImage(product.id, file);
      }

      router.push(`/dashboard/inventory/products/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{
        content: "Products",
        url: parentId
          ? `/dashboard/inventory/products/${parentId}`
          : "/dashboard/inventory/products",
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
            router.push(
              parentId
                ? `/dashboard/inventory/products/${parentId}`
                : "/dashboard/inventory/products",
            ),
        },
      ]}
      subtitle={
        parentId
          ? "Add a sub-product linked to the parent."
          : "Add a goods or service product."
      }
      title="Create product"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <ProductForm
          lockParent={Boolean(parentId)}
          lockedParentLabel={lockedParentLabel}
          parentOptions={parentOptions}
          pendingImages={pendingImages}
          values={values}
          warehouseOptions={warehouseOptions}
          onChange={setValues}
          onPendingImagesChange={setPendingImages}
        />
      </BlockStack>
    </AppPage>
  );
}
