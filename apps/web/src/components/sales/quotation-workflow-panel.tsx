"use client";

import { Badge, BlockStack, InlineStack, Text } from "@shopify/polaris";
import type { Quotation } from "@/lib/quotations-api";

interface QuotationWorkflowPanelProps {
  quotation: Quotation;
}

const workflowSteps = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "signed", label: "Signed / PO" },
  { key: "confirmed", label: "Confirmed" },
  { key: "invoiced", label: "Invoiced" },
] as const;

function activeStepIndex(quotation: Quotation) {
  if (quotation.invoiceStatus === "invoiced") {
    return 4;
  }
  if (quotation.state === "confirmed") {
    return 3;
  }
  if (quotation.state === "signed") {
    return 2;
  }
  if (quotation.state === "sent") {
    return 1;
  }
  return 0;
}

export function QuotationWorkflowPanel({ quotation }: QuotationWorkflowPanelProps) {
  const activeIndex = activeStepIndex(quotation);
  const isCancelled = quotation.state === "cancelled";
  const hasPO = Boolean(quotation.customerReference);

  return (
    <div className="frogmen-workflow-panel">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap gap="200">
          <Text as="h2" variant="headingSm">
            Workflow progress
          </Text>
          {isCancelled ? (
            <Badge tone="critical">Cancelled</Badge>
          ) : quotation.invoiceStatus === "invoiced" ? (
            <Badge tone="success">Invoice created</Badge>
          ) : quotation.state === "confirmed" ? (
            <Badge tone="success">Ready to invoice</Badge>
          ) : quotation.state === "signed" ? (
            <Badge tone="success">Digitally signed</Badge>
          ) : quotation.state === "sent" && hasPO ? (
            <Badge tone="info">{`PO: ${quotation.customerReference ?? ""}`}</Badge>
          ) : quotation.state === "sent" ? (
            <Badge tone="attention">Awaiting signature</Badge>
          ) : hasPO ? (
            <Badge tone="info">{`PO: ${quotation.customerReference ?? ""}`}</Badge>
          ) : null}
        </InlineStack>

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
      </BlockStack>
    </div>
  );
}
