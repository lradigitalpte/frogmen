"use client";

import { Banner, Button, Icon, Modal, Pagination, Select, SkeletonBodyText, Text, TextField } from "@shopify/polaris";
import { DeleteIcon, EditIcon, LockIcon, PlusIcon, SearchIcon, ProductIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  archiveProductTag,
  createProductTag,
  listProductTags,
  updateProductTag,
} from "@/lib/product-tags-api";
import { cn } from "@/lib/utils";
import type { ProductTag } from "@/types/product-tag";
import { isClassificationTag } from "@/lib/product-tags";

type SortMode = "name" | "most" | "empty";
type UsageFilter = "all" | "used" | "unused" | "auto";

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

export function ProductTagsPage() {
  const { showSuccess } = useToast();
  const [tags, setTags] = useState<ProductTag[]>([]);
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

  const [deleting, setDeleting] = useState<ProductTag | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Load everything once; filter locally so typing is instant.
  const load = useCallback(async () => {
    try {
      // Fetch every page so counts and search cover the whole list, not just the first 200.
      const first = await listProductTags({ perPage: FETCH_PAGE, page: 1 });
      let all = first.data;
      for (let p = 2; p <= first.meta.totalPages; p += 1) {
        const next = await listProductTags({ perPage: FETCH_PAGE, page: p });
        all = all.concat(next.data);
      }
      setTags(all);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const nameTaken = (name: string, exceptId?: string) =>
    tags.some((c) => c.id !== exceptId && normalized(c.name) === normalized(name));

  const newNameDuplicate = newName.trim() ? nameTaken(newName) : false;
  const editDuplicate = editingId && editName.trim() ? nameTaken(editName, editingId) : false;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const count = (c: ProductTag) => c.productCount ?? 0;
    const list = tags
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .filter((c) =>
        usage === "all"
          ? true
          : usage === "auto"
            ? isClassificationTag(c.name)
            : usage === "used"
              ? count(c) > 0
              : count(c) === 0,
      );
    return [...list].sort((a, b) => {
      if (sort === "most") return count(b) - count(a) || a.name.localeCompare(b.name);
      if (sort === "empty") return count(a) - count(b) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [tags, search, sort, usage]);

  const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageItems = visible.slice((safePage - 1) * perPage, safePage * perPage);

  const totalProducts = tags.reduce((sum, c) => sum + (c.productCount ?? 0), 0);
  const unused = tags.filter((c) => !c.productCount).length;
  const maxCount = Math.max(1, ...tags.map((c) => c.productCount ?? 0));
  const largest = [...tags].sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0))[0];

  async function handleCreate() {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name || newNameDuplicate) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createProductTag(name);
      setNewName("");
      showSuccess(`Added “${created.name}”`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(category: ProductTag) {
    setEditingId(category.id);
    setEditName(category.name);
  }

  async function handleSaveEdit() {
    const category = tags.find((c) => c.id === editingId);
    const name = editName.trim().replace(/\s+/g, " ");
    if (!category || !name || editDuplicate) return;
    if (name === category.name) {
      setEditingId(null);
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      await updateProductTag(category.id, name);
      setEditingId(null);
      showSuccess(`Renamed to “${name}”`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename tag");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await archiveProductTag(deleting.id);
      showSuccess(`Deleted “${deleting.name}”`);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tag");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      secondaryActions={[
        { content: "Products", url: "/dashboard/inventory/products" },
        { content: "Categories", url: "/dashboard/inventory/product-tags" },
      ]}
      subtitle="Labels you can put on products — a product can have as many tags as you like."
      title="Product tags"
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
            <small>Tags</small>
            <strong>{loading ? "…" : tags.length}</strong>
          </div>
          <div className="pc-stat">
            <small>Tag uses on products</small>
            <strong>{loading ? "…" : totalProducts}</strong>
          </div>
          <div className="pc-stat">
            <small>Unused tags</small>
            <strong>{loading ? "…" : unused}</strong>
          </div>
          <div className="pc-stat">
            <small>Most used</small>
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
              error={newNameDuplicate ? "You already have a tag with this name." : undefined}
              label="New tag"
              labelHidden
              placeholder="New tag — e.g. thruster, battery, spare, demo unit"
              value={newName}
              onChange={setNewName}
            />
          </div>
          <Button disabled={!newName.trim() || newNameDuplicate} loading={creating} submit variant="primary">
            Add tag
          </Button>
        </form>

        {/* List */}
        <section className="ex-surface">
          <div className="pc-toolbar">
            <div className="pc-toolbar__search">
              <TextField
                autoComplete="off"
                clearButton
                label="Search tags"
                labelHidden
                placeholder="Search tags"
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
                  { id: "all", label: "All", n: tags.length },
                  { id: "used", label: "In use", n: tags.length - unused },
                  { id: "unused", label: "Unused", n: unused },
                  { id: "auto", label: "Automatic", n: tags.filter((c) => isClassificationTag(c.name)).length },
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
                <Icon source={ProductIcon} />
              </span>
              <strong>
                {search
                  ? `No tags match “${search}”`
                  : usage === "used"
                    ? "No tags are in use yet"
                    : usage === "unused"
                      ? "Every tag is in use"
                      : usage === "auto"
                        ? "No automatic tags"
                        : "No tags yet"}
              </strong>
              <p>
                {search
                  ? "Check the spelling, or add it as a new tag."
                  : "Add your first tag above, then pick it on products."}
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
                const automatic = isClassificationTag(category.name);
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
                            label="Tag name"
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
                          <small>
                            {count ? `${count} product${count === 1 ? "" : "s"}` : "Not used yet"}
                            {automatic ? " · Automatic" : ""}
                          </small>
                        </span>
                        <span className="pc-row__bar" aria-hidden>
                          <b style={{ width: `${(count / maxCount) * 100}%` }} />
                        </span>
                        <span className="pc-row__actions">
                          {automatic ? (
                            <span className="pc-row__lock" title="Set automatically from product settings">
                              <Icon source={LockIcon} />
                            </span>
                          ) : (
                          <>
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
                          </>
                          )}
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
                {visible.length !== tags.length ? ` (${tags.length} in total)` : ""} tag
                {visible.length === 1 ? "" : "s"}
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
          Add tags on the product&apos;s edit page under Classification. Renaming a tag updates every product that has it;
          deleting a tag removes it from those products. Automatic tags come from product settings and can&apos;t be edited here.
        </p>
      </div>

      <Modal
        open={Boolean(deleting)}
        primaryAction={{
          content: "Delete tag",
          destructive: true,
          loading: deleteBusy,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleting(null) }]}
        title={deleting ? `Delete “${deleting.name}”?` : "Delete tag?"}
        onClose={() => setDeleting(null)}
      >
        <Modal.Section>
          <Text as="p">
            {deleting?.productCount
              ? `${deleting.productCount} product${deleting.productCount === 1 ? " has" : "s have"} this tag. It will be removed from ${
                  deleting.productCount === 1 ? "that product" : "them"
                } — nothing else changes.`
              : "No products have this tag, so nothing else changes."}
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
