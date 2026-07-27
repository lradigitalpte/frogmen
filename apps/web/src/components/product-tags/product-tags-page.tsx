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
  archiveProductTag,
  createProductTag,
  listProductTags,
} from "@/lib/product-tags-api";
import type { ProductTag } from "@/types/product-tag";

export function ProductTagsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [newTag, setNewTag] = useState("");
  const [tags, setTags] = useState<ProductTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadTags = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listProductTags({
        search: debouncedSearch || undefined,
        perPage: 200,
      });
      setTags(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  async function handleCreate() {
    const name = newTag.trim();
    if (!name) {
      setError("Enter a tag name");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await createProductTag(name);
      setNewTag("");
      setSuccess(`Added “${created.name}”`);
      await loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreating(false);
    }
  }

  async function handleArchive(tag: ProductTag) {
    setError(null);
    setSuccess(null);

    try {
      await archiveProductTag(tag.id);
      setSuccess(`Removed “${tag.name}”`);
      await loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tag");
    }
  }

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      fullWidth
      subtitle="Create tags here, then pick them on products."
      title="Product tags"
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
              New tag
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
                  label="Tag name"
                  labelHidden
                  placeholder="e.g. thruster, battery, spare"
                  value={newTag}
                  onChange={setNewTag}
                />
              </div>
              <Button
                disabled={!newTag.trim()}
                loading={creating}
                variant="primary"
                onClick={() => void handleCreate()}
              >
                Add tag
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">
                Your tags
              </Text>
              <Text as="span" tone="subdued" variant="bodySm">
                {loading ? "Loading…" : `${tags.length} tag${tags.length === 1 ? "" : "s"}`}
              </Text>
            </InlineStack>

            <TextField
              autoComplete="off"
              clearButton
              label="Search"
              labelHidden
              placeholder="Filter tags…"
              value={search}
              onChange={setSearch}
              onClearButtonClick={() => setSearch("")}
            />

            {!loading && tags.length === 0 ? (
              <EmptyState
                heading="No tags yet"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
              >
                <p>Add a tag above, then use it when creating products.</p>
              </EmptyState>
            ) : (
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="200">
                {tags.map((tag) => (
                  <div key={tag.id} className="product-tag-row">
                    <Tag onRemove={() => void handleArchive(tag)}>{tag.name}</Tag>
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
