"use client";

import {
  BlockStack,
  Card,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { formatMoney } from "@/components/sales/format-money";

function formatDisplayDate(value: string) {
  if (!value) return " ";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface PurchaseOrderContextCardProps {
  vendorName?: string;
  currencyCode?: string;
  orderDate: string;
  expectedDate?: string;
  lineCount?: number;
  unitCount?: number;
  orderTotal?: number;
  showTotal?: boolean;
}

export function PurchaseOrderContextCard({
  vendorName,
  currencyCode,
  orderDate,
  expectedDate,
  lineCount,
  unitCount,
  orderTotal,
  showTotal,
}: PurchaseOrderContextCardProps) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" wrap>
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Order summary
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Line costs plus freight and other charges.
            </Text>
          </BlockStack>
          {showTotal && orderTotal !== undefined ? (
            <BlockStack gap="050">
              <Text as="span" tone="subdued" variant="bodySm">
                Order total
              </Text>
              <Text as="span" fontWeight="bold" variant="headingLg">
                {formatMoney(String(orderTotal), currencyCode)}
              </Text>
            </BlockStack>
          ) : null}
        </InlineStack>

        <div className="quotation-summary-panel__rows">
          <div className="quotation-summary-row">
            <Text as="span" tone="subdued" variant="bodySm">
              Vendor
            </Text>
            <Text as="span" fontWeight="semibold">
              {vendorName ?? "Not selected"}
            </Text>
          </div>
          <div className="quotation-summary-row">
            <Text as="span" tone="subdued" variant="bodySm">
              Currency
            </Text>
            <Text as="span" fontWeight="semibold">
              {currencyCode ?? " "}
            </Text>
          </div>
          <div className="quotation-summary-row">
            <Text as="span" tone="subdued" variant="bodySm">
              Order date
            </Text>
            <Text as="span">{formatDisplayDate(orderDate)}</Text>
          </div>
          <div className="quotation-summary-row">
            <Text as="span" tone="subdued" variant="bodySm">
              Expected delivery
            </Text>
            <Text as="span">
              {expectedDate ? formatDisplayDate(expectedDate) : " "}
            </Text>
          </div>
          {lineCount !== undefined ? (
            <div className="quotation-summary-row">
              <Text as="span" tone="subdued" variant="bodySm">
                Line items
              </Text>
              <Text as="span">{lineCount}</Text>
            </div>
          ) : null}
          {unitCount !== undefined ? (
            <div className="quotation-summary-row">
              <Text as="span" tone="subdued" variant="bodySm">
                Units ordered
              </Text>
              <Text as="span">{unitCount}</Text>
            </div>
          ) : null}
        </div>
      </BlockStack>
    </Card>
  );
}
