"use client";

import { Badge, Button, Icon, Modal, Pagination, SkeletonBodyText, Text, TextField } from "@shopify/polaris";
import { LocationIcon, SearchIcon } from "@shopify/polaris-icons";
import { Warehouse as WarehouseGlyph } from "lucide-react";
import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCountryLabel } from "@frog1/shared";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { listStock } from "@/lib/products-api";
import { cn } from "@/lib/utils";
import { archiveWarehouse, listWarehouses, restoreWarehouse } from "@/lib/warehouses-api";
import type { Warehouse } from "@/types/warehouse";

const PAGE_SIZE = 12;
const LOW_STOCK_MAX = 2;

type View = "active" | "archived";

interface WarehouseStats {
  units: number;
  lines: number;
  products: number;
  low: number;
  out: number;
}

const EMPTY_STATS: WarehouseStats = { units: 0, lines: 0, products: 0, low: 0, out: 0 };

function address(warehouse: Warehouse) {
  return [warehouse.street1, [warehouse.zip, warehouse.city].filter(Boolean).join(" "), formatCountryLabel(warehouse.countryCode)]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function WarehousesListPage() {
  const { showSuccess } = useToast();
  const [view, setView] = useState<View>("active");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ active: 0, archived: 0 });
  const [stats, setStats] = useState<Map<string, WarehouseStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Warehouse | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const [result, activeCount, archivedCount, stock] = await Promise.all([
        listWarehouses({
          page,
          perPage: PAGE_SIZE,
          search: debouncedQuery || undefined,
          archived: view === "archived",
          sortBy: "name",
          sortDir: "asc",
        }),
        listWarehouses({ perPage: 1, archived: false }),
        listWarehouses({ perPage: 1, archived: true }),
        listStock({ perPage: 1000 }),
      ]);
      if (request !== requestRef.current) return;

      const byWarehouse = new Map<string, WarehouseStats & { productIds: Set<string> }>();
      for (const row of stock.data) {
        const entry = byWarehouse.get(row.warehouseId) ?? { ...EMPTY_STATS, productIds: new Set<string>() };
        const qty = Number(row.quantity) || 0;
        entry.units += qty;
        entry.lines += 1;
        entry.productIds.add(row.productId);
        if (qty <= 0) entry.out += 1;
        else if (qty <= LOW_STOCK_MAX) entry.low += 1;
        byWarehouse.set(row.warehouseId, entry);
      }
      setStats(
        new Map(
          [...byWarehouse].map(([id, { productIds, ...rest }]) => [id, { ...rest, products: productIds.size }]),
        ),
      );
      setWarehouses(result.data);
      setTotal(result.meta.total);
      setCounts({ active: activeCount.meta.total, archived: archivedCount.meta.total });
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load warehouses");
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [debouncedQuery, page, view]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleArchiveToggle() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (view === "archived") {
        await restoreWarehouse(confirm.id);
        showSuccess(`Restored ${confirm.name}`);
      } else {
        await archiveWarehouse(confirm.id);
        showSuccess(`Archived ${confirm.name}`);
      }
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the warehouse");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const totalUnits = [...stats.values()].reduce((sum, s) => sum + s.units, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const first = loading && !loaded;
  const confirmStats = confirm ? stats.get(confirm.id) ?? EMPTY_STATS : EMPTY_STATS;

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      fullWidth
      primaryAction={{ content: "Add warehouse", url: "/dashboard/inventory/warehouses/new" }}
      secondaryActions={[{ content: "Stock overview", url: "/dashboard/inventory" }]}
      subtitle="Where your stock is kept. Open a warehouse to see everything in it."
      title="Warehouses"
    >
      <div className="pl wh">
        {error ? <div className="ac-error">{error}</div> : null}

        <div className="wh-toolbar">
          <div className="iv-filters">
            <button
              className={cn("iv-filter", view === "active" && "is-active")}
              type="button"
              onClick={() => {
                setView("active");
                setPage(1);
              }}
            >
              Active <span>{counts.active}</span>
            </button>
            <button
              className={cn("iv-filter", view === "archived" && "is-active")}
              type="button"
              onClick={() => {
                setView("archived");
                setPage(1);
              }}
            >
              Archived <span>{counts.archived}</span>
            </button>
          </div>
          <div className="wh-toolbar__search">
            <TextField
              autoComplete="off"
              clearButton
              label="Search warehouses"
              labelHidden
              placeholder="Search by name, code or city"
              prefix={<Icon source={SearchIcon} />}
              value={query}
              onChange={setQuery}
              onClearButtonClick={() => setQuery("")}
            />
          </div>
        </div>

        {first ? (
          <div className="wh-grid">
            {[0, 1, 2].map((i) => (
              <div className="wh-card" key={i}>
                <SkeletonBodyText lines={5} />
              </div>
            ))}
          </div>
        ) : warehouses.length === 0 ? (
          <div className="ex-surface">
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <WarehouseGlyph aria-hidden size={20} />
              </span>
              <strong>
                {debouncedQuery
                  ? `No warehouses match “${debouncedQuery}”`
                  : view === "archived"
                    ? "No archived warehouses"
                    : "Add your first warehouse"}
              </strong>
              <p>
                {debouncedQuery
                  ? "Try a different name, code or city."
                  : view === "archived"
                    ? "Archived warehouses show up here and can be restored any time."
                    : "Warehouses hold stock for your goods products."}
              </p>
              {!debouncedQuery && view === "active" ? (
                <Button url="/dashboard/inventory/warehouses/new" variant="primary">
                  Add warehouse
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className={cn("wh-grid", loading && "st-dim")}>
            {warehouses.map((warehouse) => {
              const s = stats.get(warehouse.id) ?? EMPTY_STATS;
              const share = totalUnits > 0 ? (s.units / totalUnits) * 100 : 0;
              const url = `/dashboard/inventory/warehouses/${warehouse.id}`;
              const where = address(warehouse);
              return (
                <article className={cn("wh-card", view === "archived" && "is-archived")} key={warehouse.id}>
                  <NextLink className="wh-card__head" href={url}>
                    <span className="wh-card__icon" aria-hidden>
                      <WarehouseGlyph size={20} />
                    </span>
                    <span className="wh-card__title">
                      <strong>{warehouse.name}</strong>
                      <span>
                        <Badge>{warehouse.code}</Badge>
                        {view === "archived" ? <Badge tone="critical">Archived</Badge> : null}
                        {view === "active" && !warehouse.isActive ? <Badge tone="attention">Inactive</Badge> : null}
                      </span>
                    </span>
                  </NextLink>

                  <p className={cn("wh-card__address", !where && "is-empty")}>
                    <Icon source={LocationIcon} />
                    {where || "No address yet"}
                  </p>

                  <div className="wh-card__stats">
                    <div>
                      <strong>{s.units.toLocaleString()}</strong>
                      <small>units</small>
                    </div>
                    <div>
                      <strong>{s.products}</strong>
                      <small>products</small>
                    </div>
                    <div className={cn(s.low + s.out > 0 && "is-alert")}>
                      <strong>{s.low + s.out}</strong>
                      <small>low / out</small>
                    </div>
                  </div>

                  {view === "active" && totalUnits > 0 ? (
                    <div className="wh-card__share">
                      <span className="wh-card__bar">
                        <b style={{ width: `${share}%` }} />
                      </span>
                      <small>{share.toFixed(0)}% of all stock</small>
                    </div>
                  ) : null}

                  <div className="wh-card__actions">
                    <Button size="slim" url={url} variant="primary">
                      View stock
                    </Button>
                    <Button size="slim" url={`${url}/edit`}>
                      Edit
                    </Button>
                    <span className="wh-card__spacer" />
                    <Button
                      size="slim"
                      tone={view === "archived" ? undefined : "critical"}
                      variant="tertiary"
                      onClick={() => setConfirm(warehouse)}
                    >
                      {view === "archived" ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!first && total > 0 ? (
          <div className="ex-surface">
            <div className="iv-pager">
              <span>
                Showing{" "}
                <strong>
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)}
                </strong>{" "}
                of <strong>{total}</strong> warehouse{total === 1 ? "" : "s"}
              </span>
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
      </div>

      <Modal
        open={Boolean(confirm)}
        primaryAction={{
          content: view === "archived" ? "Restore warehouse" : "Archive warehouse",
          destructive: view !== "archived",
          loading: busy,
          onAction: () => void handleArchiveToggle(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setConfirm(null) }]}
        title={confirm ? `${view === "archived" ? "Restore" : "Archive"} ${confirm.name}?` : "Warehouse"}
        onClose={() => setConfirm(null)}
      >
        <Modal.Section>
          <Text as="p">
            {view === "archived"
              ? "It will be available again for stock, transfers and new documents."
              : confirmStats.units > 0
                ? `It still holds ${confirmStats.units} unit${confirmStats.units === 1 ? "" : "s"} across ${confirmStats.products} product${confirmStats.products === 1 ? "" : "s"}. Archived warehouses are hidden from stock lists, so move the stock out first if you still need it.`
                : "It will be hidden from stock lists and pickers. You can restore it any time."}
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
