"use client";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  EmptyState,
  Icon,
  IndexTable,
  InlineStack,
  Pagination,
  Select,
  SkeletonBodyText,
  SkeletonThumbnail,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  AppsIcon,
  CalendarIcon,
  CreditCardIcon,
  EmailIcon,
  GlobeIcon,
  IdentityCardIcon,
  ListBulletedIcon,
  LocationIcon,
  PhoneIcon,
  SearchIcon,
} from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { sumByCurrency } from "@/components/customers/customer-format";
import { MultiCurrencyAmount } from "@/components/customers/multi-currency-amount";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import {
  archiveCustomer,
  getCustomerActivity,
  getCustomerStats,
  listCustomers,
  restoreCustomer,
  type CustomerActivity,
} from "@/lib/customers-api";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Customer, CustomerStats, CustomerTab, ListCustomersParams } from "@/types/customer";

const PER_PAGE = 12;
const VIEW_STORAGE_KEY = "frogmen-customers-view-v2";

const tabs: { id: CustomerTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "company", label: "Companies" },
  { id: "individual", label: "Individuals" },
  { id: "archived", label: "Archived" },
];

const sortOptions = [
  { label: "Name A–Z", value: "name asc" },
  { label: "Name Z–A", value: "name desc" },
  { label: "Newest first", value: "createdAt desc" },
  { label: "Oldest first", value: "createdAt asc" },
];

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryName(code: string | null) {
  if (!code) return null;
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function titleCase(value: string) {
  return value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function locationLine(customer: Customer) {
  return [customer.city ? titleCase(customer.city) : null, countryName(customer.countryCode)]
    .filter(Boolean)
    .join(", ");
}

function subtitle(customer: Customer) {
  if (customer.accountType === "company") return customer.reference || "Company account";
  return customer.jobTitle || "Individual client";
}

function sinceLabel(customer: Customer) {
  const raw = customer.memberSince ?? customer.createdAt;
  return raw ? formatAppDate(raw.slice(0, 10)) || raw.slice(0, 10) : null;
}

function addressLines(customer: Customer) {
  return [
    customer.street1,
    customer.street2,
    [customer.zip, customer.city ? titleCase(customer.city) : null].filter(Boolean).join(" "),
    countryName(customer.countryCode),
  ].filter((line): line is string => Boolean(line && line.trim()));
}

export function CustomersListPage() {
  const { showSuccess, showError } = useToast();
  const { baseCurrencyCode } = useOrgCurrency();
  const money = useCallback(
    (amount: number, code?: string) => formatAlertMoney(amount, code || baseCurrencyCode),
    [baseCurrencyCode],
  );

  const [tab, setTab] = useState<CustomerTab>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState("name asc");
  const [view, setView] = useState<"grid" | "list">("list");
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isArchived = tab === "archived";
  const [sortBy, sortDir] = sort.split(" ") as [
    NonNullable<ListCustomersParams["sortBy"]>,
    NonNullable<ListCustomersParams["sortDir"]>,
  ];
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      // ignore
    }
  }, []);

  function changeView(next: "grid" | "list") {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => setPage(1), [tab, debouncedQuery, sort]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCustomers({
        page,
        perPage: PER_PAGE,
        search: debouncedQuery || undefined,
        archived: isArchived,
        accountType: tab === "company" || tab === "individual" ? tab : undefined,
        sortBy,
        sortDir,
      });
      setCustomers(result.data);
      setTotal(result.meta.total);
      setSelectedId((current) =>
        current && result.data.some((c) => c.id === current) ? current : result.data[0]?.id ?? null,
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, isArchived, page, showError, sortBy, sortDir, tab]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getCustomerStats());
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  async function toggleArchive(customer: Customer) {
    try {
      if (isArchived) await restoreCustomer(customer.id);
      else await archiveCustomer(customer.id);
      showSuccess(`${customer.name} ${isArchived ? "restored" : "archived"}`);
      await Promise.all([loadCustomers(), loadStats()]);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not update customer");
    }
  }

  const individuals = stats ? Math.max(0, stats.totalAccounts - stats.corporateAccounts) : null;
  const filtering = Boolean(debouncedQuery) || tab !== "all";

  return (
    <AppPage
      title="Customers"
      subtitle="Companies, divers and commercial clients"
      primaryAction={{ content: "Add customer", url: "/dashboard/customers/new" }}
      secondaryActions={[{ content: "Leads", url: "/dashboard/leads" }]}
    >
      <BlockStack gap="400">
        {/* Summary banner */}
        <section className="cdir-hero">
          <div className="cdir-hero__main">
            <span className="cdir-hero__label">Total customers</span>
            <span className="cdir-hero__value">{stats ? stats.totalAccounts : "—"}</span>
            <span className="cdir-hero__hint">
              {stats?.registeredThisMonth
                ? `+${stats.registeredThisMonth} added this month`
                : "No new customers this month"}
            </span>
          </div>
          <div className="cdir-hero__stats">
            <button type="button" onClick={() => setTab("company")}>
              <span>Companies</span>
              <strong>{stats ? stats.corporateAccounts : "—"}</strong>
            </button>
            <button type="button" onClick={() => setTab("individual")}>
              <span>Individuals</span>
              <strong>{individuals ?? "—"}</strong>
            </button>
            <div>
              <span>Approved credit</span>
              <strong>{stats ? money(Number(stats.totalCreditLine) || 0) : "—"}</strong>
            </div>
            <div>
              <span>Accounts with credit</span>
              <strong>{stats ? stats.approvedCreditAccounts : "—"}</strong>
            </div>
          </div>
        </section>

        {/* Toolbar */}
        <Card padding="300">
          <div className="cdir-toolbar">
            <ButtonGroup variant="segmented">
              {tabs.map((t) => (
                <Button key={t.id} pressed={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                </Button>
              ))}
            </ButtonGroup>
            <div className="cdir-toolbar__search">
              <TextField
                label="Search customers"
                labelHidden
                autoComplete="off"
                placeholder="Search name, company, email or phone"
                prefix={<Icon source={SearchIcon} tone="subdued" />}
                value={query}
                onChange={setQuery}
                clearButton
                onClearButtonClick={() => setQuery("")}
              />
            </div>
            <div className="cdir-toolbar__sort">
              <Select label="Sort" labelInline options={sortOptions} value={sort} onChange={setSort} />
            </div>
            <ButtonGroup variant="segmented">
              <Button
                icon={ListBulletedIcon}
                pressed={view === "list"}
                accessibilityLabel="Table view"
                onClick={() => changeView("list")}
              />
              <Button
                icon={AppsIcon}
                pressed={view === "grid"}
                accessibilityLabel="Card view"
                onClick={() => changeView("grid")}
              />
            </ButtonGroup>
          </div>
        </Card>

        <div className="cdir-layout">
          {/* Directory */}
          <div className="cdir-main">
            {view === "list" ? (
              <Card padding="0">
                <IndexTable
                  resourceName={{ singular: "customer", plural: "customers" }}
                  itemCount={customers.length}
                  selectable={false}
                  loading={loading}
                  emptyState={
                    <EmptyState
                      heading={filtering ? "No customers found" : "Add your first customer"}
                      action={
                        filtering ? undefined : { content: "Add customer", url: "/dashboard/customers/new" }
                      }
                      image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                    >
                      <p>
                        {filtering
                          ? "Try another search, or switch back to All."
                          : "Keep companies and individual clients together in one directory."}
                      </p>
                    </EmptyState>
                  }
                  headings={[
                    { title: "Customer" },
                    { title: "Type" },
                    { title: "Email" },
                    { title: "Phone" },
                    { title: "Location" },
                    { title: "Customer since" },
                  ]}
                >
                  {customers.map((customer, index) => {
                    const isCompany = customer.accountType === "company";
                    return (
                      <IndexTable.Row
                        id={customer.id}
                        key={customer.id}
                        position={index}
                        selected={customer.id === selectedId}
                        onClick={() => setSelectedId(customer.id)}
                      >
                        <IndexTable.Cell>
                          <InlineStack gap="300" blockAlign="center" wrap={false}>
                            <CustomerAvatar avatarPath={customer.avatarPath} name={customer.name} size="md" />
                            <BlockStack gap="050">
                              <Text as="span" fontWeight="semibold">{titleCase(customer.name)}</Text>
                              <Text as="span" tone="subdued" variant="bodySm">{subtitle(customer)}</Text>
                            </BlockStack>
                          </InlineStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <span className={cn("cdir-type", isCompany ? "is-company" : "is-individual")}>
                            {isCompany ? "Company" : "Individual"}
                          </span>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" variant="bodySm" tone={customer.email ? undefined : "subdued"}>
                            {customer.email || "—"}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" variant="bodySm" tone={customer.phone || customer.mobile ? undefined : "subdued"}>
                            {customer.phone || customer.mobile || "—"}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" variant="bodySm" tone="subdued">{locationLine(customer) || "—"}</Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" variant="bodySm" tone="subdued">{sinceLabel(customer) ?? "—"}</Text>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>
              </Card>
            ) : loading && customers.length === 0 ? (
              <div className={view === "grid" ? "cdir-grid" : "cdir-list"}>
                {Array.from({ length: 6 }, (_, i) => (
                  <div className="cdir-card is-skeleton" key={i}>
                    <SkeletonThumbnail size="small" />
                    <SkeletonBodyText lines={3} />
                  </div>
                ))}
              </div>
            ) : customers.length === 0 ? (
              <Card>
                {filtering ? (
                  <EmptyState heading="No customers found" image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg">
                    <p>Try another search, or switch back to All.</p>
                  </EmptyState>
                ) : (
                  <EmptyState
                    heading="Add your first customer"
                    action={{ content: "Add customer", url: "/dashboard/customers/new" }}
                    image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                  >
                    <p>Keep companies and individual clients together in one directory.</p>
                  </EmptyState>
                )}
              </Card>
            ) : (
              <div className={cn(view === "grid" ? "cdir-grid" : "cdir-list", loading && "is-loading")}>
                {customers.map((customer) => (
                  <CustomerTile
                    key={customer.id}
                    customer={customer}
                    view={view}
                    selected={customer.id === selectedId}
                    onSelect={() => setSelectedId(customer.id)}
                  />
                ))}
              </div>
            )}

            {total > PER_PAGE ? (
              <div className="cdir-pagination">
                <Pagination
                  hasPrevious={page > 1}
                  hasNext={page < totalPages}
                  onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                  label={`Page ${page} of ${totalPages} · ${total} customers`}
                />
              </div>
            ) : customers.length > 0 ? (
              <Text as="p" tone="subdued" variant="bodySm" alignment="center">
                {total} customer{total === 1 ? "" : "s"}
              </Text>
            ) : null}
          </div>

          {/* Detail panel */}
          <aside className="cdir-panel">
            {selected ? (
              <CustomerPanel
                customer={selected}
                archived={isArchived}
                money={money}
                onToggleArchive={() => void toggleArchive(selected)}
              />
            ) : (
              <Card>
                <Box paddingBlock="800">
                  <Text as="p" tone="subdued" alignment="center">
                    Select a customer to see their details.
                  </Text>
                </Box>
              </Card>
            )}
          </aside>
        </div>
      </BlockStack>
    </AppPage>
  );
}

/* ── Directory tile ───────────────────────────────────────────────────────── */

function CustomerTile({
  customer,
  view,
  selected,
  onSelect,
}: {
  customer: Customer;
  view: "grid" | "list";
  selected: boolean;
  onSelect: () => void;
}) {
  const location = locationLine(customer);
  const isCompany = customer.accountType === "company";

  return (
    <button
      type="button"
      className={cn("cdir-card", view === "list" && "is-row", selected && "is-selected")}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="cdir-card__top">
        <CustomerAvatar avatarPath={customer.avatarPath} name={customer.name} size={view === "grid" ? "lg" : "md"} />
        <span className="cdir-card__identity">
          <strong>{titleCase(customer.name)}</strong>
          <small>{subtitle(customer)}</small>
        </span>
        <span className={cn("cdir-type", isCompany ? "is-company" : "is-individual")}>
          {isCompany ? "Company" : "Individual"}
        </span>
      </span>

      <span className="cdir-card__meta">
        <span title={customer.email ?? undefined}>
          <Icon source={EmailIcon} tone="subdued" />
          {customer.email || "No email"}
        </span>
        <span>
          <Icon source={PhoneIcon} tone="subdued" />
          {customer.phone || customer.mobile || "No phone"}
        </span>
        <span>
          <Icon source={LocationIcon} tone="subdued" />
          {location || "No location"}
        </span>
      </span>
    </button>
  );
}

/* ── Detail panel ─────────────────────────────────────────────────────────── */

function CustomerPanel({
  customer,
  archived,
  money,
  onToggleArchive,
}: {
  customer: Customer;
  archived: boolean;
  money: (amount: number, code?: string) => string;
  onToggleArchive: () => void;
}) {
  const [activity, setActivity] = useState<CustomerActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    setActivity(null);
    getCustomerActivity(customer.id)
      .then((result) => !cancelled && setActivity(result))
      .catch(() => !cancelled && setActivity(null))
      .finally(() => !cancelled && setActivityLoading(false));
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  const isCompany = customer.accountType === "company";
  const phone = customer.phone || customer.mobile;
  const credit = Number(customer.creditLimit) || 0;
  const address = addressLines(customer);
  const since = sinceLabel(customer);

  const recent = useMemo(() => {
    if (!activity) return [];
    return [
      ...activity.quotations.map((q) => ({
        id: `q-${q.id}`,
        kind: "Quotation",
        number: q.number,
        date: q.date,
        amount: money(q.amount, q.currencyCode),
        status: q.state,
        url: `/dashboard/sales/quotations/${q.id}`,
      })),
      ...activity.invoices.map((inv) => ({
        id: `i-${inv.id}`,
        kind: "Invoice",
        number: inv.number,
        date: inv.date,
        amount: money(inv.amount, inv.currencyCode),
        status: inv.paymentState === "paid" ? "paid" : inv.state,
        url: `/dashboard/invoices/${inv.id}`,
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);
  }, [activity, money]);

  // Documents can be in different currencies: total each currency separately.
  const fallbackCurrency = activity?.invoices[0]?.currencyCode;
  const invoicedTotal = sumByCurrency(activity?.invoices ?? [], fallbackCurrency);
  const paidTotal = sumByCurrency(activity?.payments ?? [], fallbackCurrency);
  const invoicedAmount = (
    <MultiCurrencyAmount items={activity?.invoices ?? []} fallbackCurrency={fallbackCurrency} />
  );
  const paidAmount = (
    <MultiCurrencyAmount items={activity?.payments ?? []} fallbackCurrency={fallbackCurrency} />
  );

  return (
    <div className="cdir-panel__card">
      <div className="cdir-panel__head">
        <CustomerAvatar avatarPath={customer.avatarPath} name={customer.name} size="xl" />
        <div className="cdir-panel__identity">
          <h2>{titleCase(customer.name)}</h2>
          <p>{subtitle(customer)}</p>
          <span className={cn("cdir-type", isCompany ? "is-company" : "is-individual", "on-dark")}>
            {isCompany ? "Company" : "Individual"}
          </span>
        </div>
      </div>

      <div className="cdir-panel__actions">
        <Button icon={EmailIcon} url={customer.email ? `mailto:${customer.email}` : undefined} disabled={!customer.email}>
          Email
        </Button>
        <Button icon={PhoneIcon} url={phone ? `tel:${phone}` : undefined} disabled={!phone}>
          Call
        </Button>
        <Button url={`/dashboard/customers/${customer.id}/edit`}>Edit</Button>
      </div>

      <div className="cdir-panel__body">
        <div className="cdir-stats">
          <div>
            <span>Quotations</span>
            <strong>{activityLoading ? "…" : activity?.quotations.length ?? 0}</strong>
          </div>
          <div>
            <span>Invoiced</span>
            <strong title={invoicedTotal}>{activityLoading ? "…" : invoicedAmount}</strong>
          </div>
          <div>
            <span>Paid</span>
            <strong title={paidTotal}>{activityLoading ? "…" : paidAmount}</strong>
          </div>
        </div>

        <dl className="cdir-details">
          <DetailRow icon={EmailIcon} label="Email" value={customer.email} />
          <DetailRow icon={PhoneIcon} label="Phone" value={[...new Set([customer.phone, customer.mobile].filter(Boolean))].join(" · ") || null} />
          <DetailRow icon={GlobeIcon} label="Website" value={customer.website} />
          <DetailRow icon={LocationIcon} label="Address" value={address.length ? address.join(", ") : null} />
          <DetailRow icon={IdentityCardIcon} label="Tax ID" value={customer.taxId} />
          <DetailRow
            icon={CreditCardIcon}
            label="Credit"
            value={credit > 0 ? `${money(credit)} · ${customer.creditApproved ? "approved" : "pending approval"}` : "No credit line"}
          />
          <DetailRow icon={CalendarIcon} label="Customer since" value={since} />
        </dl>

        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingSm">Recent activity</Text>
            <Button variant="plain" url={`/dashboard/customers/${customer.id}/transactions`}>
              All transactions
            </Button>
          </InlineStack>
          {activityLoading ? (
            <SkeletonBodyText lines={3} />
          ) : recent.length === 0 ? (
            <Text as="p" tone="subdued" variant="bodySm">No quotations or invoices yet.</Text>
          ) : (
            <div className="cdir-activity">
              {recent.map((item) => (
                <a key={item.id} href={item.url} className="cdir-activity__item">
                  <span className="cdir-activity__copy">
                    <strong>{item.kind} {item.number}</strong>
                    <small>{formatAppDate(item.date.slice(0, 10)) || item.date}</small>
                  </span>
                  <span className="cdir-activity__amount">
                    <strong>{item.amount}</strong>
                    <Badge size="small" tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  </span>
                </a>
              ))}
            </div>
          )}
        </BlockStack>
      </div>

      <div className="cdir-panel__footer">
        <Button variant="primary" url={`/dashboard/customers/${customer.id}`} fullWidth>
          Open full profile
        </Button>
        <Button tone={archived ? undefined : "critical"} variant="plain" onClick={onToggleArchive}>
          {archived ? "Restore customer" : "Archive customer"}
        </Button>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: typeof EmailIcon;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="cdir-details__row">
      <dt>
        <Icon source={icon} tone="subdued" />
        {label}
      </dt>
      <dd className={value ? undefined : "is-empty"}>{value || "—"}</dd>
    </div>
  );
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function statusTone(status: string): "success" | "info" | "attention" | "critical" | undefined {
  switch (status) {
    case "paid":
    case "confirmed":
      return "success";
    case "sent":
    case "posted":
    case "signed":
      return "info";
    case "partial":
    case "not_paid":
      return "attention";
    case "cancelled":
      return "critical";
    default:
      return undefined;
  }
}
