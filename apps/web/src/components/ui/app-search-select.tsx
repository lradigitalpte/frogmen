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
  /** Server-side search: options are already filtered, so skip local filtering. */
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  /** Shown as the current value when it is not among `options` (e.g. async results). */
  selectedOption?: AppSearchSelectOption | null;
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
  onQueryChange,
  loading = false,
  selectedOption,
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
    () =>
      allOptions.find((option) => option.value === value) ??
      (selectedOption?.value === value ? selectedOption : undefined),
    [allOptions, selectedOption, value],
  );

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized || onQueryChange) {
      return allOptions;
    }

    return allOptions.filter((option) => {
      const haystack = [option.label, option.description, option.value]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [allOptions, onQueryChange, query]);

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    onQueryChange?.(nextQuery);
  }

  function closePopover() {
    setOpen(false);
    updateQuery("");
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
                  updateQuery(nextQuery);
                  setOpen(true);
                }}
                onClearButtonClick={() => {
                  onChange("");
                  updateQuery("");
                  setOpen(true);
                }}
                onFocus={() => {
                  setOpen(true);
                  updateQuery("");
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
          <div className="app-search-select__dropdown">
            <Box padding="100">
              {loading || filteredOptions.length === 0 ? (
              <div className="app-search-select__empty">
                <Text as="p" tone="subdued" variant="bodySm">
                  {loading ? "Searching…" : "No matches"}
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
