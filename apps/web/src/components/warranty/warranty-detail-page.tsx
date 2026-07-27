"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Card,
  InlineGrid,
  Link,
  Text,
} from "@shopify/polaris";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { getWarranty, type WarrantyRegistration } from "@/lib/warranty-api";

interface WarrantyDetailPageProps {
  warrantyId: string;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <BlockStack gap="050">
      <Text as="span" tone="subdued" variant="bodySm">
        {label}
      </Text>
      <Text as="span" fontWeight="medium">
        {value}
      </Text>
    </BlockStack>
  );
}

export function WarrantyDetailPage({ warrantyId }: WarrantyDetailPageProps) {
  const [warranty, setWarranty] = useState<WarrantyRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWarranty = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getWarranty(warrantyId);
      setWarranty(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warranty");
    } finally {
      setLoading(false);
    }
  }, [warrantyId]);

  useEffect(() => {
    void loadWarranty();
  }, [loadWarranty]);

  if (loading) {
    return (
      <AppPage
        backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
        title="Warranty"
      >
        <Text as="p" tone="subdued">
          Loading warranty…
        </Text>
      </AppPage>
    );
  }

  if (!warranty || error) {
    return (
      <AppPage
        backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
        title="Warranty"
      >
        <Banner tone="critical">{error ?? "Warranty not found"}</Banner>
      </AppPage>
    );
  }

  const daysLabel =
    warranty.status === "expired"
      ? `Expired ${Math.abs(warranty.daysLeft)} days ago`
      : warranty.daysLeft === 0
        ? "Expires today"
        : `${warranty.daysLeft} days left`;

  return (
    <AppPage
      backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
      fullWidth
      subtitle={warranty.policy?.name ?? "Warranty coverage"}
      title={warranty.displayProductName}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              <DetailRow
                label="Status"
                value={
                  <Badge
                    tone={
                      warranty.status === "active"
                        ? "success"
                        : warranty.status === "expired"
                          ? "critical"
                          : "info"
                    }
                  >
                    {warranty.status}
                  </Badge>
                }
              />
              <DetailRow label="Time left" value={daysLabel} />
              <DetailRow label="Source" value={warranty.source} />
            </InlineGrid>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <DetailRow label="Customer" value={warranty.displayCustomerName} />
              <DetailRow label="Sold date" value={formatDate(warranty.soldAt)} />
              <DetailRow label="Starts" value={formatDate(warranty.startsAt)} />
              <DetailRow label="Ends" value={formatDate(warranty.endsAt)} />
              <DetailRow
                label="Serial number"
                value={warranty.serialNumber ?? " "}
              />
              <DetailRow label="Quantity" value={String(warranty.quantity)} />
            </InlineGrid>

            {warranty.policyDescription ? (
              <DetailRow
                label="Policy description"
                value={warranty.policyDescription}
              />
            ) : null}

            {warranty.notes ? (
              <DetailRow label="Notes" value={warranty.notes} />
            ) : null}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              Related records
            </Text>
            <BlockStack gap="200">
              {warranty.productId ? (
                <Link url={`/dashboard/inventory/products/${warranty.productId}`}>
                  View product
                </Link>
              ) : null}
              {warranty.productUnitId ? (
                <Link url={`/dashboard/inventory/units/${warranty.productUnitId}`}>
                  View serial unit
                </Link>
              ) : null}
              {warranty.customerId ? (
                <Link url={`/dashboard/customers/${warranty.customerId}`}>
                  View customer
                </Link>
              ) : null}
              {warranty.invoiceId ? (
                <Link url={`/dashboard/invoices/${warranty.invoiceId}`}>
                  View invoice{warranty.invoiceNumber ? ` ${warranty.invoiceNumber}` : ""}
                </Link>
              ) : null}
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </AppPage>
  );
}
