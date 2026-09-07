"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BlockStack,
  Button,
  Icon,
  InlineStack,
  Text,
} from "@shopify/polaris";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DragHandleIcon,
} from "@shopify/polaris-icons";
import {
  computeLineMarginPercent,
  computeLineProfit,
  computeLineTotal,
  formatMarginPercent,
} from "@/lib/line-item-utils";
import type { ConfiguredLineItem } from "@/types/configured-line-item";
import { formatQuantity } from "@/lib/format-quantity";
import { LineItemDescription } from "@/components/sales/line-item-description";

interface ConfiguredLineItemsListProps {
  lines: ConfiguredLineItem[];
  formatAmount: (amount: number) => string;
  onEdit: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function ConfiguredLineItemsList({
  lines,
  formatAmount,
  onEdit,
  onRemove,
  onReorder,
}: ConfiguredLineItemsListProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (lines.length === 0) {
    return (
      <div className="frogmen-line-card frogmen-line-card--empty">
        <Text as="p" tone="subdued">
          No line items yet. Search the catalog above and add products to this
          quotation.
        </Text>
      </div>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = lines.findIndex((line) => line.id === active.id);
    const toIndex = lines.findIndex((line) => line.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    onReorder(fromIndex, toIndex);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={lines.map((line) => line.id)}
        strategy={verticalListSortingStrategy}
      >
        <BlockStack gap="300">
          {lines.map((line, index) => (
            <SortableLineCard
              key={line.id}
              line={line}
              index={index}
              lineCount={lines.length}
              formatAmount={formatAmount}
              isExpanded={!collapsedIds.has(line.id)}
              onToggleExpand={() =>
                setCollapsedIds((current) => {
                  const next = new Set(current);
                  if (next.has(line.id)) {
                    next.delete(line.id);
                  } else {
                    next.add(line.id);
                  }
                  return next;
                })
              }
              onEdit={() => onEdit(line.id)}
              onRemove={() => onRemove(line.id)}
              onMoveUp={() => onReorder(index, index - 1)}
              onMoveDown={() => onReorder(index, index + 1)}
            />
          ))}
        </BlockStack>
      </SortableContext>
    </DndContext>
  );
}

interface SortableLineCardProps {
  line: ConfiguredLineItem;
  index: number;
  lineCount: number;
  formatAmount: (amount: number) => string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SortableLineCard({
  line,
  index,
  lineCount,
  formatAmount,
  isExpanded,
  onToggleExpand,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}: SortableLineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id });

  const lineTotal = computeLineTotal(line);
  const lineProfit = computeLineProfit(line);
  const lineMargin = computeLineMarginPercent(line);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        isDragging
          ? "frogmen-line-card frogmen-line-card--dragging"
          : "frogmen-line-card"
      }
    >
      <div className="frogmen-line-card__row">
        <div className="frogmen-line-card__reorder">
          <button
            type="button"
            className="frogmen-line-card__drag-handle"
            aria-label="Drag to reorder line item"
            {...attributes}
            {...listeners}
          >
            <Icon source={DragHandleIcon} tone="subdued" />
          </button>
          <div className="frogmen-line-card__nudge">
            <button
              type="button"
              className="frogmen-line-card__nudge-btn"
              aria-label="Move line item up"
              disabled={index === 0}
              onClick={onMoveUp}
            >
              ▲
            </button>
            <button
              type="button"
              className="frogmen-line-card__nudge-btn"
              aria-label="Move line item down"
              disabled={index === lineCount - 1}
              onClick={onMoveDown}
            >
              ▼
            </button>
          </div>
        </div>

        <button
          type="button"
          className="frogmen-line-card__summary"
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
        >
          <div className="frogmen-line-card__summary-title">
            <Text as="span" fontWeight="semibold">
              {line.name}
            </Text>
            <Text as="span" tone="subdued" variant="bodySm">
              {line.sku}
              {line.serialNumber ? ` · SN ${line.serialNumber}` : ""}
            </Text>
          </div>
          <div className="frogmen-line-card__summary-metrics">
            <Text as="span" tone="subdued" variant="bodySm">
              Qty {formatQuantity(line.quantity)}
            </Text>
            <Text as="span" fontWeight="bold">
              {formatAmount(lineTotal)}
            </Text>
          </div>
          <Icon source={isExpanded ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
        </button>
      </div>

      {isExpanded ? (
        <div className="frogmen-line-card__details">
          <div className="frogmen-line-card__main">
            <BlockStack gap="200">
              <div className="frogmen-line-card__title">
                <LineItemDescription
                  details={line.details}
                  productId={line.productId}
                  title={line.name}
                />
              </div>
              <div className="frogmen-line-card__meta">
                <div className="frogmen-line-card__meta-item">
                  <Text as="span" tone="subdued" variant="bodySm">
                    SKU
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {line.sku}
                  </Text>
                </div>
                {line.serialNumber ? (
                  <div className="frogmen-line-card__meta-item">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Serial number
                    </Text>
                    <Text as="span" fontWeight="semibold">
                      {line.serialNumber}
                    </Text>
                  </div>
                ) : null}
              </div>
            </BlockStack>

            <div className="frogmen-line-card__metrics">
              <div className="frogmen-line-card__metric">
                <Text as="span" tone="subdued" variant="bodySm">
                  Qty
                </Text>
                <Text as="span" fontWeight="semibold">
                  {formatQuantity(line.quantity)}
                </Text>
              </div>
              <div className="frogmen-line-card__metric">
                <Text as="span" tone="subdued" variant="bodySm">
                  Unit price
                </Text>
                <Text as="span" fontWeight="semibold">
                  {formatAmount(line.unitPrice)}
                </Text>
              </div>
              <div className="frogmen-line-card__metric">
                <Text as="span" tone="subdued" variant="bodySm">
                  Line total
                </Text>
                <Text as="span" fontWeight="bold">
                  {formatAmount(lineTotal)}
                </Text>
              </div>
              <div className="frogmen-line-card__metric">
                <Text as="span" tone="subdued" variant="bodySm">
                  Profit
                </Text>
                <InlineStack gap="150" blockAlign="center" wrap={false}>
                  <Text
                    as="span"
                    fontWeight="semibold"
                    tone={lineProfit >= 0 ? "success" : "critical"}
                  >
                    {formatAmount(lineProfit)}
                  </Text>
                  <span
                    className={
                      lineProfit >= 0
                        ? "frogmen-margin-badge"
                        : "frogmen-margin-badge frogmen-margin-badge--loss"
                    }
                  >
                    {formatMarginPercent(lineMargin)}
                  </span>
                </InlineStack>
              </div>
            </div>
          </div>

          <InlineStack gap="200" wrap={false}>
            <Button onClick={onEdit}>Edit</Button>
            <Button tone="critical" onClick={onRemove}>
              Remove
            </Button>
          </InlineStack>
        </div>
      ) : null}
    </div>
  );
}
