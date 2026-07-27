"use client";

import {
  Badge,
  BlockStack,
  Button,
  InlineStack,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { useMemo, useState } from "react";

interface ReceiveSerialEntryProps {
  quantity: number;
  serials: string[];
  disabled?: boolean;
  onChange: (serials: string[]) => void;
}

function normalizeSerial(value: string) {
  return value.trim();
}

function findDuplicateIndexes(serials: string[]) {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();

  serials.forEach((serial, index) => {
    const normalized = normalizeSerial(serial);
    if (!normalized) return;

    const firstIndex = seen.get(normalized);
    if (firstIndex !== undefined) {
      duplicates.add(firstIndex);
      duplicates.add(index);
      return;
    }

    seen.set(normalized, index);
  });

  return duplicates;
}

export function ReceiveSerialEntry({
  quantity,
  serials,
  disabled,
  onChange,
}: ReceiveSerialEntryProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  const filledCount = useMemo(
    () => serials.filter((serial) => normalizeSerial(serial)).length,
    [serials],
  );

  const duplicateIndexes = useMemo(
    () => findDuplicateIndexes(serials),
    [serials],
  );

  function updateSerial(index: number, value: string) {
    const next = [...serials];
    next[index] = value;
    onChange(next);
  }

  function removeSerial(index: number) {
    const next = [...serials];
    next[index] = "";
    onChange(next);
  }

  function applyPaste() {
    const parsed = pasteValue
      .split(/[\n,;]+/)
      .map((value) => normalizeSerial(value))
      .filter(Boolean);

    const next = [...serials];
    for (let index = 0; index < quantity; index += 1) {
      next[index] = parsed[index] ?? next[index] ?? "";
    }

    onChange(next);
    setPasteValue("");
    setPasteOpen(false);
  }

  if (quantity <= 0) {
    return (
      <Text as="p" tone="subdued" variant="bodySm">
        Set a quantity above zero to enter serial numbers.
      </Text>
    );
  }

  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="span" fontWeight="semibold">
            Serial numbers
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            Enter one unique serial per unit. Each serial becomes a tracked
            inventory unit in stock.
          </Text>
        </BlockStack>
        <Badge tone={filledCount === quantity ? "success" : "info"}>
          {`${filledCount} / ${quantity} entered`}
        </Badge>
      </InlineStack>

      <BlockStack gap="200">
        {Array.from({ length: quantity }, (_, index) => {
          const value = serials[index] ?? "";
          const isDuplicate = duplicateIndexes.has(index);

          return (
            <TextField
              key={`serial-${index}`}
              autoComplete="off"
              disabled={disabled}
              error={
                isDuplicate
                  ? "Duplicate serial number"
                  : undefined
              }
              label={`Serial ${index + 1}`}
              placeholder={`e.g. SN-${String(index + 1).padStart(3, "0")}`}
              value={value}
              onChange={(nextValue) => updateSerial(index, nextValue)}
            />
          );
        })}
      </BlockStack>

      {filledCount > 0 ? (
        <InlineStack gap="150" wrap>
          {serials.map((serial, index) => {
            const normalized = normalizeSerial(serial);
            if (!normalized) return null;

            return (
              <Tag
                key={`tag-${index}-${normalized}`}
                onRemove={disabled ? undefined : () => removeSerial(index)}
              >
                {normalized}
              </Tag>
            );
          })}
        </InlineStack>
      ) : null}

      {duplicateIndexes.size > 0 ? (
        <Text as="p" tone="critical" variant="bodySm">
          Serial numbers must be unique within this receipt line.
        </Text>
      ) : null}

      {filledCount < quantity ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {quantity - filledCount} more serial
          {quantity - filledCount === 1 ? "" : "s"} required before validating.
        </Text>
      ) : null}

      <InlineStack gap="200">
        <Button
          disabled={disabled}
          variant="plain"
          onClick={() => setPasteOpen((current) => !current)}
        >
          {pasteOpen ? "Hide paste box" : "Paste multiple serials"}
        </Button>
      </InlineStack>

      {pasteOpen ? (
        <BlockStack gap="200">
          <TextField
            autoComplete="off"
            disabled={disabled}
            helpText="Separate with new lines, commas, or semicolons"
            label="Paste serial numbers"
            multiline={4}
            value={pasteValue}
            onChange={setPasteValue}
          />
          <InlineStack gap="200">
            <Button disabled={disabled || !pasteValue.trim()} onClick={applyPaste}>
              Apply to fields
            </Button>
          </InlineStack>
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}

export function buildSerialSlots(quantity: number, existing: string[] = []) {
  const slots: string[] = [];
  for (let index = 0; index < quantity; index += 1) {
    slots.push(existing[index] ?? "");
  }
  return slots;
}

export function serialsAreValid(quantity: number, serials: string[]) {
  if (quantity <= 0) return false;

  const normalized = serials
    .slice(0, quantity)
    .map((serial) => normalizeSerial(serial))
    .filter(Boolean);

  if (normalized.length !== quantity) return false;

  return new Set(normalized).size === normalized.length;
}

export function formatReceiveQuantity(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "1";
  if (Number.isInteger(amount)) return String(amount);
  return String(amount);
}
