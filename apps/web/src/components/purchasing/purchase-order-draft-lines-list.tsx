"use client";

import { useState } from "react";
import {
  BlockStack,
  Button,
  EmptyState,
  Icon,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { formatMoney } from "@/components/sales/format-money";
import { formatQuantity } from "@/lib/format-quantity";
import { purchaseOrderLineNet } from "@/lib/purchase-order-utils";
import type { PurchaseOrderDraftLine } from "@/components/purchasing/purchase-order-draft-lines-table";

interface PurchaseOrderDraftLinesListProps {
  lines: PurchaseOrderDraftLine[];
  currencyCode?: string;
  onEdit: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}

export function PurchaseOrderDraftLinesList({
  lines,
  currencyCode,
  onEdit,
  onRemove,
}: PurchaseOrderDraftLinesListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (lines.length === 0) {
    return (
      <EmptyState
        heading="No products added yet"
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>
          Search the catalog above and add storable products. Set vendor discount
          on the whole order after you add lines.
        </p>
      </EmptyState>
    );
  }

  function formatDiscount(line: PurchaseOrderDraftLine) {
    const amount = line.discountAmount ?? 0;
    if (amount > 0) {
      return formatMoney(String(amount), currencyCode);
    }
    const pct = line.discountPercent ?? 0;
    if (pct > 0) {
      return `${pct}%`;
    }
    return "—";
  }

  function toggleExpanded(lineId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }

  return (
    <BlockStack gap="300">
      {lines.map((line) => {
        const isExpanded = expandedIds.has(line.id);
        const lineNet = purchaseOrderLineNet(line);

        return (
          <div key={line.id} className="frogmen-line-card">
            <div className="frogmen-line-card__row">
              <button
                type="button"
                className="frogmen-line-card__summary"
                onClick={() => toggleExpanded(line.id)}
                aria-expanded={isExpanded}
              >
                <div className="frogmen-line-card__summary-title">
                  <Text as="span" fontWeight="semibold">
                    {line.productName}
                  </Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {line.productSku ? `SKU ${line.productSku}` : " "}
                    {line.warehouseName
                      ? ` · ${shortWarehouseLabel(line.warehouseName)}`
                      : ""}
                  </Text>
                </div>
                <div className="frogmen-line-card__summary-metrics">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Qty {formatQuantity(line.quantity)}
                  </Text>
                  <Text as="span" fontWeight="bold">
                    {formatMoney(String(lineNet), currencyCode)}
                  </Text>
                </div>
                <Icon
                  source={isExpanded ? ChevronUpIcon : ChevronDownIcon}
                  tone="subdued"
                />
              </button>
            </div>

            {isExpanded ? (
              <div className="frogmen-line-card__details">
                <div className="frogmen-line-card__main">
                  <BlockStack gap="200">
                    <div className="frogmen-line-card__title">
                      <LineItemDescription
                        details={line.productDescription}
                        productId={line.productId}
                        title={line.productName}
                      />
                    </div>
                    <div className="frogmen-line-card__meta">
                      <div className="frogmen-line-card__meta-item">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Receive into
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {line.warehouseName}
                        </Text>
                      </div>
                      <div className="frogmen-line-card__meta-item">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Unit cost
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {formatMoney(String(line.unitPrice), currencyCode)}
                        </Text>
                      </div>
                      <div className="frogmen-line-card__meta-item">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Line discount
                        </Text>
                        <Text as="span" fontWeight="semibold">
                          {formatDiscount(line)}
                        </Text>
                      </div>
                    </div>
                  </BlockStack>
                </div>
                <InlineStack gap="200" wrap={false}>
                  <Button onClick={() => onEdit(line.id)}>Edit</Button>
                  <Button tone="critical" onClick={() => onRemove(line.id)}>
                    Remove
                  </Button>
                </InlineStack>
              </div>
            ) : (
              <div className="purchase-order-line-card__actions">
                <InlineStack gap="200">
                  <Button size="slim" onClick={() => onEdit(line.id)}>
                    Edit
                  </Button>
                  <Button
                    size="slim"
                    tone="critical"
                    onClick={() => onRemove(line.id)}
                  >
                    Remove
                  </Button>
                </InlineStack>
              </div>
            )}
          </div>
        );
      })}
    </BlockStack>
  );
}

function shortWarehouseLabel(name: string) {
  const trimmed = name.trim();
  if (trimmed.length <= 28) {
    return trimmed;
  }
  return `${trimmed.slice(0, 25)}…`;
}
