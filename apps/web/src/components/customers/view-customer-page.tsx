"use client";

import {
  Badge,
  BlockStack,
  Button,
  Card,
  Divider,
  Grid,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCountryName, getStateName } from "@frog1/shared";
import {
  archiveCustomer,
  getCustomer,
  getCustomerActivity,
  type CustomerActivity,
} from "@/lib/customers-api";
import type { Customer } from "@/types/customer";
import { AppPage } from "@/components/layout/page";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { useToast } from "@/components/providers/toast-provider";

interface ViewCustomerPageProps {
  id?: string;
  customerId?: string;
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatAddressLines(customer: Customer): string[] {
  const lines: string[] = [];

  if (customer.street1) lines.push(customer.street1);
  if (customer.street2) lines.push(customer.street2);

  const cityLine = [
    customer.city,
    getStateName(customer.countryCode, customer.stateCode) ?? customer.stateCode,
    customer.zip,
  ]
    .filter(Boolean)
    .join(", ");

  if (cityLine) lines.push(cityLine);

  const country = getCountryName(customer.countryCode);
  if (country) lines.push(country);

  return lines;
}

export function ViewCustomerPage({ id, customerId }: ViewCustomerPageProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activity, setActivity] = useState<CustomerActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const activeId = customerId || id || "";

  useEffect(() => {
    async function load() {
      try {
        const [data, customerActivity] = await Promise.all([
          getCustomer(activeId),
          getCustomerActivity(activeId),
        ]);
        setCustomer(data);
        setActivity(customerActivity);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load customer");
      } finally {
        setLoading(false);
      }
    }
    if (activeId) {
      load();
    }
  }, [activeId]);

  if (loading) {
    return (
      <AppPage title="Customer Profile">
        <Text as="p">Loading customer profile...</Text>
      </AppPage>
    );
  }

  if (error || !customer) {
    return (
      <AppPage title="Customer Profile">
        <Text as="p" tone="critical">
          {error || "Customer not found"}
        </Text>
      </AppPage>
    );
  }

  const addressLines = formatAddressLines(customer);

  async function handleArchive() {
    setArchiving(true);
    try {
      await archiveCustomer(customer!.id);
      showSuccess(`${customer!.name} archived`);
      router.push("/dashboard/customers");
      router.refresh();
    } catch (archiveError) {
      showError(
        archiveError instanceof Error
          ? archiveError.message
          : "Could not archive customer",
      );
      setArchiving(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Customers", url: "/dashboard/customers" }}
      primaryAction={{
        content: "Edit Customer",
        onAction: () => router.push(`/dashboard/customers/${activeId}/edit`),
      }}
      secondaryActions={[
        {
          content: "+ Create Quotation for Customer",
          onAction: () => router.push("/dashboard/sales/quotations/new"),
        },
      ]}
      subtitle={`Customer Account #${customer.id}   ERP 360 Degree Profile`}
      title={customer.name}
    >
      <BlockStack gap="500">
        {/* Executive Profile Card Header */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="400" blockAlign="center">
                <CustomerAvatar
                  avatarPath={customer.avatarPath}
                  name={customer.name}
                  size="xl"
                />
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h1" variant="headingLg">
                      {customer.name}
                    </Text>
                    <Badge tone={customer.accountType === "company" ? "info" : "success"}>
                      {customer.accountType === "company" ? "Corporate Company" : "Individual"}
                    </Badge>
                    {!customer.isActive && <Badge tone="critical">Archived</Badge>}
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    {customer.reference ? `${customer.reference} • ` : ""}
                    Registered {new Date(customer.createdAt).toLocaleDateString()}
                  </Text>
                </BlockStack>
              </InlineStack>

              <InlineStack gap="200">
                <Button onClick={() => router.push(`/dashboard/customers/${activeId}/edit`)}>
                  Edit Account
                </Button>
                <Button tone="critical" onClick={() => setArchiveOpen(true)}>
                  Archive Customer
                </Button>
              </InlineStack>
            </InlineStack>

            <Divider />

            {/* Quick Contact & Credit Summary Grid */}
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued" variant="bodySm">Email Address</Text>
                  <Text as="span" fontWeight="semibold">{customer.email || " "}</Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued" variant="bodySm">Phone Number</Text>
                  <Text as="span" fontWeight="semibold">{customer.phone || customer.mobile || " "}</Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued" variant="bodySm">Account Reference</Text>
                  <Text as="span" fontWeight="semibold">{customer.reference || " "}</Text>
                </BlockStack>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Card>

        {/* ── Connected Sales Quotations & History ── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Recent sales and payment activity
                </Text>
                <Text as="p" tone="subdued">
                  Latest documents and receipts connected to {customer.name}
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button onClick={() => router.push(`/dashboard/customers/${activeId}/transactions`)}>
                  View all transactions
                </Button>
                <Button variant="primary" onClick={() => router.push("/dashboard/sales/quotations/new")}>
                  + New Quotation
                </Button>
              </InlineStack>
            </InlineStack>

            <Grid>
              {[
                {
                  title: "Quotations",
                  empty: "No quotations yet",
                  rows: (activity?.quotations ?? []).map((row) => ({
                    id: row.id,
                    title: row.number,
                    detail: `${row.state} · ${formatAmount(row.amount, row.currencyCode)}`,
                    date: row.date,
                    url: `/dashboard/sales/quotations/${row.id}`,
                  })),
                },
                {
                  title: "Invoices",
                  empty: "No invoices yet",
                  rows: (activity?.invoices ?? []).map((row) => ({
                    id: row.id,
                    title: row.number,
                    detail: `${row.paymentState} · ${formatAmount(row.amount, row.currencyCode)}`,
                    date: row.date,
                    url: `/dashboard/invoices/${row.id}`,
                  })),
                },
                {
                  title: "Payments",
                  empty: "No payments yet",
                  rows: (activity?.payments ?? []).map((row) => ({
                    id: row.id,
                    title: row.invoiceNumber,
                    detail: `${row.method?.replaceAll("_", " ") || "Payment"} · ${formatAmount(row.amount, row.currencyCode)}`,
                    date: row.date,
                    url: `/dashboard/invoices/${row.invoiceId}`,
                  })),
                },
              ].map((section) => (
                <Grid.Cell
                  key={section.title}
                  columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}
                >
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">{section.title}</Text>
                    {section.rows.length === 0 ? (
                      <Text as="p" tone="subdued">{section.empty}</Text>
                    ) : (
                      section.rows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className="w-full rounded-xl border border-border bg-white p-3 text-left transition hover:border-primary/40 hover:bg-muted/30 dark:bg-muted/10"
                          onClick={() => router.push(row.url)}
                        >
                          <InlineStack align="space-between" blockAlign="start">
                            <BlockStack gap="050">
                              <Text as="span" fontWeight="semibold">{row.title}</Text>
                              <Text as="span" tone="subdued" variant="bodySm">{row.detail}</Text>
                            </BlockStack>
                            <Text as="span" tone="subdued" variant="bodySm">{row.date}</Text>
                          </InlineStack>
                        </button>
                      ))
                    )}
                  </BlockStack>
                </Grid.Cell>
              ))}
            </Grid>
          </BlockStack>
        </Card>

        {/* Details & Addresses Grid */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Account & Tax Details
                </Text>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Tax ID / VAT:</Text>
                    <Text as="span" fontWeight="semibold">{customer.taxId || " "}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Job Title:</Text>
                    <Text as="span" fontWeight="semibold">{customer.jobTitle || " "}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Website:</Text>
                    <Text as="span" fontWeight="semibold">{customer.website || " "}</Text>
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
      <Modal
        open={archiveOpen}
        title={`Archive ${customer.name}?`}
        onClose={() => setArchiveOpen(false)}
        primaryAction={{
          content: "Archive customer",
          destructive: true,
          loading: archiving,
          onAction: () => void handleArchive(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: archiving,
            onAction: () => setArchiveOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p">
              This customer will be removed from active customer lists.
            </Text>
            <Text as="p" tone="subdued">
              Existing quotations, invoices, payments, and audit history will be
              preserved. You can restore the customer later from the Archived
              customers tab.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
