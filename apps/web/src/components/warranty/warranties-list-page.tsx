"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { listWarranties, type WarrantyRegistration } from "@/lib/warranty-api";

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function statusTone(
  status: WarrantyRegistration["status"],
): "success" | "warning" | "critical" | "info" {
  if (status === "active") return "success";
  if (status === "expired") return "critical";
  return "info";
}

function daysLeftLabel(daysLeft: number, status: WarrantyRegistration["status"]) {
  if (status === "voided") return "Voided";
  if (status === "expired" || daysLeft < 0) {
    return `${Math.abs(daysLeft)} days ago`;
  }
  if (daysLeft === 0) return "Expires today";
  return `${daysLeft} days left`;
}

export function WarrantiesListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [warranties, setWarranties] = useState<WarrantyRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadWarranties = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listWarranties({
        search: debouncedSearch || undefined,
        status:
          statusFilter === "all"
            ? undefined
            : (statusFilter as "active" | "expired" | "voided"),
        expiringSoon: expiringSoon || undefined,
        perPage: 200,
      });
      setWarranties(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warranties");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, expiringSoon]);

  useEffect(() => {
    void loadWarranties();
  }, [loadWarranties]);

  const rowMarkup = useMemo(
    () =>
      warranties.map((warranty, index) => (
        <IndexTable.Row
          id={warranty.id}
          key={warranty.id}
          onClick={() => router.push(`/dashboard/warranty/${warranty.id}`)}
          position={index}
        >
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text as="span" fontWeight="semibold">
                {warranty.displayProductName}
              </Text>
              {warranty.serialNumber ? (
                <Text as="span" tone="subdued" variant="bodySm">
                  SN: {warranty.serialNumber}
                </Text>
              ) : null}
            </BlockStack>
          </IndexTable.Cell>
          <IndexTable.Cell>{warranty.displayCustomerName}</IndexTable.Cell>
          <IndexTable.Cell>{warranty.policy?.name ?? " "}</IndexTable.Cell>
          <IndexTable.Cell>{formatDate(warranty.soldAt)}</IndexTable.Cell>
          <IndexTable.Cell>{formatDate(warranty.endsAt)}</IndexTable.Cell>
          <IndexTable.Cell>
            {daysLeftLabel(warranty.daysLeft, warranty.status)}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone={statusTone(warranty.status)}>
              {warranty.status}
            </Badge>
          </IndexTable.Cell>
        </IndexTable.Row>
      )),
    [router, warranties],
  );

  return (
    <AppPage
      fullWidth
      primaryAction={{
        content: "Register warranty",
        onAction: () => router.push("/dashboard/warranty/new"),
      }}
      secondaryActions={[
        {
          content: "Policies",
          onAction: () => router.push("/dashboard/warranty/policies"),
        },
      ]}
      subtitle="Track products under warranty and time remaining."
      title="Warranty"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <InlineStack gap="300" wrap>
              <div style={{ flex: 1, minWidth: 220 }}>
                <TextField
                  autoComplete="off"
                  label="Search"
                  labelHidden
                  onChange={setSearch}
                  placeholder="Search product, serial, customer, policy"
                  value={search}
                />
              </div>
              <Select
                label="Status"
                labelHidden
                onChange={setStatusFilter}
                options={[
                  { label: "Active", value: "active" },
                  { label: "Expired", value: "expired" },
                  { label: "All", value: "all" },
                ]}
                value={statusFilter}
              />
              <Button
                onClick={() => setExpiringSoon((value) => !value)}
                pressed={expiringSoon}
              >
                Expiring in 30 days
              </Button>
            </InlineStack>

            {loading ? (
              <Text as="p" tone="subdued">
                Loading warranties…
              </Text>
            ) : warranties.length === 0 ? (
              <EmptyState
                heading="No warranties found"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
              >
                <p>
                  Warranties are created when invoices post, or you can register
                  coverage for past sales.
                </p>
              </EmptyState>
            ) : (
              <IndexTable
                headings={[
                  { title: "Product" },
                  { title: "Customer" },
                  { title: "Policy" },
                  { title: "Sold" },
                  { title: "Ends" },
                  { title: "Time left" },
                  { title: "Status" },
                ]}
                itemCount={warranties.length}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </AppPage>
  );
}
