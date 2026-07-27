"use client";

import { BlockStack, Select, Text, TextField } from "@shopify/polaris";
import {
  computeValidityDate,
  validityPresetOptions,
  type ValidityPreset,
} from "./validity-period";

interface ValidityPeriodPickerProps {
  quoteDate: string;
  preset: ValidityPreset;
  validityDate: string;
  onChange: (next: { preset: ValidityPreset; validityDate: string }) => void;
  disabled?: boolean;
}

export function ValidityPeriodPicker({
  quoteDate,
  preset,
  validityDate,
  onChange,
  disabled,
}: ValidityPeriodPickerProps) {
  const isCustom = preset === "custom";

  return (
    <BlockStack gap="200">
      <Select
        disabled={disabled}
        label="Valid until"
        onChange={(value) => {
          const nextPreset = value as ValidityPreset;

          if (nextPreset === "custom") {
            onChange({
              preset: nextPreset,
              validityDate: validityDate || computeValidityDate(quoteDate, "30_days"),
            });
            return;
          }

          onChange({
            preset: nextPreset,
            validityDate: computeValidityDate(quoteDate, nextPreset),
          });
        }}
        options={validityPresetOptions}
        value={preset}
      />

      {isCustom ? (
        <TextField
          autoComplete="off"
          disabled={disabled}
          helpText="Pick an exact expiry date for this quotation."
          label="Custom expiry date"
          onChange={(nextDate) =>
            onChange({ preset: "custom", validityDate: nextDate })
          }
          type="date"
          value={validityDate}
        />
      ) : (
        <Text as="p" tone="subdued" variant="bodySm">
          Expires on{" "}
          <Text as="span" fontWeight="semibold">
            {formatDisplayDate(validityDate)}
          </Text>
        </Text>
      )}
    </BlockStack>
  );
}

function formatDisplayDate(value: string) {
  if (!value) return " ";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
