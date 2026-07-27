"use client";

import {
  Banner,
  BlockStack,
  Box,
  Icon,
  InlineStack,
  Link,
  Popover,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  createProductCategory,
  listProductCategories,
} from "@/lib/product-categories-api";
import type { ProductCategory } from "@/types/product-category";

interface ProductCategoryPickerProps {
  value: string;
  disabled?: boolean;
  onChange: (categoryId: string, categoryName?: string) => void;
}

export function ProductCategoryPicker({
  value,
  disabled,
  onChange,
}: ProductCategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [catalog, setCatalog] = useState<ProductCategory[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listProductCategories({
        search: debouncedQuery || undefined,
        perPage: 200,
      });
      setCatalog(result.data);

      if (value) {
        const match = result.data.find((item) => item.id === value);
        if (match) {
          setSelectedName(match.name);
        }
      }
    } catch (err) {
      setCatalog([]);
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, value]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return catalog;
    }

    return catalog.filter((item) =>
      item.name.toLowerCase().includes(normalized),
    );
  }, [catalog, query]);

  const canCreate =
    query.trim().length > 0 &&
    !catalog.some(
      (item) => item.name.toLowerCase() === query.trim().toLowerCase(),
    );

  const displayValue =
    open && query ? query : value && selectedName ? selectedName : "";

  async function handleCreate() {
    const name = query.trim();
    if (!name || creating) {
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const category = await createProductCategory(name);
      setCatalog((current) => [...current, category]);
      setSelectedName(category.name);
      onChange(category.id, category.name);
      setQuery("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCreating(false);
    }
  }

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="span" variant="bodySm">
          Category
        </Text>
        <Link url="/dashboard/inventory/product-categories">Manage</Link>
      </InlineStack>

      {error ? (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      {value && selectedName ? (
        <InlineStack gap="200">
          <Tag
            disabled={disabled}
            onRemove={() => {
              onChange("");
              setSelectedName("");
            }}
          >
            {selectedName}
          </Tag>
        </InlineStack>
      ) : (
        <Text as="p" tone="subdued" variant="bodySm">
          Optional
        </Text>
      )}

      <Popover
        activator={
          <div className="app-search-select__activator">
            <TextField
              autoComplete="off"
              disabled={disabled}
              labelHidden
              label="Category"
              placeholder="Search or create category…"
              prefix={<Icon source={SearchIcon} tone="subdued" />}
              value={displayValue}
              onChange={(next) => {
                setQuery(next);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
            />
          </div>
        }
        active={open && !disabled}
        autofocusTarget="none"
        fullWidth
        preferredAlignment="left"
        onClose={() => setOpen(false)}
      >
        <div className="max-h-56 overflow-y-auto">
          <Box padding="100">
            {loading ? (
            <div className="app-search-select__empty">
              <Text as="p" tone="subdued" variant="bodySm">
                Loading…
              </Text>
            </div>
          ) : (
            <div className="app-search-select__results" role="listbox">
              <button
                className={cn(
                  "app-search-select__option",
                  !value && "app-search-select__option--selected",
                )}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange("");
                  setSelectedName("");
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="app-search-select__option-label">None</span>
              </button>

              {filtered.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "app-search-select__option",
                    value === item.id && "app-search-select__option--selected",
                  )}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelectedName(item.name);
                    onChange(item.id, item.name);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span className="app-search-select__option-label">
                    {item.name}
                  </span>
                </button>
              ))}

              {canCreate ? (
                <button
                  className="app-search-select__option app-search-select__option--create"
                  disabled={creating}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleCreate()}
                >
                  <span className="app-search-select__option-label">
                    {creating ? "Creating…" : `Create “${query.trim()}”`}
                  </span>
                </button>
              ) : null}
            </div>
            )}
          </Box>
        </div>
      </Popover>
    </BlockStack>
  );
}
