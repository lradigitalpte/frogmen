"use client";

import { Banner, Button, Icon, Modal, Pagination, Select, SkeletonBodyText, Text, TextField } from "@shopify/polaris";
import { CategoriesIcon, DeleteIcon, EditIcon, PlusIcon, SearchIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  archiveProductCategory,
  createProductCategory,
  listProductCategories,
  updateProductCategory,
} from "@/lib/product-categories-api";
import { cn } from "@/lib/utils";
import type { ProductCategory } from "@/types/product-category";

type SortMode = "name" | "most" | "empty";
type UsageFilter = "all" | "used" | "unused";

const PAGE_SIZES = [24, 48, 96];
const FETCH_PAGE = 200;

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Name (A–Z)", value: "name" },
  { label: "Most products", value: "most" },
  { label: "Unused first", value: "empty" },
];

function initials(name: string) {
  return name
    .split(/[\s&/-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProductCategoriesPage() {
  const { showSuccess } = useToast();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [usage, setUsage] = useState<UsageFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleting, setDeleting] = useState<ProductCategory | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Load everything once; filter locally so typing is instant.
  const load = useCallback(async () => {
    try {
      // Fetch every page so counts and search cover the whole list, not just the first 200.
      const first = await listProductCategories({ perPage: FETCH_PAGE, page: 1 });
      let all = first.data;
      for (let p = 2; p <= first.meta.totalPages; p += 1) {
        const next = await listProductCategories({ perPage: FETCH_PAGE, page: p });
        all = all.concat(next.data);
      }
      setCategories(all);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const nameTaken = (name: string, exceptId?: string) =>
    categories.some((c) => c.id !== exceptId && normalized(c.name) === normalized(name));

  const newNameDuplicate = newName.trim() ? nameTaken(newName) : false;
  const editDuplicate = editingId && editName.trim() ? nameTaken(editName, editingId) : false;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const count = (c: ProductCategory) => c.productCount ?? 0;
    const list = categories
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .filter((c) => usage === "all" || (usage === "used" ? count(c) > 0 : count(c) === 0));
    return [...list].sort((a, b) => {
      if (sort === "most") return count(b) - count(a) || a.name.localeCompare(b.name);
      if (sort === "empty") return count(a) - count(b) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [categories, search, sort, usage]);

  const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageItems = visible.slice((safePage - 1) * perPage, safePage * perPage);

  const totalProducts = categories.reduce((sum, c) => sum + (c.productCount ?? 0), 0);
  const unused = categories.filter((c) => !c.productCount).length;
  const maxCount = Math.max(1, ...categories.map((c) => c.productCount ?? 0));
  const largest = [...categories].sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0))[0];

  async function handleCreate() {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name || newNameDuplicate) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createProductCategory(name);
      setNewName("");
      showSuccess(`Added “${created.name}”`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(category: ProductCategory) {
    setEditingId(category.id);
    setEditName(category.name);
  }

  async function handleSaveEdit() {
    const category = categories.find((c) => c.id === editingId);
    const name = editName.trim().replace(/\s+/g, " ");
    if (!category || !name || editDuplicate) return;
    if (name === category.name) {
      setEditingId(null);
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      await updateProductCategory(category.id, name);
      setEditingId(null);
      showSuccess(`Renamed to “${name}”`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename category");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await archiveProductCategory(deleting.id);
      showSuccess(`Deleted “${deleting.name}”`);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      secondaryActions={[
        { content: "Products for sale", url: "/dashboard/inventory/products" },
        { content: "Operational products", url: "/dashboard/inventory/operations" },
        { content: "Tags", url: "/dashboard/inventory/product-tags" },
      ]}
      subtitle="Group products so they're easier to find, filter and report on. Each product can have one category."
      title="Product categories"
    >
      <div className="pl pc">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {/* Summary */}
        <div className="pc-stats">
          <div className="pc-stat">
            <small>Categories</small>
            <strong>{loading ? "…" : categories.length}</strong>
          </div>
          <div className="pc-stat">
            <small>Products categorised</small>
            <strong>{loading ? "…" : totalProducts}</strong>
          </div>
          <div className="pc-stat">
            <small>Unused categories</small>
            <strong>{loading ? "…" : unused}</strong>
          </div>
          <div className="pc-stat">
            <small>Largest</small>
            <strong className="pc-stat__text">
              {loading ? "…" : largest && largest.productCount ? largest.name : "—"}
            </strong>
          </div>
        </div>

        {/* Add */}
        <form
          className="pc-add"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <span className="pc-add__icon" aria-hidden>
            <Icon source={PlusIcon} />
          </span>
          <div className="pc-add__field">
            <TextField
              autoComplete="off"
              error={newNameDuplicate ? "You already have a category with this name." : undefined}
              label="New category"
              labelHidden
              placeholder="New category — e.g. Thrusters, Tethers, Consumables"
              value={newName}
              onChange={setNewName}
            />
          </div>
          <Button disabled={!newName.trim() || newNameDuplicate} loading={creating} submit variant="primary">
            Add category
          </Button>
        </form>

        {/* List */}
        <section className="ex-surface">
          <div className="pc-toolbar">
            <div className="pc-toolbar__search">
              <TextField
                autoComplete="off"
                clearButton
                label="Search categories"
                labelHidden
                placeholder="Search categories"
                prefix={<Icon source={SearchIcon} />}
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                onClearButtonClick={() => {
                  setSearch("");
                  setPage(1);
                }}
              />
            </div>
            <div className="iv-filters">
              {(
                [
                  { id: "all", label: "All", n: categories.length },
                  { id: "used", label: "In use", n: categories.length - unused },
                  { id: "unused", label: "Unused", n: unused },
                ] as Array<{ id: UsageFilter; label: string; n: number }>
              ).map((f) => (
                <button
                  className={cn("iv-filter", usage === f.id && "is-active")}
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setUsage(f.id);
                    setPage(1);
                  }}
                >
                  {f.label} <span>{f.n}</span>
                </button>
              ))}
            </div>
            <Select
              label="Sort"
              labelInline
              options={SORT_OPTIONS}
              value={sort}
              onChange={(v) => {
                setSort(v as SortMode);
                setPage(1);
              }}
            />
          </div>

          {loading ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={6} />
            </div>
          ) : visible.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={CategoriesIcon} />
              </span>
              <strong>
                {search
                  ? `No categories match “${search}”`
                  : usage === "used"
                    ? "No categories are in use yet"
                    : usage === "unused"
                      ? "Every category is in use"
                      : "No categories yet"}
              </strong>
              <p>
                {search
                  ? "Check the spelling, or add it as a new category."
                  : "Add your first category above, then pick it on each product."}
              </p>
              {search && !nameTaken(search) ? (
                <Button
                  onClick={() => {
                    setNewName(search);
                    setSearch("");
                  }}
                >
                  {`Add “${search.trim()}”`}
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="pc-grid">
              {pageItems.map((category) => {
                const count = category.productCount ?? 0;
                const editing = editingId === category.id;
                return (
                  <li className={cn("pc-row", editing && "is-editing")} key={category.id}>
                    <span className="pc-row__avatar" aria-hidden>
                      {initials(category.name) || "?"}
                    </span>
                    {editing ? (
                      <form
                        className="pc-row__edit"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleSaveEdit();
                        }}
                      >
                        <div className="pc-row__edit-field">
                          <TextField
                            autoComplete="off"
                            autoFocus
                            error={editDuplicate ? "That name is already used." : undefined}
                            label="Category name"
                            labelHidden
                            value={editName}
                            onChange={setEditName}
                          />
                        </div>
                        <Button size="slim" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button
                          disabled={!editName.trim() || Boolean(editDuplicate)}
                          loading={savingEdit}
                          size="slim"
                          submit
                          variant="primary"
                        >
                          Save
                        </Button>
                      </form>
                    ) : (
                      <>
                        <span className="pc-row__main">
                          <strong>{category.name}</strong>
                          <small>{count ? `${count} product${count === 1 ? "" : "s"}` : "Not used yet"}</small>
                        </span>
                        <span className="pc-row__bar" aria-hidden>
                          <b style={{ width: `${(count / maxCount) * 100}%` }} />
                        </span>
                        <span className="pc-row__actions">
                          <Button
                            accessibilityLabel={`Rename ${category.name}`}
                            icon={EditIcon}
                            size="slim"
                            variant="tertiary"
                            onClick={() => startEdit(category)}
                          />
                          <Button
                            accessibilityLabel={`Delete ${category.name}`}
                            icon={DeleteIcon}
                            size="slim"
                            tone="critical"
                            variant="tertiary"
                            onClick={() => setDeleting(category)}
                          />
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && visible.length > 0 ? (
            <div className="iv-pager">
              <span>
                Showing{" "}
                <strong>
                  {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, visible.length)}
                </strong>{" "}
                of <strong>{visible.length}</strong>
                {visible.length !== categories.length ? ` (${categories.length} in total)` : ""} categor
                {visible.length === 1 ? "y" : "ies"}
              </span>
              <div className="iv-pager__controls">
                <div className="ex-perpage">
                  <Select
                    label="Per page"
                    labelInline
                    options={PAGE_SIZES.map((n) => ({ label: String(n), value: String(n) }))}
                    value={String(perPage)}
                    onChange={(v) => {
                      setPerPage(Number(v));
                      setPage(1);
                    }}
                  />
                </div>
                <Pagination
                  hasNext={safePage < totalPages}
                  hasPrevious={safePage > 1}
                  label={`${safePage} / ${totalPages}`}
                  onNext={() => setPage(safePage + 1)}
                  onPrevious={() => setPage(safePage - 1)}
                />
              </div>
            </div>
          ) : null}
        </section>

        <p className="pl-foot">
          Pick a category on the product&apos;s edit page under Classification. Deleting a category doesn&apos;t delete
          any products — they just become uncategorised.
        </p>
      </div>

      <Modal
        open={Boolean(deleting)}
        primaryAction={{
          content: "Delete category",
          destructive: true,
          loading: deleteBusy,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleting(null) }]}
        title={deleting ? `Delete “${deleting.name}”?` : "Delete category?"}
        onClose={() => setDeleting(null)}
      >
        <Modal.Section>
          <Text as="p">
            {deleting?.productCount
              ? `${deleting.productCount} product${deleting.productCount === 1 ? " uses" : "s use"} this category. ${
                  deleting.productCount === 1 ? "It" : "They"
                } will become uncategorised — the products themselves aren't touched.`
              : "No products use this category, so nothing else changes."}
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
