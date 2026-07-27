"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, BlockStack } from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import {
  WarehouseForm,
  formValuesToInput,
  warehouseToFormValues,
} from "@/components/warehouses/warehouse-form";
import { getWarehouse, updateWarehouse } from "@/lib/warehouses-api";

interface EditWarehousePageProps {
  warehouseId: string;
}

export function EditWarehousePage({ warehouseId }: EditWarehousePageProps) {
  const router = useRouter();
  const [values, setValues] = useState(warehouseToFormValues({
    id: "",
    organizationId: "",
    name: "",
    code: "",
    street1: null,
    city: null,
    zip: null,
    countryCode: null,
    isActive: true,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getWarehouse(warehouseId)
      .then((warehouse) => setValues(warehouseToFormValues(warehouse)))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Warehouse not found"),
      )
      .finally(() => setLoading(false));
  }, [warehouseId]);

  async function handleSave() {
    if (!values.name.trim() || !values.code.trim()) {
      setError("Name and code are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateWarehouse(warehouseId, formValuesToInput(values));
      router.push(`/dashboard/inventory/warehouses/${warehouseId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update warehouse",
      );
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{
        content: "Warehouse",
        url: `/dashboard/inventory/warehouses/${warehouseId}`,
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
            router.push(`/dashboard/inventory/warehouses/${warehouseId}`),
        },
      ]}
      subtitle="Update warehouse details."
      title="Edit warehouse"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <WarehouseForm disabled={loading} values={values} onChange={setValues} />
      </BlockStack>
    </AppPage>
  );
}
