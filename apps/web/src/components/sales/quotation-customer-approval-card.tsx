"use client";

import { Badge, BlockStack, Button, Card, InlineStack, Text } from "@shopify/polaris";
import { formatMoney } from "@/components/sales/format-money";
import type { Quotation } from "@/lib/quotations-api";

interface QuotationCustomerApprovalCardProps {
  quotation: Quotation;
  currencyCode: string;
  decimalPlaces: number;
  onPreviewPdf: () => void;
}

export function QuotationCustomerApprovalCard({
  quotation,
  currencyCode,
  decimalPlaces,
  onPreviewPdf,
}: QuotationCustomerApprovalCardProps) {
  const isSigned = quotation.state === "signed" || Boolean(quotation.signedBy);
  if (!isSigned) {
    return null;
  }

  const approvalUrl =
    typeof window !== "undefined" && quotation.accessToken
      ? `${window.location.origin}/quotations/public/${quotation.accessToken}`
      : null;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h2" variant="headingMd">Customer approval</Text>
            <Badge tone="success">Digitally signed</Badge>
          </InlineStack>
          <InlineStack gap="200">
            {approvalUrl ? (
              <Button
                onClick={() => window.open(approvalUrl, "_blank", "noopener,noreferrer")}
              >
                View approval page
              </Button>
            ) : null}
            <Button onClick={onPreviewPdf}>Download signed PDF</Button>
          </InlineStack>
        </InlineStack>

        <div className="public-quote-approved-record">
          <div className="public-quote-approved-record__grid">
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Signed by</Text>
              <Text as="span" fontWeight="semibold">{quotation.signedBy ?? "—"}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Signed on</Text>
              <Text as="span" fontWeight="semibold">
                {quotation.signedOn
                  ? new Date(quotation.signedOn).toLocaleString()
                  : "—"}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Signer email</Text>
              <Text as="span" fontWeight="semibold">
                {quotation.signedEmail ?? quotation.customerEmail ?? "—"}
              </Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Approved total</Text>
              <Text as="span" fontWeight="semibold">
                {formatMoney(quotation.amountTotal, currencyCode, decimalPlaces)}
              </Text>
            </BlockStack>
          </div>

          {quotation.signatureImage ? (
            <div className="public-quote-approved-record__signature">
              <Text as="span" tone="subdued" variant="bodySm">Saved signature</Text>
              <img
                src={quotation.signatureImage}
                alt={`Signature of ${quotation.signedBy ?? "customer"}`}
                className="public-quote-approved-record__signature-img"
              />
            </div>
          ) : null}
        </div>
      </BlockStack>
    </Card>
  );
}
