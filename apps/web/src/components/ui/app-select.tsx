"use client";

import {
  BlockStack,
  Box,
  Icon,
  Listbox,
  Popover,
  Text,
} from "@shopify/polaris";
import { ChevronDownIcon } from "@shopify/polaris-icons";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface AppSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface AppSelectProps {
  label: string;
  helpText?: string;
  options: AppSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
}

const EMPTY_VALUE = "__none__";

function formatSelectedSummary(option: AppSelectOption) {
  if (option.description && option.description !== option.label) {
    return `${option.label} · ${option.description}`;
  }

  return option.label;
}

export function AppSelect({
  label,
  helpText,
  options,
  value,
  onChange,
  disabled,
  placeholder = "Select…",
  error,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const listboxValue = value || EMPTY_VALUE;

  return (
    <BlockStack gap="150">
      <label className="app-select-label" htmlFor={`${label}-trigger`}>
        {label}
      </label>
      {helpText ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {helpText}
        </Text>
      ) : null}

      <Popover
        activator={
          <button
            aria-expanded={open}
            className={cn(
              "app-select-trigger",
              disabled && "app-select-trigger--disabled",
              error && "app-select-trigger--error",
              open && "app-select-trigger--open",
            )}
            disabled={disabled}
            id={`${label}-trigger`}
            type="button"
            onClick={() => setOpen((current) => !current)}
          >
            <span className="app-select-trigger__text">
              {selected ? (
                <span className="app-select-trigger__label">
                  {formatSelectedSummary(selected)}
                </span>
              ) : (
                <span className="app-select-trigger__placeholder">
                  {placeholder}
                </span>
              )}
            </span>
            <span className="app-select-trigger__icon" aria-hidden>
              <Icon source={ChevronDownIcon} tone="subdued" />
            </span>
          </button>
        }
        active={open && !disabled}
        autofocusTarget="first-node"
        fullWidth
        preferredAlignment="left"
        onClose={() => setOpen(false)}
      >
        <div className="max-h-80 overflow-y-auto">
          <Box padding="150">
            <Listbox
            onSelect={(nextValue) => {
              const resolved =
                String(nextValue) === EMPTY_VALUE ? "" : String(nextValue);
              onChange(resolved);
              setOpen(false);
            }}
          >
            {options.map((option) => {
              const optionValue = option.value || EMPTY_VALUE;

              return (
                <Listbox.Option
                  key={optionValue}
                  selected={optionValue === listboxValue}
                  value={optionValue}
                >
                  <BlockStack gap="050">
                    <Text
                      as="span"
                      fontWeight={
                        optionValue === listboxValue ? "semibold" : "regular"
                      }
                    >
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        {option.description}
                      </Text>
                    ) : null}
                  </BlockStack>
                </Listbox.Option>
              );
            })}
            </Listbox>
          </Box>
        </div>
      </Popover>

      {error ? (
        <Text as="p" tone="critical" variant="bodySm">
          {error}
        </Text>
      ) : null}
    </BlockStack>
  );
}
