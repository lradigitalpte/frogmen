"use client";

import {
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  archiveProductCategory,
  createProductCategory,
  listProductCategories,
} from "@/lib/product-categories-api";
import type { ProductCategory } from "@/types/product-category";

export function ProductCategoriesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listProductCategories({
        search: debouncedSearch || undefined,
        perPage: 200,
      });
      setCategories(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function handleCreate() {
    const name = newCategory.trim();
    if (!name) {
      setError("Enter a category name");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await createProductCategory(name);
      setNewCategory("");
      setSuccess(`Added “${created.name}”`);
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCreating(false);
    }
  }

  async function handleArchive(category: ProductCategory) {
    setError(null);
    setSuccess(null);

    try {
      await archiveProductCategory(category.id);
      setSuccess(`Removed “${category.name}”`);
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      fullWidth
      subtitle="Group products into categories, then pick one on each product."
      title="Product categories"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {success ? (
          <Banner tone="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              New category
            </Text>
            <InlineStack align="end" gap="200" wrap={false}>
              <div
                style={{ flex: 1 }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreate();
                  }
                }}
              >
                <TextField
                  autoComplete="off"
                  label="Category name"
                  labelHidden
                  placeholder="e.g. ROV accessories, consumables"
                  value={newCategory}
                  onChange={setNewCategory}
                />
              </div>
              <Button
                disabled={!newCategory.trim()}
                loading={creating}
                variant="primary"
                onClick={() => void handleCreate()}
              >
                Add category
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">
                Your categories
              </Text>
              <Text as="span" tone="subdued" variant="bodySm">
                {loading
                  ? "Loading…"
                  : `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
              </Text>
            </InlineStack>

            <TextField
              autoComplete="off"
              clearButton
              label="Search"
              labelHidden
              placeholder="Filter categories…"
              value={search}
              onChange={setSearch}
              onClearButtonClick={() => setSearch("")}
            />

            {!loading && categories.length === 0 ? (
              <EmptyState
                heading="No categories yet"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
              >
                <p>Add a category above, then assign it when creating products.</p>
              </EmptyState>
            ) : (
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="200">
                {categories.map((category) => (
                  <div key={category.id} className="product-tag-row">
                    <Tag onRemove={() => void handleArchive(category)}>
                      {category.name}
                    </Tag>
                  </div>
                ))}
              </InlineGrid>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </AppPage>
  );
}
