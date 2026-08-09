"use client";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Text,
  Tooltip,
} from "@shopify/polaris";
import { LinkIcon, XIcon } from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  linkQuotationToDeal,
  reviseQuotation,
  unlinkQuotationFromDeal,
  type DealQuotationSummary,
  type Quotation,
} from "@/lib/quotations-api";

interface DealThreadPanelProps {
  quotation: Quotation;
  onUpdated: (updated: Quotation) => void;
}

function stateBadge(state: string) {
  switch (state) {
    case "draft":
      return <Badge>Draft</Badge>;
    case "sent":
      return <Badge tone="attention">Sent</Badge>;
    case "confirmed":
      return <Badge tone="success">Confirmed</Badge>;
    case "cancelled":
      return <Badge tone="critical">Voided</Badge>;
    default:
      return <Badge>{state}</Badge>;
  }
}

function formatAmount(amount: string, currency?: string | null) {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return `${currency ?? ""} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

export function DealThreadPanel({ quotation, onUpdated }: DealThreadPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [linkMode, setLinkMode] = useState(false);

  const siblings: DealQuotationSummary[] = quotation.dealSiblings ?? [];
  const hasDeal = !!quotation.dealId;
  const canRevise =
    quotation.state === "draft" ||
    quotation.state === "sent" ||
    quotation.state === "cancelled";

  async function handleRevise() {
    setLoading(true);
    try {
      const revised = await reviseQuotation(quotation.id);
      router.push(`/dashboard/sales/quotations/${revised.id}?created=draft`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkToDeal() {
    setLoading(true);
    try {
      const updated = await linkQuotationToDeal(quotation.id, "new");
      onUpdated(updated);
      setLinkMode(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink() {
    setLoading(true);
    try {
      const updated = await unlinkQuotationFromDeal(quotation.id);
      onUpdated(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <BlockStack gap="400">
        {/* Panel header */}
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h3" variant="headingMd">
                🔗 Deal Thread
              </Text>
              {hasDeal && siblings.length > 0 && (
                <Badge tone="info">
                  {`${siblings.length} revision${siblings.length !== 1 ? "s" : ""}`}
                </Badge>
              )}
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              {hasDeal
                ? `All revisions for ${quotation.customerName ?? "this customer"}`
                : "Group quote revisions to track the full negotiation"}
            </Text>
          </BlockStack>

          <InlineStack gap="200">
            {canRevise && (
              <Button
                size="slim"
                loading={loading}
                onClick={() => void handleRevise()}
                tone="critical"
                variant="plain"
              >
                Revise Quote
              </Button>
            )}
            {hasDeal && (
              <Tooltip content="Remove from deal thread">
                <Button
                  size="slim"
                  loading={loading}
                  onClick={() => void handleUnlink()}
                  icon={XIcon}
                  variant="plain"
                  accessibilityLabel="Remove from deal"
                />
              </Tooltip>
            )}
            {!hasDeal && !linkMode && (
              <Button
                size="slim"
                icon={LinkIcon}
                onClick={() => setLinkMode(true)}
                variant="plain"
              >
                Link to Deal
              </Button>
            )}
          </InlineStack>
        </InlineStack>

        {/* Manual link */}
        {linkMode && (
          <Box background="bg-surface-secondary" borderRadius="200" padding="300">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                Start a new deal thread for this quotation to track revisions.
              </Text>
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  size="slim"
                  loading={loading}
                  onClick={() => void handleLinkToDeal()}
                >
                  Create New Deal Thread
                </Button>
                <Button size="slim" onClick={() => setLinkMode(false)}>
                  Cancel
                </Button>
              </InlineStack>
            </BlockStack>
          </Box>
        )}

        {/* Timeline */}
        {hasDeal && siblings.length > 0 && (
          <>
            <Divider />
            <div style={{ position: "relative" }}>
              {siblings.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    left: 11,
                    top: 12,
                    bottom: 12,
                    width: 2,
                    background: "linear-gradient(to bottom, #8b5cf6, #3b82f6)",
                    borderRadius: 1,
                    opacity: 0.3,
                    zIndex: 0,
                  }}
                />
              )}
              <BlockStack gap="0">
                {siblings.map((sibling, idx) => {
                  const isCurrent = sibling.id === quotation.id;
                  const isCancelled = sibling.state === "cancelled";
                  const isConfirmed = sibling.state === "confirmed";

                  const dotBg = isCurrent
                    ? "#7c3aed"
                    : isCancelled
                    ? "#ef4444"
                    : isConfirmed
                    ? "#22c55e"
                    : "#94a3b8";

                  return (
                    <div
                      key={sibling.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                        paddingBottom: idx < siblings.length - 1 ? 16 : 0,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      {/* Node dot */}
                      <div style={{ flexShrink: 0, paddingTop: 2 }}>
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: dotBg,
                            boxShadow: isCurrent
                              ? "0 0 0 3px rgba(124,58,237,0.25)"
                              : "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            color: "#fff",
                            fontWeight: 700,
                          }}
                        >
                          {isCancelled ? "✕" : isConfirmed ? "✓" : idx + 1}
                        </div>
                      </div>

                      {/* Card content */}
                      <div style={{ flex: 1 }}>
                        <div
                          role={isCurrent ? undefined : "button"}
                          tabIndex={isCurrent ? undefined : 0}
                          onClick={() => {
                            if (!isCurrent) {
                              router.push(
                                `/dashboard/sales/quotations/${sibling.id}`,
                              );
                            }
                          }}
                          onKeyDown={(e) => {
                            if (!isCurrent && (e.key === "Enter" || e.key === " ")) {
                              router.push(
                                `/dashboard/sales/quotations/${sibling.id}`,
                              );
                            }
                          }}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 8,
                            background: isCurrent
                              ? "linear-gradient(135deg,rgba(124,58,237,.08),rgba(59,130,246,.06))"
                              : isCancelled
                              ? "rgba(239,68,68,.04)"
                              : "rgba(0,0,0,.02)",
                            border: isCurrent
                              ? "1.5px solid rgba(124,58,237,.3)"
                              : "1px solid rgba(0,0,0,.06)",
                            cursor: isCurrent ? "default" : "pointer",
                            transition: "all .15s ease",
                          }}
                        >
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <InlineStack gap="200" blockAlign="center">
                              <span
                                style={{
                                  fontWeight: 600,
                                  fontSize: 13,
                                  textDecoration: isCancelled
                                    ? "line-through"
                                    : "none",
                                  opacity: isCancelled ? 0.55 : 1,
                                  color: isCurrent ? "#7c3aed" : "inherit",
                                }}
                              >
                                {sibling.number}
                              </span>
                              {stateBadge(sibling.state)}
                              {isCurrent && (
                                <Badge tone="attention">Viewing</Badge>
                              )}
                              {isConfirmed && !isCurrent && (
                                <Badge tone="success">Final</Badge>
                              )}
                            </InlineStack>
                            <InlineStack gap="300" blockAlign="center">
                              <Text
                                as="span"
                                variant="bodySm"
                                tone={isCancelled ? "subdued" : undefined}
                              >
                                {formatAmount(
                                  sibling.amountTotal,
                                  sibling.currencyCode,
                                )}
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {sibling.quoteDate}
                              </Text>
                            </InlineStack>
                          </InlineStack>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </BlockStack>
            </div>
          </>
        )}

        {/* Single item in deal — show hint */}
        {hasDeal && siblings.length <= 1 && (
          <>
            <Divider />
            <Box background="bg-surface-secondary" borderRadius="200" padding="400">
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                This is the first quotation in this deal thread. Use{" "}
                <strong>Revise Quote</strong> to create a new revision when the
                customer requests changes.
              </Text>
            </Box>
          </>
        )}

        {/* Not in a deal — explain */}
        {!hasDeal && !linkMode && (
          <>
            <Divider />
            <Box background="bg-surface-secondary" borderRadius="200" padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>How it works:</strong> When a customer requests a price
                  change, click <strong>Revise Quote</strong> — this voids the current
                  quote and creates a new draft, linking both in a deal thread.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Use <strong>Link to Deal</strong> to manually group existing
                  quotations, or <strong>Cancel</strong> separately and create a new
                  quote and then link them.
                </Text>
              </BlockStack>
            </Box>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
