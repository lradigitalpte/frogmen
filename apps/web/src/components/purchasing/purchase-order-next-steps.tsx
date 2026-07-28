"use client";

import { BlockStack, Link, List, Text } from "@shopify/polaris";
import type { PurchaseOrder } from "@/lib/purchase-orders-api";

interface PurchaseOrderNextStepsProps {
  order: PurchaseOrder;
  onReceive?: () => void;
  onConfirm?: () => void;
}

export function PurchaseOrderNextSteps({
  order,
}: PurchaseOrderNextStepsProps) {
  if (order.state === "cancelled") {
    return (
      <BlockStack gap="200">
        <Text as="p" tone="subdued" variant="bodySm">
          This purchase order was cancelled. Stock was not changed unless you had
          already validated a goods receipt before cancelling.
        </Text>
      </BlockStack>
    );
  }

  if (order.state === "draft") {
    return (
      <BlockStack gap="200">
        <Text as="p" variant="bodySm">
          <strong>What to do now</strong>
        </Text>
        <List type="number">
          <List.Item>Review lines, vendor, and totals.</List.Item>
          <List.Item>
            Click <strong>Confirm purchase order</strong> when you are ready to
            order from the supplier.
          </List.Item>
          <List.Item>
            Email the PO to the vendor using <strong>Send to vendor</strong> or
            share it through their portal.
          </List.Item>
        </List>
        <Text as="p" tone="subdued" variant="bodySm">
          This is a <strong>purchase order</strong>, not a sales invoice. You do
          not invoice your customer from here.
        </Text>
      </BlockStack>
    );
  }

  if (order.receiptStatus === "received") {
    return (
      <BlockStack gap="200">
        <Text as="p" variant="bodySm">
          <strong>Receiving complete</strong>
        </Text>
        <List>
          <List.Item>
            Stock was updated when you validated the goods receipt.
          </List.Item>
          <List.Item>
            Check{" "}
            <Link url="/dashboard/inventory">Inventory</Link> for on-hand
            quantities and serial numbers.
          </List.Item>
          <List.Item>
            View the goods receipt under{" "}
            <Link url="/dashboard/purchasing/receipts">Receipts</Link> or in the
            receipts list on this PO.
          </List.Item>
        </List>
        <Text as="p" tone="subdued" variant="bodySm">
          Vendor bills / accounts payable are not in this version yet. When the
          supplier sends their invoice, record it outside the app for now.
        </Text>
      </BlockStack>
    );
  }

  if (order.receiptStatus === "partial") {
    return (
      <BlockStack gap="200">
        <Text as="p" variant="bodySm">
          <strong>Partially received</strong>
        </Text>
        <List>
          <List.Item>Some units are already in stock.</List.Item>
          <List.Item>
            When the rest of the shipment arrives, click{" "}
            <strong>Receive products</strong> again.
          </List.Item>
        </List>
      </BlockStack>
    );
  }

  if (order.state === "confirmed") {
    return (
      <BlockStack gap="200">
        <Text as="p" variant="bodySm">
          <strong>Waiting for delivery</strong>
        </Text>
        <List type="number">
          <List.Item>Goods are on order from the vendor.</List.Item>
          <List.Item>
            When shipment arrives, click <strong>Receive products</strong>.
          </List.Item>
          <List.Item>
            Enter quantities and serial numbers, then validate the receipt to
            add stock.
          </List.Item>
        </List>
        <Text as="p" tone="subdued" variant="bodySm">
          No sales invoice is needed at this stage. Your customer is only
          invoiced from Sales when you sell to them.
        </Text>
      </BlockStack>
    );
  }

  return null;
}
