"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppPage } from "@/components/layout/page";
import { CustomerForm } from "@/components/customers/customer-form";
import {
  createCustomer,
  uploadCustomerAvatar,
} from "@/lib/customers-api";
import {
  customerFormSchema,
  emptyCustomerForm,
  formValuesToInput,
  formatZodError,
  getZodFieldErrors,
} from "@/types/customer";
import { Banner, BlockStack } from "@shopify/polaris";
import { useToast } from "@/components/providers/toast-provider";

export function CreateCustomerPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [values, setValues] = useState(emptyCustomerForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setFieldErrors({});

    const parsed = customerFormSchema.safeParse(values);

    if (!parsed.success) {
      setFieldErrors(getZodFieldErrors(parsed.error));
      setError(formatZodError(parsed.error));
      return;
    }

    setSaving(true);

    try {
      const customer = await createCustomer(formValuesToInput(parsed.data));

      if (pendingAvatar) {
        await uploadCustomerAvatar(customer.id, pendingAvatar);
      }

      showSuccess(`${customer.name} created`);
      router.push(`/dashboard/customers/${customer.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create customer";
      setError(message);
      showError(message);
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Customers", url: "/dashboard/customers" }}
      primaryAction={{
        content: "Save",
        loading: saving,
        onAction: handleSave,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => router.push("/dashboard/customers"),
        },
      ]}
      subtitle="Add a new contact or company to your organization."
      title="Create contact"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <CustomerForm
          errors={fieldErrors}
          pendingAvatar={pendingAvatar}
          values={values}
          onChange={setValues}
          onPendingAvatarChange={setPendingAvatar}
        />
      </BlockStack>
    </AppPage>
  );
}
