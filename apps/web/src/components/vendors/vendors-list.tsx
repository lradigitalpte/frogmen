"use client";

import { Badge, Button, Icon, Modal, Pagination, Select, SkeletonBodyText, Text, TextField } from "@shopify/polaris";
import { SearchIcon, StoreIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { formatMoney } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { archiveVendor, listVendors, restoreVendor } from "@/lib/vendors-api";
import type { ListVendorsParams, Vendor, VendorSummary } from "@/types/vendor";

type TabId = "all" | "company" | "individual" | "archived";
type SortMode = "newest" | "name_asc" | "name_desc" | "oldest";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "all", label: "All" },
  { id: "company", label: "Companies" },
  { id: "individual", label: "Individuals" },
  { id: "archived", label: "Archived" },
];

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Newest first", value: "newest" },
  { label: "Name A–Z", value: "name_asc" },
  { label: "Name Z–A", value: "name_desc" },
  { label: "Oldest first", value: "oldest" },
];

const PAGE_SIZES = [16, 25, 50, 100];
const EMPTY_SUMMARY: VendorSummary = {
  all: 0,
  company: 0,
  individual: 0,
  archived: 0,
  withOpenOrders: 0,
  openOrders: 0,
  spendBase: "0",
  spendLast90Base: "0",
};

function sortParams(sort: SortMode): Pick<ListVendorsParams, "sortBy" | "sortDir"> {
  if (sort === "name_asc") return { sortBy: "name", sortDir: "asc" };
  if (sort === "name_desc") return { sortBy: "name", sortDir: "desc" };
  if (sort === "oldest") return { sortBy: "createdAt", sortDir: "asc" };
  return { sortBy: "createdAt", sortDir: "desc" };
}

function plural(n: number, word: string, many = `${word}s`) {
  return `${n.toLocaleString()} ${n === 1 ? word : many}`;
}

function location(vendor: Vendor) {
  return [vendor.city, vendor.stateCode, vendor.countryCode].filter(Boolean).join(", ");
}

function initials(name: string) {
  const parts = name.trim().split(/ +/).filter(Boolean);
  return ((parts[0]?.charAt(0) ?? "") + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase() || "?";
}

export function VendorsListPage() {
  const { showSuccess, showError } = useToast();
  const { baseCurrencyCode } = useOrgCurrency();
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(16);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<VendorSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<Vendor | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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
      const result = await listVendors({
        page,
        perPage,
        search: debouncedQuery || undefined,
        archived: tab === "archived",
        accountType: tab === "company" || tab === "individual" ? tab : undefined,
        ...sortParams(sort),
      });
      if (request !== requestRef.current) return;
      setVendors(result.data);
      setTotal(result.meta.total);
      setSummary(result.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load vendors");
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [debouncedQuery, page, perPage, sort, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseTab(next: TabId) {
    setTab(next);
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setTab("all");
    setPage(1);
  }

  async function doArchive(vendor: Vendor) {
    setBusyId(vendor.id);
    try {
      await archiveVendor(vendor.id);
      showSuccess(`${vendor.name} archived`);
      setArchiving(null);
      void load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not archive vendor");
    } finally {
      setBusyId(null);
    }
  }

  async function doRestore(vendor: Vendor) {
    setBusyId(vendor.id);
    try {
      await restoreVendor(vendor.id);
      showSuccess(`${vendor.name} restored`);
      void load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not restore vendor");
    } finally {
      setBusyId(null);
    }
  }

  const first = loading && !loaded;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const filtersActive = tab !== "all" || Boolean(debouncedQuery);
  const archivedView = tab === "archived";
  const counts: Record<TabId, number> = {
    all: summary.all,
    company: summary.company,
    individual: summary.individual,
    archived: summary.archived,
  };
  const typed = summary.company + summary.individual;

  return (
    <AppPage
      fullWidth
      primaryAction={{ content: "Add vendor", url: "/dashboard/purchasing/vendors/new" }}
      secondaryActions={[
        { content: "Purchase orders", url: "/dashboard/purchasing/orders" },
        { content: "Receipts", url: "/dashboard/purchasing/receipts" },
      ]}
      subtitle="The companies and people you buy stock from."
      title="Vendors"
    >
      <div className="pl vd">
        {error ? <div className="ac-error">{error}</div> : null}

        <section className={cn("pl-hero", loading && loaded && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Active vendors</span>
            <strong className="pl-hero__value">{first ? "…" : summary.all.toLocaleString()}</strong>
            <span className="pl-hero__period">
              {first
                ? "Loading…"
                : summary.all === 0
                  ? "Add a vendor to start ordering stock"
                  : `${plural(summary.company, "company", "companies")} · ${plural(summary.individual, "individual")}`}
            </span>
          </div>

          <div className="pl-hero__tiles">
            <NextLink className="ac-tile is-link" href="/dashboard/purchasing/orders">
              <span>On order</span>
              <strong>{summary.withOpenOrders}</strong>
              <small>
                {summary.openOrders > 0
                  ? `${plural(summary.withOpenOrders, "vendor")} · ${plural(summary.openOrders, "open PO")}`
                  : "No goods waiting"}
              </small>
            </NextLink>
            <div className="ac-tile">
              <span>Spent · last 90 days</span>
              <strong>{formatMoney(summary.spendLast90Base, baseCurrencyCode)}</strong>
              <small>Confirmed purchase orders</small>
            </div>
            <button className="ac-tile is-link" type="button" onClick={() => chooseTab("archived")}>
              <span>Archived</span>
              <strong>{summary.archived}</strong>
              <small>{summary.archived > 0 ? "Hidden from new orders" : "None archived"}</small>
            </button>
          </div>

          {typed > 0 ? (
            <div className="pl-hero__bar">
              <div className="st-split">
                <b className="is-ok" style={{ width: `${(summary.company / typed) * 100}%` }} />
                <b className="is-muted" style={{ width: `${(summary.individual / typed) * 100}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="st-dot is-ok" /> Companies {summary.company}
                </span>
                <span>
                  <i className="st-dot is-muted" /> Individuals {summary.individual}
                </span>
                <span>All-time spend {formatMoney(summary.spendBase, baseCurrencyCode)}</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters">
              {TABS.map((t) => (
                <button
                  className={cn("iv-filter", tab === t.id && "is-active")}
                  key={t.id}
                  type="button"
                  onClick={() => chooseTab(t.id)}
                >
                  {t.label} <span>{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search vendors"
                  labelHidden
                  placeholder="Name, contact, email, phone or city"
                  prefix={<Icon source={SearchIcon} />}
                  value={query}
                  onChange={setQuery}
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
              <Select
                label="Sort"
                labelInline
                options={SORT_OPTIONS}
                value={sort}
                onChange={(value) => {
                  setSort(value as SortMode);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={8} />
            </div>
          ) : vendors.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={StoreIcon} />
              </span>
              <strong>
                {debouncedQuery
                  ? `No vendors match “${debouncedQuery}”`
                  : summary.all === 0 && !archivedView
                    ? "No vendors yet"
                    : archivedView
                      ? "No archived vendors"
                      : "Nothing in this view"}
              </strong>
              <p>
                {summary.all === 0 && !archivedView
                  ? "Add the suppliers you buy from, then raise purchase orders against them."
                  : "Try another search or filter."}
              </p>
              {summary.all === 0 && !archivedView && !debouncedQuery ? (
                <Button url="/dashboard/purchasing/vendors/new" variant="primary">
                  Add vendor
                </Button>
              ) : filtersActive ? (
                <Button onClick={clearFilters}>Show all vendors</Button>
              ) : null}
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              <li className="vd-row is-head" aria-hidden>
                <span>Vendor</span>
                <span>Contact</span>
                <span>Location</span>
                <span>Purchasing</span>
                <span>Spend</span>
                <span />
              </li>
              {vendors.map((vendor) => {
                const url = `/dashboard/purchasing/vendors/${vendor.id}`;
                const stats = vendor.stats;
                const place = location(vendor);
                const phone = vendor.phone || vendor.mobile;
                const company = vendor.accountType === "company";
                return (
                  <li className={cn("vd-row", archivedView && "is-muted")} key={vendor.id}>
                    <NextLink className="vd-row__name" href={url}>
                      <i aria-hidden className={cn(!company && "is-person")}>
                        {initials(vendor.name)}
                      </i>
                      <span>
                        <strong>{vendor.name}</strong>
                        <small>
                          {company ? "Company" : "Individual"}
                          {vendor.contactName ? ` · ${vendor.contactName}` : ""}
                          {vendor.reference ? ` · Ref ${vendor.reference}` : ""}
                        </small>
                      </span>
                    </NextLink>

                    <span className="vd-row__contact">
                      {vendor.email ? <a href={`mailto:${vendor.email}`}>{vendor.email}</a> : null}
                      {phone ? <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`}>{phone}</a> : null}
                      {!vendor.email && !phone ? (
                        <NextLink className="vd-row__missing" href={`${url}/edit`}>
                          Add contact details
                        </NextLink>
                      ) : null}
                    </span>

                    <span className="vd-row__place">{place || <span className="vd-row__none">—</span>}</span>

                    <span className="vd-row__activity">
                      {stats && stats.orderCount > 0 ? (
                        <>
                          <span>
                            {plural(stats.orderCount, "order")}
                            {stats.openOrders > 0 ? (
                              <>
                                {" "}
                                <Badge tone="attention">{`${stats.openOrders} on order`}</Badge>
                              </>
                            ) : null}
                          </span>
                          {stats.lastOrderDate ? <small>Last {formatAppDate(stats.lastOrderDate)}</small> : null}
                        </>
                      ) : (
                        <span className="vd-row__none">No orders yet</span>
                      )}
                    </span>

                    <span className="vd-row__spend">
                      {stats && Number(stats.spendBase) > 0 ? (
                        <strong>{formatMoney(stats.spendBase, baseCurrencyCode)}</strong>
                      ) : (
                        <span className="vd-row__none">—</span>
                      )}
                    </span>

                    <span className="vd-row__actions">
                      {archivedView ? (
                        <Button loading={busyId === vendor.id} size="slim" onClick={() => void doRestore(vendor)}>
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button size="slim" url={`/dashboard/purchasing/orders/new?vendor=${vendor.id}`}>
                            New PO
                          </Button>
                          <Button size="slim" variant="plain" onClick={() => setArchiving(vendor)}>
                            Archive
                          </Button>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {!first && total > 0 ? (
            <div className="iv-pager">
              <span>
                Showing{" "}
                <strong>
                  {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, total)}
                </strong>{" "}
                of <strong>{total}</strong> vendor{total === 1 ? "" : "s"}
                {filtersActive ? (
                  <>
                    {" "}
                    ·{" "}
                    <button className="st-link" type="button" onClick={clearFilters}>
                      Show all
                    </button>
                  </>
                ) : null}
              </span>
              <div className="iv-pager__controls">
                <div className="ex-perpage">
                  <Select
                    label="Rows per page"
                    labelInline
                    options={PAGE_SIZES.map((n) => ({ label: String(n), value: String(n) }))}
                    value={String(perPage)}
                    onChange={(value) => {
                      setPerPage(Number(value));
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
          Spend is the total of confirmed purchase orders, converted to {baseCurrencyCode}. Archiving hides a vendor from
          new orders but keeps its history.
        </p>
      </div>

      <Modal
        open={Boolean(archiving)}
        title={archiving ? `Archive ${archiving.name}?` : "Archive vendor"}
        primaryAction={{
          content: "Archive vendor",
          destructive: true,
          loading: Boolean(archiving && busyId === archiving.id),
          onAction: () => archiving && void doArchive(archiving),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setArchiving(null) }]}
        onClose={() => setArchiving(null)}
      >
        <Modal.Section>
          <Text as="p">
            {archiving?.stats?.openOrders
              ? `${archiving.name} still has ${plural(archiving.stats.openOrders, "purchase order")} waiting on goods. Those orders stay open and can still be received.`
              : "The vendor won't appear when you create new purchase orders."}{" "}
            Past orders and receipts are kept, and you can restore the vendor from the Archived tab at any time.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
