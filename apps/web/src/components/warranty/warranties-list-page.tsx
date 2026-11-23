"use client";

import { Badge, Button, Icon, Pagination, Select, SkeletonBodyText, TextField } from "@shopify/polaris";
import { SearchIcon, ShieldCheckMarkIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  listWarranties,
  type WarrantyRegistration,
  type WarrantySort,
  type WarrantySummary,
} from "@/lib/warranty-api";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { ConfirmDeliveryModal } from "./confirm-delivery-modal";

type Status = WarrantyRegistration["status"];
type FilterId = "all" | "active" | "expiring" | "pending_delivery" | "expired" | "voided";

const FILTERS: Array<{ id: FilterId; label: string; key: keyof WarrantySummary; alert?: boolean }> = [
  { id: "active", label: "Active", key: "active" },
  { id: "expiring", label: "Expiring in 30 days", key: "expiringSoon", alert: true },
  { id: "pending_delivery", label: "Pending delivery", key: "pendingDelivery", alert: true },
  { id: "expired", label: "Expired", key: "expired" },
  { id: "voided", label: "Voided", key: "voided" },
  { id: "all", label: "All", key: "all" },
];

const SORT_OPTIONS: Array<{ label: string; value: WarrantySort }> = [
  { label: "Recently sold", value: "recent" },
  { label: "Ending soonest", value: "ending_soon" },
  { label: "Ending last", value: "ending_late" },
];

const PAGE_SIZES = [10, 25, 50, 100];
const EXPIRING_DAYS = 30;
const EMPTY_SUMMARY: WarrantySummary = {
  all: 0,
  active: 0,
  expiringSoon: 0,
  pendingDelivery: 0,
  expired: 0,
  voided: 0,
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return formatAppDate(value) || "—";
}

function statusTone(status: Status, daysLeft: number): "success" | "warning" | "critical" | "attention" | undefined {
  if (status === "active") return daysLeft <= EXPIRING_DAYS ? "warning" : "success";
  if (status === "expired") return "critical";
  if (status === "pending_delivery") return "attention";
  return undefined;
}

function statusLabel(status: Status, daysLeft: number) {
  if (status === "pending_delivery") return "Pending delivery";
  if (status === "active") return daysLeft <= EXPIRING_DAYS ? "Expiring soon" : "Active";
  if (status === "expired") return "Expired";
  return "Voided";
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

/** Human time-left text plus a level for colouring. */
function timeLeft(w: WarrantyRegistration): { text: string; sub?: string; level: "ok" | "low" | "out" | "na" } {
  if (w.status === "voided") return { text: "Voided", level: "na" };
  if (w.status === "pending_delivery") return { text: "Not started", sub: "Starts on delivery", level: "na" };
  const d = w.daysLeft;
  if (w.status === "expired" || d < 0) {
    const ago = Math.abs(d);
    return { text: "Expired", sub: ago === 0 ? "today" : `${plural(ago, "day")} ago`, level: "out" };
  }
  if (d === 0) return { text: "Ends today", level: "low" };
  const months = Math.floor(d / 30.44);
  const text = d < 60 ? `${plural(d, "day")} left` : `${plural(months, "month")} left`;
  return { text, sub: d < 60 ? undefined : `${d.toLocaleString()} days`, level: d <= EXPIRING_DAYS ? "low" : "ok" };
}

/** Share of the coverage period already used, 0–100. */
function usedPercent(w: WarrantyRegistration) {
  if (w.status === "expired") return 100;
  const start = w.startsAt ?? w.soldAt;
  if (!start || !w.endsAt || w.status !== "active") return 0;
  const s = new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime();
  const e = new Date(`${w.endsAt.slice(0, 10)}T00:00:00Z`).getTime();
  if (e <= s) return 100;
  return Math.min(100, Math.max(0, ((Date.now() - s) / (e - s)) * 100));
}

export function WarrantiesListPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("active");
  const [sort, setSort] = useState<WarrantySort>("recent");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [warranties, setWarranties] = useState<WarrantyRegistration[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<WarrantySummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<WarrantyRegistration | null>(null);
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
      const result = await listWarranties({
        search: debouncedQuery || undefined,
        status: filter === "all" ? undefined : filter === "expiring" ? "active" : filter,
        expiringSoon: filter === "expiring" || undefined,
        sort,
        page,
        perPage,
      });
      if (request !== requestRef.current) return;
      setWarranties(result.data);
      setTotal(result.meta.total);
      setSummary(result.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load warranties");
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [debouncedQuery, filter, page, perPage, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseFilter(next: FilterId) {
    setFilter(next);
    // Expiring soonest first is what you want when looking at what's about to lapse.
    if (next === "expiring") setSort("ending_soon");
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setFilter("all");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const first = loading && !loaded;
  const filtersActive = Boolean(debouncedQuery) || filter !== "active";
  const covered = summary.active + summary.expired;
  const healthy = summary.active - summary.expiringSoon;

  return (
    <AppPage
      fullWidth
      primaryAction={{ content: "Register warranty", url: "/dashboard/warranty/new" }}
      secondaryActions={[{ content: "Policies", url: "/dashboard/warranty/policies" }]}
      subtitle="Every product under warranty, who has it and how long it has left."
      title="Warranty"
    >
      <div className="pl wr">
        {error ? <div className="ac-error">{error}</div> : null}

        <section className={cn("pl-hero", loading && loaded && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Under active warranty</span>
            <strong className="pl-hero__value">{first ? "…" : summary.active.toLocaleString()}</strong>
            <span className="pl-hero__period">
              {first
                ? "Loading…"
                : `${plural(summary.all, "registration")} in total${debouncedQuery ? ` matching “${debouncedQuery}”` : ""}`}
            </span>
          </div>

          <div className="pl-hero__tiles">
            <button
              className={cn("ac-tile is-link", summary.expiringSoon > 0 && "is-alert")}
              type="button"
              onClick={() => chooseFilter("expiring")}
            >
              <span>Expiring in {EXPIRING_DAYS} days</span>
              <strong>{summary.expiringSoon}</strong>
              <small>{summary.expiringSoon > 0 ? "Reach out to renew" : "Nothing about to lapse"}</small>
            </button>
            <button
              className={cn("ac-tile is-link", summary.pendingDelivery > 0 && "is-alert")}
              type="button"
              onClick={() => chooseFilter("pending_delivery")}
            >
              <span>Pending delivery</span>
              <strong>{summary.pendingDelivery}</strong>
              <small>{summary.pendingDelivery > 0 ? "Confirm to start coverage" : "All started"}</small>
            </button>
            <button className="ac-tile is-link" type="button" onClick={() => chooseFilter("expired")}>
              <span>Expired</span>
              <strong>{summary.expired}</strong>
              <small>Coverage has ended</small>
            </button>
          </div>

          {covered > 0 ? (
            <div className="pl-hero__bar">
              <div className="st-split">
                <b className="is-ok" style={{ width: `${(healthy / covered) * 100}%` }} />
                <b className="is-low" style={{ width: `${(summary.expiringSoon / covered) * 100}%` }} />
                <b className="is-out" style={{ width: `${(summary.expired / covered) * 100}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="st-dot is-ok" /> Active {healthy}
                </span>
                <span>
                  <i className="st-dot is-low" /> Expiring soon {summary.expiringSoon}
                </span>
                <span>
                  <i className="st-dot is-out" /> Expired {summary.expired}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters">
              {FILTERS.map((f) => {
                const count = summary[f.key];
                return (
                  <button
                    className={cn("iv-filter", filter === f.id && "is-active", f.alert && count > 0 && "is-alert")}
                    key={f.id}
                    type="button"
                    onClick={() => chooseFilter(f.id)}
                  >
                    {f.label} <span>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search warranties"
                  labelHidden
                  placeholder="Search product, serial, customer or policy"
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
                  setSort(value as WarrantySort);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={8} />
            </div>
          ) : warranties.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={ShieldCheckMarkIcon} />
              </span>
              <strong>
                {debouncedQuery
                  ? `No warranties match “${debouncedQuery}”`
                  : filter === "expiring"
                    ? "Nothing expires in the next 30 days"
                    : filter === "pending_delivery"
                      ? "No warranties waiting on delivery"
                      : summary.all === 0
                        ? "No warranties yet"
                        : "No warranties in this view"}
              </strong>
              <p>
                {summary.all === 0
                  ? "Warranties are created when invoices post. You can also register coverage for past sales."
                  : "Try another search or status."}
              </p>
              {summary.all === 0 ? (
                <Button url="/dashboard/warranty/new" variant="primary">
                  Register warranty
                </Button>
              ) : filtersActive ? (
                <Button onClick={clearFilters}>Show all warranties</Button>
              ) : null}
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              <li className="wr-row is-head" aria-hidden>
                <span />
                <span>Product</span>
                <span>Customer</span>
                <span>Policy</span>
                <span>Coverage</span>
                <span>Time left</span>
                <span />
              </li>
              {warranties.map((w) => {
                const url = `/dashboard/warranty/${w.id}`;
                const left = timeLeft(w);
                const used = usedPercent(w);
                const tone = statusTone(w.status, w.daysLeft);
                const customer = w.displayCustomerName || "—";
                return (
                  <li className={cn("wr-row", w.status === "voided" && "is-muted")} key={w.id}>
                    <NextLink aria-hidden className="wr-icon" href={url} tabIndex={-1}>
                      <Icon source={ShieldCheckMarkIcon} />
                    </NextLink>

                    <NextLink className="wr-product" href={url}>
                      <strong>{w.displayProductName}</strong>
                      <span>
                        {w.serialNumber ? <code>SN {w.serialNumber}</code> : null}
                        {w.quantity > 1 ? <em>× {w.quantity}</em> : null}
                        {w.invoiceNumber ? <em>{w.invoiceNumber}</em> : w.source === "manual" ? <em>Manual</em> : null}
                      </span>
                    </NextLink>

                    <span className="wr-customer">
                      <i aria-hidden>{customer.charAt(0).toUpperCase()}</i>
                      {w.customerId ? (
                        <NextLink href={`/dashboard/customers/${w.customerId}`}>{customer}</NextLink>
                      ) : (
                        <span>{customer}</span>
                      )}
                    </span>

                    <span className="wr-policy">
                      <strong>{w.policy?.name ?? "No policy"}</strong>
                      {w.policy ? <small>{plural(w.policy.durationMonths, "month")}</small> : null}
                    </span>

                    <span className="wr-coverage">
                      <span className="wr-dates">
                        <span>
                          <small>Sold</small>
                          {formatDate(w.soldAt)}
                        </span>
                        <span>
                          <small>Ends</small>
                          {w.status === "pending_delivery" ? "After delivery" : formatDate(w.endsAt)}
                        </span>
                      </span>
                      <span className={cn("wr-bar", `is-${left.level}`)}>
                        <b style={{ width: `${used}%` }} />
                      </span>
                    </span>

                    <span className={cn("wr-left", `is-${left.level}`)}>
                      <strong>{left.text}</strong>
                      {left.sub ? <small>{left.sub}</small> : null}
                      <Badge tone={tone}>{statusLabel(w.status, w.daysLeft)}</Badge>
                    </span>

                    <span className="wr-actions">
                      {w.status === "pending_delivery" ? (
                        <Button size="slim" variant="primary" onClick={() => setDeliveryFor(w)}>
                          Confirm delivery
                        </Button>
                      ) : w.status === "voided" ? (
                        <Button size="slim" onClick={() => router.push(url)}>
                          View
                        </Button>
                      ) : (
                        <Button size="slim" onClick={() => setDeliveryFor(w)}>
                          Edit delivery
                        </Button>
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
                of <strong>{total}</strong> warrant{total === 1 ? "y" : "ies"}
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
          Coverage starts on delivery and runs for the policy length. “Expiring soon” means it ends within {EXPIRING_DAYS}{" "}
          days.
        </p>
      </div>

      <ConfirmDeliveryModal
        open={Boolean(deliveryFor)}
        warranty={deliveryFor}
        onClose={() => setDeliveryFor(null)}
        onSuccess={() => void load()}
      />
    </AppPage>
  );
}
