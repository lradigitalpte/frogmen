"use client";

import {
  BlockStack,
  Card,
  InlineStack,
  Link,
  Text,
} from "@shopify/polaris";
import { History } from "lucide-react";
import { formatMoney } from "@/components/sales/format-money";
import type { ProductUnitCostHistoryEvent } from "@/types/product";

interface ProductUnitCostHistoryCardProps {
  events: ProductUnitCostHistoryEvent[];
  currencyCode?: string | null;
}

const EVENT_LABELS: Record<ProductUnitCostHistoryEvent["eventType"], string> = {
  po_receipt: "Goods receipt",
  manual_edit: "Manual cost update",
  invoice_post: "Invoice COGS",
};

function referenceUrl(event: ProductUnitCostHistoryEvent): string | null {
  if (!event.referenceId) {
    return null;
  }

  switch (event.referenceType) {
    case "goods_receipt":
      return `/dashboard/purchasing/receipts/${event.referenceId}`;
    case "invoice":
      return `/dashboard/invoices/${event.referenceId}`;
    case "product":
      return `/dashboard/inventory/products/${event.referenceId}`;
    default:
      return null;
  }
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ProductUnitCostHistoryCard({
  events,
  currencyCode,
}: ProductUnitCostHistoryCardProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack gap="200" blockAlign="center">
          <History aria-hidden className="text-violet-700" size={20} />
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">
              Cost history
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Persistent audit trail of unit cost changes for this serial.
            </Text>
          </BlockStack>
        </InlineStack>

        <BlockStack gap="300">
          {events.map((event, index) => {
            const currency = event.currencyCode ?? currencyCode ?? "AED";
            const fmt = (value: string | null | undefined) =>
              value ? formatMoney(value, currency) : "—";
            const url = referenceUrl(event);
            const isLast = index === events.length - 1;

            return (
              <div
                key={event.id}
                className={`relative pl-6 ${isLast ? "" : "pb-1"}`}
              >
                {!isLast ? (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-[9px] top-5 w-px bg-border"
                  />
                ) : null}
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 h-[18px] w-[18px] rounded-full border-2 border-violet-600 bg-background"
                />
                <BlockStack gap="100">
                  <InlineStack align="space-between" blockAlign="start" wrap>
                    <Text as="p" fontWeight="semibold" variant="bodyMd">
                      {EVENT_LABELS[event.eventType]}
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {formatEventDate(event.createdAt)}
                    </Text>
                  </InlineStack>

                  {event.message ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {event.message}
                    </Text>
                  ) : null}

                  <InlineStack gap="300" wrap>
                    <Text as="span" variant="bodySm">
                      Cost:{" "}
                      <Text as="span" fontWeight="semibold">
                        {fmt(event.unitCost)}
                      </Text>
                    </Text>
                    {event.previousUnitCost ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        was {fmt(event.previousUnitCost)}
                      </Text>
                    ) : null}
                  </InlineStack>

                  {event.eventType === "po_receipt" &&
                  event.metadata &&
                  typeof event.metadata.lineUnitPrice === "string" ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      PO price {fmt(event.metadata.lineUnitPrice as string)} +
                      freight {fmt(String(event.metadata.freightAllocated ?? "0"))}{" "}
                      + other{" "}
                      {fmt(String(event.metadata.otherChargesAllocated ?? "0"))}{" "}
                      = landed {fmt(event.unitCost)}
                    </Text>
                  ) : null}

                  {event.referenceLabel && url ? (
                    <Link url={url}>{event.referenceLabel}</Link>
                  ) : event.referenceLabel ? (
                    <Text as="span" variant="bodySm">
                      {event.referenceLabel}
                    </Text>
                  ) : null}
                </BlockStack>
              </div>
            );
          })}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
