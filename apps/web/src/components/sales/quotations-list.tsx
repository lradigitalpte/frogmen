"use client";

import {
  ActionList,
  Badge,
  Banner,
  BlockStack,
  Button,
  EmptyState,
  Icon,
  IndexTable,
  Modal,
  Popover,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MenuHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SendDocumentEmailModal } from "@/components/documents/send-document-email-modal";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { IndexTablePaginationBar } from "@/components/ui/index-table-pagination-bar";
import { useBranchLabels } from "@/hooks/use-branch-labels";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount, type CurrencyLike } from "@/lib/currency-utils";
import { formatAppDate } from "@/lib/format-date";
import {
  confirmQuotation,
  deleteQuotation,
  listQuotations,
  sendQuotationEmail,
  type Quotation,
  type QuotationState,
} from "@/lib/quotations-api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 16;
const resourceName = { singular: "quotation", plural: "quotations" };

type TabId = QuotationState | "all";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "sent", label: "Sent" },
  { id: "signed", label: "Signed" },
  { id: "confirmed", label: "Orders" },
  { id: "cancelled", label: "Cancelled" },
];

/** The happy path a quote moves along. */
const STAGES: Array<{ id: Exclude<QuotationState, "cancelled">; label: string; hint: string }> = [
  { id: "draft", label: "Draft", hint: "being prepared" },
  { id: "sent", label: "Sent", hint: "with the customer" },
  { id: "signed", label: "Signed", hint: "accepted, to confirm" },
  { id: "confirmed", label: "Order", hint: "confirmed sales orders" },
];
const STAGE_INDEX: Record<QuotationState, number> = { draft: 0, sent: 1, signed: 2, confirmed: 3, cancelled: -1 };

const STATE_META: Record<QuotationState, { label: string; tone?: "success" | "info" | "attention" | "critical" }> = {
  draft: { label: "Draft" },
  sent: { label: "Sent", tone: "info" },
  signed: { label: "Signed", tone: "attention" },
  confirmed: { label: "Order", tone: "success" },
  cancelled: { label: "Cancelled", tone: "critical" },
};

interface StageStat {
  count: number;
  value: number;
  expiringSoon: number;
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function StageTrack({ state }: { state: QuotationState }) {
  const index = STAGE_INDEX[state];
  const meta = STATE_META[state];
  return (
    <span className={cn("qt-track", state === "cancelled" && "is-cancelled")}>
      <span className="qt-track__dots" aria-hidden>
        {STAGES.map((stage, i) => (
          <i className={cn(i <= index && "is-done", i === index && "is-current")} key={stage.id} />
        ))}
      </span>
      <Badge size="small" tone={meta.tone}>
        {meta.label}
      </Badge>
    </span>
  );
}

export function QuotationsListPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const { formatOrgMoney, formatBaseMoney, baseCurrencyCode, resolveCurrency } = useOrgCurrency();
  const { showBranchColumn, branchLabel } = useBranchLabels();

  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [pipelineTotalBase, setPipelineTotalBase] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stats, setStats] = useState<Record<QuotationState, StageStat> | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [emailFor, setEmailFor] = useState<Quotation | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [deleteFor, setDeleteFor] = useState<Quotation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeTab = TABS[tab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedQuery]);

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listQuotations({
        page,
        perPage: PAGE_SIZE,
        search: debouncedQuery || undefined,
        state: activeTab === "all" ? undefined : activeTab,
        sortBy: "quoteDate",
        sortDir: "desc",
      });
      setQuotations(result.data);
      setTotal(result.meta.total);
      setPipelineTotalBase(parseFloat(result.meta.pipelineTotalBase ?? "0") || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedQuery, page]);

  // Accurate per-stage counts and values (independent of the current page).
  const loadStats = useCallback(async () => {
    try {
      const states: QuotationState[] = ["draft", "sent", "signed", "confirmed", "cancelled"];
      const results = await Promise.all(states.map((state) => listQuotations({ state, perPage: 100 })));
      const next = {} as Record<QuotationState, StageStat>;
      states.forEach((state, i) => {
        const rows = results[i].data;
        next[state] = {
          count: results[i].meta.total,
          value: rows.reduce((sum, q) => sum + (parseFloat(q.amountTotalBase) || 0), 0),
          expiringSoon: rows.filter((q) => {
            const d = daysUntil(q.validityDate);
            return d !== null && d >= 0 && d <= 7;
          }).length,
        };
      });
      setStats(next);
    } catch {
      // The stage strip simply stays empty.
    }
  }, []);

  useEffect(() => {
    void loadQuotations();
  }, [loadQuotations]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  function refresh() {
    void loadQuotations();
    void loadStats();
  }

  async function handleConfirm(quote: Quotation) {
    setConfirmingId(quote.id);
    try {
      await confirmQuotation(quote.id);
      showSuccess(`${quote.number} is now a confirmed sales order.`);
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to confirm order";
      setError(message);
      showError(message);
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteFor) return;
    setDeleting(true);
    try {
      await deleteQuotation(deleteFor.id);
      showSuccess(`Cancelled quotation ${deleteFor.number} deleted.`);
      setDeleteFor(null);
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete quotation";
      setError(message);
      showError(message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSendEmail(input: { recipientEmail: string; subject: string; body: string }) {
    if (!emailFor) return;
    setEmailSending(true);
    try {
      await sendQuotationEmail(emailFor.id, input.recipientEmail, input.subject, input.body);
      setNotice(`${emailFor.number} sent to ${input.recipientEmail}.`);
      setEmailFor(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  const amountOf = useCallback(
    (quote: Quotation) => {
      const currency: CurrencyLike | null = resolveCurrency(quote.currencyId);
      return currency ? formatCurrencyAmount(quote.amountTotal, currency) : formatOrgMoney(quote.amountTotal);
    },
    [resolveCurrency, formatOrgMoney],
  );

  // Group revisions of the same deal: newest first, older ones tucked below.
  const groups = useMemo(() => {
    const byDeal = new Map<string, Quotation[]>();
    const order: Array<{ key: string; items: Quotation[] }> = [];
    for (const q of quotations) {
      if (q.dealId) {
        if (!byDeal.has(q.dealId)) {
          const list: Quotation[] = [];
          byDeal.set(q.dealId, list);
          order.push({ key: `deal-${q.dealId}`, items: list });
        }
        byDeal.get(q.dealId)!.push(q);
      } else {
        order.push({ key: q.id, items: [q] });
      }
    }
    for (const list of byDeal.values()) {
      list.sort((a, b) => b.number.localeCompare(a.number, undefined, { numeric: true }));
    }
    return order;
  }, [quotations]);

  // ── Derived pipeline numbers ────────────────────────────────
  const open = stats ? stats.draft.count + stats.sent.count + stats.signed.count : 0;
  const decided = stats ? stats.confirmed.count + stats.cancelled.count : 0;
  const winRate = stats && decided > 0 ? Math.round((stats.confirmed.count / decided) * 100) : null;
  const expiringSoon = stats ? stats.sent.expiringSoon + stats.draft.expiringSoon : 0;
  const maxStageValue = stats ? Math.max(1, ...STAGES.map((s) => stats[s.id].value)) : 1;

  function nextStep(quote: Quotation) {
    switch (quote.state) {
      case "draft":
        return { label: "Send", icon: SendIcon, action: () => setEmailFor(quote) };
      case "sent":
      case "signed":
        return { label: "Confirm order", icon: CheckIcon, action: () => void handleConfirm(quote) };
      default:
        return null;
    }
  }

  let position = 0;

  function renderRow(quote: Quotation, opts: { child?: boolean; revisions?: number; groupKey?: string; isOpen?: boolean } = {}) {
    const viewHref = `/dashboard/sales/quotations/${quote.id}`;
    const days = daysUntil(quote.validityDate);
    const isOpenQuote = quote.state === "draft" || quote.state === "sent";
    const step = opts.child ? null : nextStep(quote);
    const name = quote.customerName ?? "Customer";
    const foreign = quote.currencyCode && quote.currencyCode !== baseCurrencyCode;

    let validity: React.ReactNode = null;
    if (isOpenQuote && days !== null) {
      validity =
        days < 0 ? (
          <span className="qt-valid is-expired">Expired {Math.abs(days)}d ago</span>
        ) : days <= 7 ? (
          <span className="qt-valid is-soon">Expires {days === 0 ? "today" : `in ${days}d`}</span>
        ) : (
          <span className="qt-valid">Valid to {formatAppDate(quote.validityDate!)}</span>
        );
    } else if (quote.state === "confirmed") {
      validity = (
        <span className={cn("qt-valid", quote.invoiceStatus === "invoiced" ? "is-done" : "is-todo")}>
          {quote.invoiceStatus === "invoiced"
            ? "Invoiced"
            : quote.invoiceStatus === "partial"
              ? "Partly invoiced"
              : "Ready to invoice"}
        </span>
      );
    } else if (quote.state === "signed" && quote.signedBy) {
      validity = <span className="qt-valid is-done">Signed by {quote.signedBy}</span>;
    }

    return (
      <IndexTable.Row
        id={quote.id}
        key={quote.id}
        position={position++}
        onClick={() => router.push(viewHref)}
      >
        <IndexTable.Cell>
          <div className={cn("qt-num", opts.child && "is-child", quote.state === "cancelled" && "is-cancelled")}>
            {opts.revisions && opts.revisions > 1 ? (
              <button
                aria-expanded={opts.isOpen}
                aria-label={opts.isOpen ? "Hide older revisions" : "Show older revisions"}
                className="qt-num__toggle"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((prev) => ({ ...prev, [opts.groupKey!]: !prev[opts.groupKey!] }));
                }}
              >
                <Icon source={opts.isOpen ? ChevronDownIcon : ChevronRightIcon} />
              </button>
            ) : opts.child ? (
              <span className="qt-num__branch" />
            ) : (
              <span className="qt-num__spacer" />
            )}
            <span className="qt-num__text">
              <strong>{quote.number}</strong>
              {opts.revisions && opts.revisions > 1 ? (
                <small>{`${opts.revisions} revisions`}</small>
              ) : opts.child ? (
                <small>Earlier revision</small>
              ) : quote.customerReference ? (
                <small>Ref {quote.customerReference}</small>
              ) : null}
            </span>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="qt-cust">
            <span className="qt-cust__avatar">{initials(name)}</span>
            <span className="qt-cust__text">
              <strong>{name}</strong>
              {quote.customerEmail ? <small>{quote.customerEmail}</small> : null}
            </span>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="qt-date">
            <span>{formatAppDate(quote.quoteDate)}</span>
            {validity}
          </div>
        </IndexTable.Cell>
        {showBranchColumn ? <IndexTable.Cell>{branchLabel(quote.branchId)}</IndexTable.Cell> : null}
        <IndexTable.Cell>
          <StageTrack state={quote.state} />
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="qt-amount">
            <strong>{amountOf(quote)}</strong>
            {foreign ? <small>≈ {formatBaseMoney(parseFloat(quote.amountTotalBase) || 0)}</small> : null}
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="qt-actions" onClick={(event) => event.stopPropagation()}>
            {step ? (
              <Button
                icon={step.icon}
                loading={confirmingId === quote.id}
                size="slim"
                variant={quote.state === "signed" ? "primary" : "secondary"}
                onClick={step.action}
              >
                {step.label}
              </Button>
            ) : null}
            <Popover
              active={openMenu === quote.id}
              activator={
                <Button
                  accessibilityLabel={`Actions for ${quote.number}`}
                  icon={MenuHorizontalIcon}
                  size="slim"
                  variant="tertiary"
                  onClick={() => setOpenMenu((current) => (current === quote.id ? null : quote.id))}
                />
              }
              preferredAlignment="right"
              onClose={() => setOpenMenu(null)}
            >
              <ActionList
                actionRole="menuitem"
                onActionAnyItem={() => setOpenMenu(null)}
                sections={[
                  {
                    items: [
                      { content: "Open", onAction: () => router.push(viewHref) },
                      ...(quote.state !== "confirmed" && quote.state !== "cancelled"
                        ? [{ content: "Edit", onAction: () => router.push(`${viewHref}/edit`) }]
                        : []),
                      ...(quote.state === "draft" || quote.state === "sent"
                        ? [{ content: quote.state === "sent" ? "Send again" : "Send to customer", onAction: () => setEmailFor(quote) }]
                        : []),
                      ...(quote.state === "sent" || quote.state === "signed"
                        ? [{ content: "Confirm as order", onAction: () => void handleConfirm(quote) }]
                        : []),
                    ],
                  },
                  ...(quote.state === "cancelled"
                    ? [{ items: [{ content: "Delete", destructive: true, onAction: () => setDeleteFor(quote) }] }]
                    : []),
                ]}
              />
            </Popover>
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  }

  const rows = groups.flatMap((group) => {
    const [latest, ...older] = group.items;
    const isOpen = Boolean(expanded[group.key]);
    const out = [renderRow(latest, { revisions: group.items.length, groupKey: group.key, isOpen })];
    if (isOpen) for (const q of older) out.push(renderRow(q, { child: true }));
    return out;
  });

  const tabCount = (id: TabId) => {
    if (!stats) return undefined;
    if (id === "all") return String(Object.values(stats).reduce((sum, s) => sum + s.count, 0));
    return String(stats[id].count);
  };

  return (
    <AppPage
      backAction={{ content: "Home", url: "/dashboard" }}
      fullWidth
      primaryAction={{
        content: "New quotation",
        icon: PlusIcon,
        onAction: () => router.push("/dashboard/sales/quotations/new"),
      }}
      subtitle="Every quote from first draft to confirmed sales order."
      title="Quotations"
    >
      <BlockStack gap="400">
        {notice ? (
          <Banner tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {/* Pipeline */}
        <section className="qt-hero">
          <div className="qt-hero__top">
            <div className="qt-hero__main">
              <span className="qt-hero__label">Open pipeline</span>
              <span className="qt-hero__value">{formatBaseMoney(pipelineTotalBase)}</span>
              <span className="qt-hero__hint">
                {stats ? `${open} open quote${open === 1 ? "" : "s"} waiting on you or the customer` : "Loading…"}
              </span>
            </div>
            <div className="qt-hero__kpis">
              <div>
                <span>Win rate</span>
                <strong>{winRate === null ? "—" : `${winRate}%`}</strong>
                <small>{stats ? `${stats.confirmed.count} won · ${stats.cancelled.count} lost` : ""}</small>
              </div>
              <button
                className={expiringSoon ? "is-alert" : undefined}
                type="button"
                onClick={() => setTab(TABS.findIndex((t) => t.id === "sent"))}
              >
                <span>Expiring this week</span>
                <strong>{expiringSoon}</strong>
                <small>{expiringSoon ? "follow up before they lapse" : "nothing about to lapse"}</small>
              </button>
            </div>
          </div>

          <div className="qt-flow">
            {STAGES.map((stage, i) => {
              const stat = stats?.[stage.id];
              const active = activeTab === stage.id;
              return (
                <React.Fragment key={stage.id}>
                  <button
                    className={cn("qt-stage", `is-${stage.id}`, active && "is-active")}
                    type="button"
                    onClick={() => setTab(active ? 0 : TABS.findIndex((t) => t.id === stage.id))}
                  >
                    <span className="qt-stage__label">
                      <i>{i + 1}</i>
                      {stage.label}
                    </span>
                    <strong>{stat ? stat.count : "…"}</strong>
                    <small>{stat ? formatBaseMoney(stat.value) : stage.hint}</small>
                    <span className="qt-stage__bar">
                      <b style={{ width: `${stat ? Math.max(4, (stat.value / maxStageValue) * 100) : 0}%` }} />
                    </span>
                  </button>
                  {i < STAGES.length - 1 ? <span className="qt-flow__arrow" aria-hidden>→</span> : null}
                </React.Fragment>
              );
            })}
          </div>
        </section>

        <div className="qt-surface">
          <div className="qt-bar">
            <Tabs
              selected={tab}
              tabs={TABS.map((t) => ({ id: t.id, content: t.label, badge: tabCount(t.id) }))}
              onSelect={setTab}
            />
            <div className="qt-bar__search">
              <TextField
                autoComplete="off"
                clearButton
                label="Search quotations"
                labelHidden
                placeholder="Quote number, customer or reference"
                prefix={<Icon source={SearchIcon} />}
                value={query}
                onChange={setQuery}
                onClearButtonClick={() => setQuery("")}
              />
            </div>
          </div>

          <IndexTable
            emptyState={
              debouncedQuery || activeTab !== "all" ? (
                <div className="qt-empty">
                  <Text as="p" fontWeight="semibold">
                    No quotations here
                  </Text>
                  <Text as="p" tone="subdued">
                    Try another tab or search.
                  </Text>
                </div>
              ) : (
                <EmptyState
                  action={{ content: "Create quotation", onAction: () => router.push("/dashboard/sales/quotations/new") }}
                  heading="Create your first quotation"
                  image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                >
                  <p>Build a quote, send it for signature, then confirm it as a sales order in one click.</p>
                </EmptyState>
              )
            }
            headings={[
              { title: "Quote" },
              { title: "Customer" },
              { title: "Date" },
              ...(showBranchColumn ? [{ title: "Branch" }] : []),
              { title: "Stage" },
              { title: "Amount", alignment: "end" as const },
              { title: "", hidden: true },
            ]}
            itemCount={quotations.length}
            loading={loading}
            resourceName={resourceName}
            selectable={false}
          >
            {rows}
          </IndexTable>

          <IndexTablePaginationBar
            loading={loading}
            page={page}
            perPage={PAGE_SIZE}
            placement="footer"
            resourceName={resourceName}
            total={total}
            onPageChange={setPage}
          />
        </div>
      </BlockStack>

      <SendDocumentEmailModal
        documentType="quotation"
        loading={emailSending}
        open={Boolean(emailFor)}
        pdfLabel={emailFor ? `quotation-${emailFor.number}.pdf` : undefined}
        placeholders={{
          number: emailFor?.number ?? "",
          customerName: emailFor?.customerName ?? "Customer",
          companyName: "",
          total: emailFor ? amountOf(emailFor) : "",
        }}
        primaryActionLabel="Send quotation"
        recipient={emailFor?.customerEmail ?? ""}
        title={`Send ${emailFor?.number ?? ""} to the customer`}
        onClose={() => setEmailFor(null)}
        onSend={handleSendEmail}
      />

      <Modal
        open={deleteFor !== null}
        primaryAction={{ content: "Delete quotation", destructive: true, loading: deleting, onAction: () => void handleDelete() }}
        secondaryActions={[{ content: "Keep it", onAction: () => setDeleteFor(null) }]}
        title={`Delete ${deleteFor?.number ?? ""}?`}
        onClose={() => setDeleteFor(null)}
      >
        <Modal.Section>
          <Text as="p">
            This removes the cancelled quotation from your lists. Its document number and audit history stay on record.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
