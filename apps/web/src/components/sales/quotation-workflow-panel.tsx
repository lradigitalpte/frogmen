"use client";

import { Badge, BlockStack, Button, InlineStack, Text } from "@shopify/polaris";
import type { Quotation } from "@/lib/quotations-api";

interface QuotationWorkflowPanelProps {
  quotation: Quotation;
  actionLoading?: boolean;
  onSendEmail: () => void;
  onMarkSent: () => void;
  onConfirm: () => void;
  onCreateInvoice: () => void;
}

const workflowSteps = [
  { key: "draft", label: "1. Draft quotation" },
  { key: "sent", label: "2. Sent to customer" },
  { key: "confirmed", label: "3. Sales order confirmed" },
  { key: "invoiced", label: "4. Invoice created" },
] as const;

function activeStepIndex(quotation: Quotation) {
  if (quotation.invoiceStatus === "invoiced") {
    return 3;
  }
  if (quotation.state === "confirmed") {
    return 2;
  }
  if (quotation.state === "sent") {
    return 1;
  }
  return 0;
}

export function QuotationWorkflowPanel({
  quotation,
  actionLoading = false,
  onSendEmail,
  onMarkSent,
  onConfirm,
  onCreateInvoice,
}: QuotationWorkflowPanelProps) {
  const activeIndex = activeStepIndex(quotation);
  const isCancelled = quotation.state === "cancelled";

  return (
    <div className="frogmen-workflow-panel">
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            Quotation to invoice workflow
          </Text>
          <Text as="p" tone="subdued">
            Send the quote, confirm when the customer approves, then create the
            invoice from the confirmed sales order.
          </Text>
        </BlockStack>

        <div className="frogmen-pipeline-stepper frogmen-pipeline-stepper--wide">
          {workflowSteps.map((step, index) => {
            const isComplete = index < activeIndex;
            const isActive = index === activeIndex && !isCancelled;

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
          <Badge tone="critical">This quotation was cancelled</Badge>
        ) : quotation.state === "draft" ? (
          <InlineStack gap="200" wrap>
            <Button variant="primary" onClick={onSendEmail}>
              Send to customer (email + PDF)
            </Button>
            <Button loading={actionLoading} onClick={onMarkSent}>
              Mark as sent (no email)
            </Button>
            <Text as="span" tone="subdued">
              Next: confirm as sales order after customer approval
            </Text>
          </InlineStack>
        ) : quotation.state === "sent" ? (
          <InlineStack gap="200" wrap blockAlign="center">
            <Button variant="primary" loading={actionLoading} onClick={onConfirm}>
              Confirm sales order
            </Button>
            <Text as="span" tone="subdued">
              Customer approved? Confirm to unlock invoicing.
            </Text>
          </InlineStack>
        ) : quotation.state === "confirmed" &&
          quotation.invoiceStatus !== "invoiced" ? (
          <InlineStack gap="200" wrap blockAlign="center">
            <Button variant="primary" onClick={onCreateInvoice}>
              Create invoice
            </Button>
            <Badge tone="success">Ready to invoice</Badge>
          </InlineStack>
        ) : quotation.invoiceStatus === "invoiced" ? (
          <Badge tone="success">Invoice created   workflow complete</Badge>
        ) : null}
      </BlockStack>
    </div>
  );
}
