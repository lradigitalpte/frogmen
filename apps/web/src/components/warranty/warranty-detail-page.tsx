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
import { formatQuantity } from "@/lib/format-quantity";
import { getWarranty, type WarrantyRegistration } from "@/lib/warranty-api";

import { ConfirmDeliveryModal } from "./confirm-delivery-modal";

interface WarrantyDetailPageProps {
  warrantyId: string;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function statusTone(
  status: WarrantyRegistration["status"],
): "success" | "warning" | "critical" | "info" | "attention" {
  if (status === "active") return "success";
  if (status === "expired") return "critical";
  if (status === "pending_delivery") return "attention";
  return "info";
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
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

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
    warranty.status === "pending_delivery"
      ? "Pending delivery (starts on delivery)"
      : warranty.status === "expired"
        ? `Expired ${Math.abs(warranty.daysLeft)} days ago`
        : warranty.daysLeft === 0
          ? "Expires today"
          : `${warranty.daysLeft} days left`;

  const statusLabel =
    warranty.status === "pending_delivery" ? "Pending delivery" : warranty.status;

  return (
    <AppPage
      backAction={{ content: "Warranty", url: "/dashboard/warranty" }}
      fullWidth
      primaryAction={{
        content:
          warranty.status === "pending_delivery"
            ? "Confirm delivery"
            : "Update delivery date",
        onAction: () => setDeliveryModalOpen(true),
      }}
      subtitle={warranty.policy?.name ?? "Warranty coverage"}
      title={warranty.displayProductName}
    >
      <BlockStack gap="400">
        {warranty.status === "pending_delivery" ? (
          <Banner
            tone="warning"
            action={{
              content: "Confirm delivery now",
              onAction: () => setDeliveryModalOpen(true),
            }}
          >
            This warranty has not started yet because equipment delivery is pending.
            Confirming delivery will start the warranty clock on the delivery date.
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="400">
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              <DetailRow
                label="Status"
                value={
                  <Badge tone={statusTone(warranty.status)}>
                    {statusLabel}
                  </Badge>
                }
              />
              <DetailRow label="Time left" value={daysLabel} />
              <DetailRow label="Source" value={warranty.source} />
            </InlineGrid>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <DetailRow label="Customer" value={warranty.displayCustomerName} />
              <DetailRow label="Sold date" value={formatDate(warranty.soldAt)} />
              <DetailRow
                label="Delivered date"
                value={formatDate(warranty.deliveredAt)}
              />
              <DetailRow label="Starts" value={formatDate(warranty.startsAt)} />
              <DetailRow label="Ends" value={formatDate(warranty.endsAt)} />
              <DetailRow
                label="Serial number"
                value={warranty.serialNumber ?? " "}
              />
              <DetailRow label="Quantity" value={formatQuantity(warranty.quantity)} />
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
              {warranty.deliveryNoteId ? (
                <Text as="span" variant="bodyMd">
                  Delivery note: {warranty.deliveryNoteNumber ?? "Linked"}
                </Text>
              ) : null}
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>

      <ConfirmDeliveryModal
        open={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        warranty={warranty}
        onSuccess={(updated) => setWarranty(updated)}
      />
    </AppPage>
  );
}
