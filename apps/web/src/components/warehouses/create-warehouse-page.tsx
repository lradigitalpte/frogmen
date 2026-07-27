"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, BlockStack } from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import {
  WarehouseForm,
  emptyWarehouseForm,
  formValuesToInput,
} from "@/components/warehouses/warehouse-form";
import { createWarehouse } from "@/lib/warehouses-api";

export function CreateWarehousePage() {
  const router = useRouter();
  const [values, setValues] = useState(emptyWarehouseForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!values.name.trim() || !values.code.trim()) {
      setError("Name and code are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const warehouse = await createWarehouse(formValuesToInput(values));
      router.push(`/dashboard/inventory/warehouses/${warehouse.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create warehouse",
      );
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{
        content: "Warehouses",
        url: "/dashboard/inventory/warehouses",
      }}
      primaryAction={{
        content: "Save",
        loading: saving,
        onAction: handleSave,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => router.push("/dashboard/inventory/warehouses"),
        },
      ]}
      subtitle="Add a storage location for your inventory."
      title="Create warehouse"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <WarehouseForm values={values} onChange={setValues} />
      </BlockStack>
    </AppPage>
  );
}
