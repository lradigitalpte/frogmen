"use client";

import { BlockStack, Button, InlineStack, Text } from "@shopify/polaris";
import type { PurchaseOrder } from "@/lib/purchase-orders-api";
import {
  purchaseReceiptStatusLabel,
  purchaseReceiptStatusVariant,
  StatusBadge,
} from "@/components/ui/status-badge";

interface PurchaseOrderWorkflowPanelProps {
  order: PurchaseOrder;
  actionLoading?: boolean;
  onConfirm: () => void;
  onReceive: () => void;
  onAddNote: () => void;
}

const workflowSteps = [
  { key: "draft", label: "1. Draft PO" },
  { key: "confirmed", label: "2. Confirmed" },
  { key: "receiving", label: "3. Receiving" },
  { key: "received", label: "4. Received" },
] as const;

function activeStepIndex(order: PurchaseOrder) {
  if (order.state === "draft") return 0;
  if (order.state === "cancelled") return -1;
  if (order.receiptStatus === "received") return 3;
  if (order.receiptStatus === "partial") return 2;
  if (order.state === "confirmed") return 1;
  return 0;
}

export function PurchaseOrderWorkflowPanel({
  order,
  actionLoading = false,
  onConfirm,
  onReceive,
  onAddNote,
}: PurchaseOrderWorkflowPanelProps) {
  const activeIndex = activeStepIndex(order);
  const isCancelled = order.state === "cancelled";
  const canConfirm = order.state === "draft";
  const canReceive =
    order.state === "confirmed" && order.receiptStatus !== "received";

  return (
    <div className="frogmen-workflow-panel">
      <BlockStack gap="400">
        <BlockStack gap="100">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Purchase order workflow
              </Text>
              <Text as="p" tone="subdued">
                Confirm the PO, receive goods into warehouses, then validate
                receipts to update stock.
              </Text>
            </BlockStack>
            <StatusBadge
              variant={purchaseReceiptStatusVariant(order.receiptStatus)}
            >
              {purchaseReceiptStatusLabel(order.receiptStatus)}
            </StatusBadge>
          </InlineStack>
        </BlockStack>

        <div className="frogmen-pipeline-stepper frogmen-pipeline-stepper--wide">
          {workflowSteps.map((step, index) => {
            const isComplete = !isCancelled && index < activeIndex;
            const isActive = !isCancelled && index === activeIndex;

            return (
              <div
                key={step.key}
                className={[
                  "frogmen-pipeline-step",
                  isComplete ? "completed" : "",
                  isActive ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {step.label}
              </div>
            );
          })}
        </div>

        {isCancelled ? (
          <Text as="p" tone="critical">
            This purchase order was cancelled. No further receiving actions are
            available.
          </Text>
        ) : (
          <InlineStack gap="200" wrap>
            {canConfirm ? (
              <Button loading={actionLoading} variant="primary" onClick={onConfirm}>
                Confirm purchase order
              </Button>
            ) : null}
            {canReceive ? (
              <Button variant="primary" onClick={onReceive}>
                Receive products
              </Button>
            ) : null}
            <Button onClick={onAddNote}>Add note</Button>
          </InlineStack>
        )}
      </BlockStack>
    </div>
  );
}
