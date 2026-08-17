"use client";

import {
  Avatar,
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Divider,
  Grid,
  IndexTable,
  InlineStack,
  Link,
  Text,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPostalAddressLines } from "@frog1/shared";
import { AppPage } from "@/components/layout/page";
import { formatMoney } from "@/components/sales/format-money";
import {
  purchaseOrderStateLabel,
  purchaseOrderStateVariant,
  purchaseReceiptStatusLabel,
  purchaseReceiptStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { listPurchaseOrders, type PurchaseOrder } from "@/lib/purchase-orders-api";
import { getVendor, updateVendor } from "@/lib/vendors-api";
import type { Vendor } from "@/types/vendor";
import {
  formatZodError,
  getZodFieldErrors,
  vendorFormSchema,
  vendorFormValuesToInput,
  type VendorFormValues,
} from "@/types/vendor";
import { useToast } from "@/components/providers/toast-provider";
import { VendorForm } from "@/components/vendors/vendor-form";
import { getCustomerInitials } from "@/lib/avatar";

function vendorToForm(vendor: Vendor): VendorFormValues {
  return {
    accountType: vendor.accountType,
    name: vendor.name,
    email: vendor.email ?? "",
    phone: vendor.phone ?? "",
    mobile: vendor.mobile ?? "",
    website: vendor.website ?? "",
    taxId: vendor.taxId ?? "",
    reference: vendor.reference ?? "",
    contactName: vendor.contactName ?? "",
    street1: vendor.street1 ?? "",
    street2: vendor.street2 ?? "",
    city: vendor.city ?? "",
    zip: vendor.zip ?? "",
    countryCode: vendor.countryCode ?? "",
    stateCode: vendor.stateCode ?? "",
  };
}

export function EditVendorPage({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [values, setValues] = useState<VendorFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getVendor(vendorId)
      .then((vendor) => setValues(vendorToForm(vendor)))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load vendor"),
      );
  }, [vendorId]);

  async function handleSave() {
    if (!values) return;
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
      const vendor = await updateVendor(
        vendorId,
        vendorFormValuesToInput(parsed.data),
      );
      showSuccess(`${vendor.name} updated`);
      router.push(`/dashboard/purchasing/vendors/${vendor.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update vendor";
      setError(message);
      showError(message);
      setSaving(false);
    }
  }

  if (!values) {
    return (
      <AppPage title="Edit vendor" backAction={{ url: `/dashboard/purchasing/vendors/${vendorId}` }}>
        <Text as="p" tone="subdued">
          Loading…
        </Text>
      </AppPage>
    );
  }

  return (
    <AppPage
      title="Edit vendor"
      primaryAction={{
        content: "Save changes",
        onAction: () => void handleSave(),
        loading: saving,
      }}
      backAction={{
        content: "Vendor",
        url: `/dashboard/purchasing/vendors/${vendorId}`,
      }}
    >
      <BlockStack gap="400">
        {error ? <Banner tone="critical">{error}</Banner> : null}
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

function formatAddressLines(vendor: Vendor): string[] {
  return formatPostalAddressLines({
    street1: vendor.street1,
    street2: vendor.street2,
    city: vendor.city,
    stateCode: vendor.stateCode,
    zip: vendor.zip,
    countryCode: vendor.countryCode,
  });
}

function formatWebsite(url: string | null) {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function ViewVendorPage({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [vendorData, ordersResult] = await Promise.all([
          getVendor(vendorId),
          listPurchaseOrders({
            vendorId,
            perPage: 8,
            sortBy: "createdAt",
            sortDir: "desc",
          }),
        ]);
        setVendor(vendorData);
        setPurchaseOrders(ordersResult.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load vendor");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [vendorId]);

  if (loading) {
    return (
      <AppPage
        backAction={{ content: "Vendors", url: "/dashboard/purchasing/vendors" }}
        title="Vendor profile"
      >
        <Text as="p" tone="subdued">
          Loading vendor profile…
        </Text>
      </AppPage>
    );
  }

  if (error || !vendor) {
    return (
      <AppPage
        backAction={{ content: "Vendors", url: "/dashboard/purchasing/vendors" }}
        title="Vendor profile"
      >
        <Banner tone="critical">{error || "Vendor not found"}</Banner>
      </AppPage>
    );
  }

  const addressLines = formatAddressLines(vendor);
  const websiteUrl = formatWebsite(vendor.website);
  const isCompany = vendor.accountType === "company";
  const openPoCount = purchaseOrders.filter(
    (order) =>
      order.state === "confirmed" && order.receiptStatus !== "received",
  ).length;

  return (
    <AppPage
      backAction={{ content: "Vendors", url: "/dashboard/purchasing/vendors" }}
      primaryAction={{
        content: "Edit vendor",
        onAction: () =>
          router.push(`/dashboard/purchasing/vendors/${vendor.id}/edit`),
      }}
      secondaryActions={[
        {
          content: "New purchase order",
          onAction: () => router.push("/dashboard/purchasing/orders/new"),
        },
      ]}
      subtitle={`Supplier #${vendor.id.slice(0, 8)} • Added ${new Date(vendor.createdAt).toLocaleDateString()}`}
      title={vendor.name}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="400" blockAlign="center">
                <Avatar
                  accessibilityLabel={vendor.name}
                  initials={getCustomerInitials(vendor.name)}
                  name={vendor.name}
                  size="xl"
                />
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h1" variant="headingLg">
                      {vendor.name}
                    </Text>
                    <Badge tone={isCompany ? "info" : "success"}>
                      {isCompany ? "Company" : "Individual"}
                    </Badge>
                    {!vendor.isActive ? (
                      <Badge tone="critical">Archived</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    {vendor.reference ? `${vendor.reference} • ` : ""}
                    {isCompany && vendor.contactName
                      ? `Contact: ${vendor.contactName}`
                      : "Purchasing supplier"}
                  </Text>
                </BlockStack>
              </InlineStack>

              <Button
                onClick={() =>
                  router.push(`/dashboard/purchasing/vendors/${vendor.id}/edit`)
                }
              >
                Edit vendor
              </Button>
            </InlineStack>

            <Divider />

            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Email
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {vendor.email || " "}
                  </Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Phone
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {vendor.phone || " "}
                  </Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Mobile
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {vendor.mobile || " "}
                  </Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Open POs
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {openPoCount}
                  </Text>
                </BlockStack>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Purchase orders
                </Text>
                <Text as="p" tone="subdued">
                  Recent orders placed with {vendor.name}
                </Text>
              </BlockStack>
              <Button
                variant="primary"
                onClick={() => router.push("/dashboard/purchasing/orders/new")}
              >
                New purchase order
              </Button>
            </InlineStack>

            {purchaseOrders.length > 0 ? (
              <IndexTable
                headings={[
                  { title: "PO #" },
                  { title: "Date" },
                  { title: "Status" },
                  { title: "Receipt" },
                  { title: "Total", alignment: "end" },
                ]}
                itemCount={purchaseOrders.length}
                selectable={false}
              >
                {purchaseOrders.map((order, index) => (
                  <IndexTable.Row id={order.id} key={order.id} position={index}>
                    <IndexTable.Cell>
                      <Link
                        monochrome
                        url={`/dashboard/purchasing/orders/${order.id}`}
                      >
                        {order.number}
                      </Link>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {new Date(order.orderDate).toLocaleDateString()}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <StatusBadge variant={purchaseOrderStateVariant(order.state)}>
                        {purchaseOrderStateLabel(order.state)}
                      </StatusBadge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <StatusBadge
                        variant={purchaseReceiptStatusVariant(
                          order.receiptStatus,
                        )}
                      >
                        {purchaseReceiptStatusLabel(order.receiptStatus)}
                      </StatusBadge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" alignment="end">
                        {formatMoney(order.amountTotal, order.currencyCode)}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            ) : (
              <Text as="p" tone="subdued">
                No purchase orders yet. Create one to start buying from this
                vendor.
              </Text>
            )}
          </BlockStack>
        </Card>

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Tax & references
                </Text>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Tax ID / VAT
                    </Text>
                    <Text as="span" fontWeight="semibold">
                      {vendor.taxId || " "}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Internal reference
                    </Text>
                    <Text as="span" fontWeight="semibold">
                      {vendor.reference || " "}
                    </Text>
                  </InlineStack>
                  {isCompany ? (
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">
                        Primary contact
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {vendor.contactName || " "}
                      </Text>
                    </InlineStack>
                  ) : null}
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Website
                    </Text>
                    {websiteUrl ? (
                      <Link external url={websiteUrl}>
                        {vendor.website}
                      </Link>
                    ) : (
                      <Text as="span" fontWeight="semibold">
                        {" "}
                      </Text>
                    )}
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Address
                </Text>
                {addressLines.length > 0 ? (
                  <Text as="p" tone="subdued">
                    {addressLines.map((line, index) => (
                      <span key={line}>
                        {index > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </Text>
                ) : (
                  <Text as="p" tone="subdued">
                    No address on file
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </AppPage>
  );
}

