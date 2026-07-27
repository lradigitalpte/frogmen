"use client";

import { Banner, BlockStack, SkeletonBodyText } from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  CustomerForm,
  customerToFormValues,
} from "@/components/customers/customer-form";
import { getCustomer, updateCustomer } from "@/lib/customers-api";
import {
  customerFormSchema,
  formValuesToInput,
  formatZodError,
  getZodFieldErrors,
  type CustomerFormValues,
} from "@/types/customer";

interface EditCustomerPageProps {
  customerId: string;
}

export function EditCustomerPage({ customerId }: EditCustomerPageProps) {
  const router = useRouter();
  const [values, setValues] = useState<CustomerFormValues | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCustomer(customerId)
      .then((customer) => {
        setValues(customerToFormValues(customer));
        setAvatarPath(customer.avatarPath);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Customer not found"),
      );
  }, [customerId]);

  async function handleSave() {
    if (!values) return;

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
      await updateCustomer(customerId, formValuesToInput(parsed.data));
      router.push(`/dashboard/customers/${customerId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update customer");
      setSaving(false);
    }
  }

  if (!values && !error) {
    return (
      <AppPage title="Edit customer">
        <BlockStack gap="400">
          <SkeletonBodyText lines={8} />
        </BlockStack>
      </AppPage>
    );
  }

  return (
    <AppPage
      backAction={{
        content: values?.name ?? "Customer",
        url: `/dashboard/customers/${customerId}`,
      }}
      primaryAction={{
        content: "Save",
        loading: saving,
        onAction: handleSave,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => router.push(`/dashboard/customers/${customerId}`),
        },
      ]}
      subtitle="Update contact details, photo, and address."
      title="Edit contact"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {values ? (
          <CustomerForm
            avatarPath={avatarPath}
            customerId={customerId}
            errors={fieldErrors}
            values={values}
            onAvatarUploaded={setAvatarPath}
            onChange={setValues}
          />
        ) : null}
      </BlockStack>
    </AppPage>
  );
}
