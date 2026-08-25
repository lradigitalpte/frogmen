"use client";

import {
  BlockStack,
  Button,
  EmptyState,
  IndexTable,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { useCallback, useState } from "react";
import type { QuotationLine } from "@/lib/quotations-api";
import {
  formatDiscountLabel,
  inferDiscountMode,
  type DiscountMode,
} from "@/lib/line-item-utils";
import { formatMoney } from "./format-money";
import { LineItemDescription } from "./line-item-description";

interface QuotationLinesTableProps {
  lines: QuotationLine[];
  currencyCode: string;
  decimalPlaces?: number;
  disabled?: boolean;
  onUpdateLine: (
    lineId: string,
    input: {
      description?: string;
      quantity?: number;
      unitPrice?: number;
      discountPercent?: number;
      discountAmount?: number;
      taxRatePercent?: number;
    },
  ) => Promise<void>;
  onDeleteLine: (lineId: string) => Promise<void>;
}

interface EditableLineState {
  description: string;
  quantity: string;
  unitPrice: string;
  discountMode: DiscountMode;
  discountValue: string;
  taxRatePercent: string;
}

function lineToState(line: QuotationLine): EditableLineState {
  const mode = inferDiscountMode(line.discountAmount, line.discountPercent);
  return {
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountMode: mode,
    discountValue:
      mode === "amount"
        ? String(line.discountAmount ?? "0")
        : line.discountPercent,
    taxRatePercent: line.taxRatePercent,
  };
}

export function QuotationLinesTable({
  lines,
  currencyCode,
  decimalPlaces = 2,
  disabled,
  onUpdateLine,
  onDeleteLine,
}: QuotationLinesTableProps) {
  const [drafts, setDrafts] = useState<Record<string, EditableLineState>>({});
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);

  const getDraft = useCallback(
    (line: QuotationLine) => drafts[line.id] ?? lineToState(line),
    [drafts],
  );

  function updateDraft(lineId: string, patch: Partial<EditableLineState>) {
    setDrafts((current) => {
      const line = lines.find((item) => item.id === lineId);
      if (!line) return current;

      return {
        ...current,
        [lineId]: {
          ...getDraft(line),
          ...patch,
        },
      };
    });
  }

  async function saveLine(line: QuotationLine) {
    const draft = getDraft(line);
    setSavingLineId(line.id);
    const parsed = Math.max(0, Number(draft.discountValue) || 0);

    try {
      await onUpdateLine(line.id, {
        description: draft.description,
        quantity: Number(draft.quantity),
        unitPrice: Number(draft.unitPrice),
        discountPercent: draft.discountMode === "percent" ? parsed : 0,
        discountAmount: draft.discountMode === "amount" ? parsed : 0,
        taxRatePercent: Number(draft.taxRatePercent),
      });

      setDrafts((current) => {
        const next = { ...current };
        delete next[line.id];
        return next;
      });
    } finally {
      setSavingLineId(null);
    }
  }

  async function removeLine(lineId: string) {
    setDeletingLineId(lineId);

    try {
      await onDeleteLine(lineId);
      setDrafts((current) => {
        const next = { ...current };
        delete next[lineId];
        return next;
      });
    } finally {
      setDeletingLineId(null);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="quotation-lines-empty">
        <EmptyState
          heading="No products yet"
          image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
        >
          <p>Add your first product to start building this quotation.</p>
        </EmptyState>
      </div>
    );
  }

  const resourceName = { singular: "line", plural: "lines" };

  const rowMarkup = lines.map((line, index) => {
    const draft = getDraft(line);
    const isSerial = line.productUnitId !== null;
    const savedMode = inferDiscountMode(line.discountAmount, line.discountPercent);
    const savedValue =
      savedMode === "amount"
        ? String(line.discountAmount ?? "0")
        : line.discountPercent;
    const dirty =
      draft.description !== line.description ||
      draft.quantity !== line.quantity ||
      draft.unitPrice !== line.unitPrice ||
      draft.discountMode !== savedMode ||
      draft.discountValue !== savedValue ||
      draft.taxRatePercent !== line.taxRatePercent;

    return (
      <IndexTable.Row id={line.id} key={line.id} position={index}>
        <IndexTable.Cell>
          <div className="quotation-line-field">
            <TextField
              autoComplete="off"
              disabled={disabled}
              label="Description"
              labelHidden
              onChange={(value) => updateDraft(line.id, { description: value })}
              value={draft.description}
            />
            {line.productDescription ? (
              <div style={{ marginTop: "0.4rem" }}>
                <LineItemDescription
                  boldTitle={false}
                  details={line.productDescription}
                  title=""
                />
              </div>
            ) : null}
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="quotation-line-field quotation-line-field--narrow">
            <TextField
              autoComplete="off"
              disabled={disabled || isSerial}
              label="Qty"
              labelHidden
              onChange={(value) => updateDraft(line.id, { quantity: value })}
              type="number"
              value={draft.quantity}
            />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="quotation-line-field quotation-line-field--narrow">
            <TextField
              autoComplete="off"
              disabled={disabled}
              label="Price"
              labelHidden
              onChange={(value) => updateDraft(line.id, { unitPrice: value })}
              type="number"
              value={draft.unitPrice}
            />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="quotation-line-field quotation-line-field--narrow">
            <BlockStack gap="100">
              <Select
                disabled={disabled}
                label="Discount type"
                labelHidden
                options={[
                  { label: "%", value: "percent" },
                  { label: currencyCode, value: "amount" },
                ]}
                value={draft.discountMode}
                onChange={(value) =>
                  updateDraft(line.id, {
                    discountMode: value as DiscountMode,
                  })
                }
              />
              <TextField
                autoComplete="off"
                disabled={disabled}
                label="Discount"
                labelHidden
                onChange={(value) =>
                  updateDraft(line.id, { discountValue: value })
                }
                type="number"
                value={draft.discountValue}
              />
            </BlockStack>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="quotation-line-field quotation-line-field--narrow">
            <TextField
              autoComplete="off"
              disabled={disabled}
              label="Tax"
              labelHidden
              onChange={(value) =>
                updateDraft(line.id, { taxRatePercent: value })
              }
              type="number"
              value={draft.taxRatePercent}
            />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" alignment="end" numeric>
            {formatMoney(line.priceSubtotal, currencyCode, decimalPlaces)}
          </Text>
          {!dirty ? (
            <Text as="p" tone="subdued" variant="bodySm">
              Disc{" "}
              {formatDiscountLabel(
                line.discountAmount,
                line.discountPercent,
                currencyCode,
              )}
            </Text>
          ) : null}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" wrap={false}>
            {dirty && !disabled ? (
              <Button
                loading={savingLineId === line.id}
                onClick={() => void saveLine(line)}
                size="slim"
                variant="primary"
              >
                Save
              </Button>
            ) : null}
            {!disabled ? (
              <Button
                accessibilityLabel="Delete line"
                icon={DeleteIcon}
                loading={deletingLineId === line.id}
                onClick={() => void removeLine(line.id)}
                tone="critical"
                variant="plain"
              />
            ) : null}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <IndexTable
      headings={[
        { title: "Description" },
        { title: "Qty" },
        { title: "Price" },
        { title: "Discount" },
        { title: "Tax %" },
        { title: "Subtotal", alignment: "end" },
        { title: "" },
      ]}
      itemCount={lines.length}
      resourceName={resourceName}
      selectable={false}
    >
      {rowMarkup}
    </IndexTable>
  );
}
