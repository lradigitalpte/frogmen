"use client";

import {
  BlockStack,
  Button,
  EmptyState,
  IndexTable,
  Text,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { formatMoney } from "@/components/sales/format-money";
import { formatQuantity } from "@/lib/format-quantity";
import { purchaseOrderLineNet } from "@/lib/purchase-order-utils";

export interface PurchaseOrderDraftLine {
  id: string;
  productId: string;
  warehouseId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  productName: string;
  productSku?: string | null;
  sellingPrice?: number | null;
  warehouseName: string;
}

interface PurchaseOrderDraftLinesTableProps {
  lines: PurchaseOrderDraftLine[];
  currencyCode?: string;
  onRemove: (lineId: string) => void;
}

export function PurchaseOrderDraftLinesTable({
  lines,
  currencyCode,
  onRemove,
}: PurchaseOrderDraftLinesTableProps) {
  if (lines.length === 0) {
    return (
      <EmptyState
        heading="No products added yet"
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>
          Add products with quantity, unit cost, and the warehouse where goods
          will be received. Add an optional vendor discount per line (% or fixed amount).
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

  const rowMarkup = lines.map((line, index) => (
    <IndexTable.Row id={line.id} key={line.id} position={index}>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text as="span" fontWeight="semibold">
            {line.productName}
          </Text>
          {line.productSku ? (
            <Text as="span" tone="subdued" variant="bodySm">
              {line.productSku}
            </Text>
          ) : null}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="subdued">
          {line.warehouseName}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatQuantity(line.quantity)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatMoney(String(line.unitPrice), currencyCode)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" tone="subdued">
          {formatDiscount(line)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" fontWeight="semibold" numeric>
          {formatMoney(String(purchaseOrderLineNet(line)), currencyCode)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Button
          accessibilityLabel="Remove line"
          icon={DeleteIcon}
          tone="critical"
          variant="plain"
          onClick={() => onRemove(line.id)}
        />
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <IndexTable
      headings={[
        { title: "Product" },
        { title: "Receive into" },
        { title: "Qty", alignment: "end" },
        { title: "Unit cost", alignment: "end" },
        { title: "Discount", alignment: "end" },
        { title: "Line total", alignment: "end" },
        { title: "" },
      ]}
      itemCount={lines.length}
      resourceName={{ singular: "line", plural: "lines" }}
      selectable={false}
    >
      {rowMarkup}
    </IndexTable>
  );
}
