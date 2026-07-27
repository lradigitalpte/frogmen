"use client";

import {
  BlockStack,
  Button,
  EmptyState,
  IndexTable,
  InlineStack,
  Text,
  TextField,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { useCallback, useState } from "react";
import type { QuotationLine } from "@/lib/quotations-api";
import { formatMoney } from "./format-money";

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
      taxRatePercent?: number;
    },
  ) => Promise<void>;
  onDeleteLine: (lineId: string) => Promise<void>;
}

interface EditableLineState {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRatePercent: string;
}

function lineToState(line: QuotationLine): EditableLineState {
  return {
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
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

    try {
      await onUpdateLine(line.id, {
        description: draft.description,
        quantity: Number(draft.quantity),
        unitPrice: Number(draft.unitPrice),
        discountPercent: Number(draft.discountPercent),
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
    const dirty =
      draft.description !== line.description ||
      draft.quantity !== line.quantity ||
      draft.unitPrice !== line.unitPrice ||
      draft.discountPercent !== line.discountPercent ||
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
            <TextField
              autoComplete="off"
              disabled={disabled}
              label="Discount"
              labelHidden
              onChange={(value) =>
                updateDraft(line.id, { discountPercent: value })
              }
              type="number"
              value={draft.discountPercent}
            />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="quotation-line-field quotation-line-field--narrow">
            <TextField
              autoComplete="off"
              disabled={disabled}
              label="Tax"
              labelHidden
              onChange={(value) => updateDraft(line.id, { taxRatePercent: value })}
              type="number"
              value={draft.taxRatePercent}
            />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" alignment="end" fontWeight="semibold" numeric>
            {formatMoney(line.priceTotal, currencyCode, decimalPlaces)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" align="end">
            {dirty && !disabled ? (
              <Button
                loading={savingLineId === line.id}
                onClick={() => void saveLine(line)}
                size="slim"
              >
                Save
              </Button>
            ) : null}
            {!disabled ? (
              <Button
                icon={DeleteIcon}
                loading={deletingLineId === line.id}
                onClick={() => void removeLine(line.id)}
                tone="critical"
                variant="plain"
                accessibilityLabel="Delete line"
              />
            ) : null}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <div className="app-index-surface quotation-lines-table">
      <IndexTable
        headings={[
          { title: "Description" },
          { title: "Qty" },
          { title: "Unit price" },
          { title: "Disc. %" },
          { title: "Tax %" },
          { title: "Total", alignment: "end" },
          { title: "" },
        ]}
        itemCount={lines.length}
        resourceName={resourceName}
        selectable={false}
      >
        {rowMarkup}
      </IndexTable>
    </div>
  );
}
