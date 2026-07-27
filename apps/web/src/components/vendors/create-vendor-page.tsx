"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, BlockStack } from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";
import { VendorForm } from "@/components/vendors/vendor-form";
import { createVendor } from "@/lib/vendors-api";
import {
  emptyVendorForm,
  formatZodError,
  getZodFieldErrors,
  vendorFormSchema,
  vendorFormValuesToInput,
} from "@/types/vendor";
import { useToast } from "@/components/providers/toast-provider";

export function CreateVendorPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [values, setValues] = useState(emptyVendorForm("company"));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setFieldErrors({});
    const parsed = vendorFormSchema.safeParse(values);

    if (!parsed.success) {
      setFieldErrors(getZodFieldErrors(parsed.error));
      setError(formatZodError(parsed.error));
      return;
    }

    setSaving(true);

    try {
      const vendor = await createVendor(vendorFormValuesToInput(parsed.data));
      showSuccess(`${vendor.name} created`);
      router.push(`/dashboard/purchasing/vendors/${vendor.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create vendor";
      setError(message);
      showError(message);
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Vendors", url: "/dashboard/purchasing/vendors" }}
      primaryAction={{
        content: "Save vendor",
        loading: saving,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => router.push("/dashboard/purchasing/vendors"),
        },
      ]}
      subtitle="Add a supplier you can use on purchase orders and receipts."
      title="New vendor"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <VendorForm
          disabled={saving}
          errors={fieldErrors}
          values={values}
          onChange={setValues}
        />
      </BlockStack>
    </AppPage>
  );
}
