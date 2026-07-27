"use client";

import {
  BlockStack,
  Button,
  InlineStack,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { useMemo, useState } from "react";

interface ProductSerialEntryProps {
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

export function productSerialsAreValid(serials: string[]) {
  const normalized = serials
    .map((serial) => normalizeSerial(serial))
    .filter(Boolean);

  if (normalized.length === 0) return false;

  return new Set(normalized.map((serial) => serial.toLowerCase())).size ===
    normalized.length;
}

export function ProductSerialEntry({
  serials,
  disabled,
  onChange,
}: ProductSerialEntryProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  const rows = serials.length > 0 ? serials : [""];

  const filledCount = useMemo(
    () => serials.filter((serial) => normalizeSerial(serial)).length,
    [serials],
  );

  const duplicateIndexes = useMemo(
    () => findDuplicateIndexes(serials),
    [serials],
  );

  function updateSerial(index: number, value: string) {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  }

  function removeSerial(index: number) {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length > 0 ? next : [""]);
  }

  function addRow() {
    onChange([...rows, ""]);
  }

  function applyPaste() {
    const parsed = pasteValue
      .split(/[\n,;]+/)
      .map((value) => normalizeSerial(value))
      .filter(Boolean);

    const existing = rows
      .map((serial) => normalizeSerial(serial))
      .filter(Boolean);
    onChange([...existing, ...parsed]);
    setPasteValue("");
    setPasteOpen(false);
  }

  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="span" tone="subdued" variant="bodySm">
          Enter one unique serial per physical unit.
        </Text>
        <Text as="span" tone="subdued" variant="bodySm">
          {filledCount} serial{filledCount === 1 ? "" : "s"}
        </Text>
      </InlineStack>

      <BlockStack gap="200">
        {rows.map((value, index) => (
          <InlineStack
            key={`serial-row-${index}`}
            align="space-between"
            blockAlign="end"
            gap="200"
            wrap={false}
          >
            <div style={{ flex: 1 }}>
              <TextField
                autoComplete="off"
                disabled={disabled}
                error={
                  duplicateIndexes.has(index)
                    ? "Duplicate serial number"
                    : undefined
                }
                label={`Serial ${index + 1}`}
                placeholder="e.g. ROV-001"
                value={value}
                onChange={(nextValue) => updateSerial(index, nextValue)}
              />
            </div>
            {rows.length > 1 ? (
              <Button
                disabled={disabled}
                tone="critical"
                variant="plain"
                onClick={() => removeSerial(index)}
              >
                Remove
              </Button>
            ) : null}
          </InlineStack>
        ))}
      </BlockStack>

      <InlineStack gap="200">
        <Button disabled={disabled} onClick={addRow}>
          Add serial
        </Button>
        <Button
          disabled={disabled}
          variant="plain"
          onClick={() => setPasteOpen((current) => !current)}
        >
          {pasteOpen ? "Hide paste box" : "Paste multiple"}
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
          <Button disabled={disabled || !pasteValue.trim()} onClick={applyPaste}>
            Add pasted serials
          </Button>
        </BlockStack>
      ) : null}

      {filledCount > 0 ? (
        <InlineStack gap="150" wrap>
          {serials
            .map((serial, index) => ({ serial, index }))
            .filter((item) => normalizeSerial(item.serial))
            .map((item) => (
              <Tag
                key={`tag-${item.index}-${item.serial}`}
                onRemove={
                  disabled ? undefined : () => removeSerial(item.index)
                }
              >
                {normalizeSerial(item.serial)}
              </Tag>
            ))}
        </InlineStack>
      ) : null}

      {duplicateIndexes.size > 0 ? (
        <Text as="p" tone="critical" variant="bodySm">
          Serial numbers must be unique.
        </Text>
      ) : null}
    </BlockStack>
  );
}
