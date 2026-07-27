"use client";

import { BlockStack, Box, Icon, Popover, Text, TextField } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface AppSearchSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface AppSearchSelectProps {
  label: string;
  helpText?: string;
  options: AppSearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  emptyDescription?: string;
  error?: string;
}

function formatSummary(option: AppSearchSelectOption) {
  if (option.description && option.description !== option.label) {
    return `${option.label} · ${option.description}`;
  }

  return option.label;
}

export function AppSearchSelect({
  label,
  helpText,
  options,
  value,
  onChange,
  disabled,
  placeholder = "Search…",
  allowEmpty = false,
  emptyLabel = "None",
  emptyDescription,
  error,
}: AppSearchSelectProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const allOptions = useMemo(() => {
    if (!allowEmpty) {
      return options;
    }

    return [
      { value: "", label: emptyLabel, description: emptyDescription },
      ...options,
    ];
  }, [allowEmpty, emptyDescription, emptyLabel, options]);

  const selected = useMemo(
    () => allOptions.find((option) => option.value === value),
    [allOptions, value],
  );

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return allOptions;
    }

    return allOptions.filter((option) => {
      const haystack = [option.label, option.description, option.value]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [allOptions, query]);

  function closePopover() {
    setOpen(false);
    setQuery("");
  }

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    closePopover();
  }

  const inputValue = open ? query : selected ? formatSummary(selected) : "";

  return (
    <div className="app-search-select">
      <BlockStack gap="150">
        <label className="app-select-label" htmlFor={fieldId}>
          {label}
        </label>
        {helpText ? (
          <Text as="p" tone="subdued" variant="bodySm">
            {helpText}
          </Text>
        ) : null}

        <Popover
          activator={
            <div className="app-search-select__activator">
              <TextField
                autoComplete="off"
                clearButton
                disabled={disabled}
                id={fieldId}
                labelHidden
                label={label}
                placeholder={placeholder}
                prefix={<Icon source={SearchIcon} tone="subdued" />}
                value={inputValue}
                onChange={(nextQuery) => {
                  setQuery(nextQuery);
                  setOpen(true);
                }}
                onClearButtonClick={() => {
                  onChange("");
                  setQuery("");
                  setOpen(true);
                }}
                onFocus={() => {
                  setOpen(true);
                  setQuery("");
                }}
              />
            </div>
          }
          active={open && !disabled}
          autofocusTarget="none"
          fullWidth
          preferredAlignment="left"
          onClose={closePopover}
        >
          <div className="max-h-48 overflow-y-auto">
            <Box padding="100">
              {filteredOptions.length === 0 ? (
              <div className="app-search-select__empty">
                <Text as="p" tone="subdued" variant="bodySm">
                  No matches
                </Text>
              </div>
            ) : (
              <div className="app-search-select__results" role="listbox">
                {filteredOptions.map((option) => (
                  <button
                    key={option.value || "__empty__"}
                    className={cn(
                      "app-search-select__option",
                      option.value === value &&
                        "app-search-select__option--selected",
                    )}
                    role="option"
                    type="button"
                    aria-selected={option.value === value}
                    onClick={() => handleSelect(option.value)}
                  >
                    <span className="app-search-select__option-label">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="app-search-select__option-description">
                        {option.description}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              )}
            </Box>
          </div>
        </Popover>

        {error ? (
          <Text as="p" tone="critical" variant="bodySm">
            {error}
          </Text>
        ) : null}
      </BlockStack>
    </div>
  );
}
