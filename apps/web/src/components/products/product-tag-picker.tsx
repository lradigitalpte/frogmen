"use client";

import {
  Banner,
  BlockStack,
  Box,
  Button,
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
import { createProductTag, listProductTags } from "@/lib/product-tags-api";
import type { ProductTag } from "@/types/product-tag";

interface ProductTagPickerProps {
  selected: string[];
  disabled?: boolean;
  onChange: (tags: string[]) => void;
}

export function ProductTagPicker({
  selected,
  disabled,
  onChange,
}: ProductTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [catalog, setCatalog] = useState<ProductTag[]>([]);
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
      const result = await listProductTags({
        search: debouncedQuery || undefined,
        perPage: 200,
      });
      setCatalog(result.data);
    } catch (err) {
      setCatalog([]);
      setError(err instanceof Error ? err.message : "Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    if (open) {
      void loadCatalog();
    }
  }, [loadCatalog, open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return catalog;
    }

    return catalog.filter((tag) =>
      tag.name.toLowerCase().includes(normalized),
    );
  }, [catalog, query]);

  const canCreate =
    query.trim().length > 0 &&
    !catalog.some(
      (tag) => tag.name.toLowerCase() === query.trim().toLowerCase(),
    );

  function toggleTag(name: string) {
    const key = name.toLowerCase();
    if (selected.some((tag) => tag.toLowerCase() === key)) {
      onChange(selected.filter((tag) => tag.toLowerCase() !== key));
      return;
    }

    onChange([...selected, name]);
  }

  async function handleCreate() {
    const name = query.trim();
    if (!name || creating) {
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const tag = await createProductTag(name);
      setCatalog((current) => {
        if (current.some((item) => item.id === tag.id)) {
          return current;
        }

        return [...current, tag].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      });

      const key = tag.name.toLowerCase();
      if (!selected.some((item) => item.toLowerCase() === key)) {
        onChange([...selected, tag.name]);
      }

      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreating(false);
    }
  }

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="span" variant="bodySm">
          Tags
        </Text>
        <Link url="/dashboard/inventory/product-tags">Manage tags</Link>
      </InlineStack>

      {error ? (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      {selected.length > 0 ? (
        <InlineStack gap="200" wrap>
          {selected.map((tag) => (
            <Tag
              key={tag}
              disabled={disabled}
              onRemove={() => toggleTag(tag)}
            >
              {tag}
            </Tag>
          ))}
        </InlineStack>
      ) : (
        <Text as="p" tone="subdued" variant="bodySm">
          No tags selected
        </Text>
      )}

      <Popover
        activator={
          <div className="app-search-select__activator">
            <TextField
              autoComplete="off"
              disabled={disabled}
              labelHidden
              label="Search tags"
              placeholder="Search or create tag…"
              prefix={<Icon source={SearchIcon} tone="subdued" />}
              value={query}
              onChange={(value) => {
                setQuery(value);
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
        onClose={() => {
          setOpen(false);
        }}
      >
        <div className="max-h-56 overflow-y-auto">
          <Box padding="100">
            {loading ? (
            <div className="app-search-select__empty">
              <Text as="p" tone="subdued" variant="bodySm">
                Loading…
              </Text>
            </div>
          ) : filtered.length === 0 && !canCreate ? (
            <div className="app-search-select__empty">
              <Text as="p" tone="subdued" variant="bodySm">
                No tags yet   type a name to create one
              </Text>
            </div>
          ) : (
            <div className="app-search-select__results" role="listbox">
              {filtered.map((tag) => {
                const isSelected = selected.some(
                  (item) => item.toLowerCase() === tag.name.toLowerCase(),
                );

                return (
                  <button
                    key={tag.id}
                    className={cn(
                      "app-search-select__option",
                      isSelected && "app-search-select__option--selected",
                    )}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      toggleTag(tag.name);
                      setQuery("");
                    }}
                  >
                    <span className="app-search-select__option-label">
                      {tag.name}
                    </span>
                  </button>
                );
              })}

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
