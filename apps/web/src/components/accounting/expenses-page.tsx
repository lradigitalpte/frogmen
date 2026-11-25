"use client";

import {
  ActionList,
  Badge,
  Banner,
  Button,
  ButtonGroup,
  Icon,
  InlineStack,
  Modal,
  Pagination,
  Popover,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CashDollarIcon,
  BankIcon,
  DeleteIcon,
  EditIcon,
  ExportIcon,
  MenuHorizontalIcon,
  NoteIcon,
  PersonIcon,
  ReceiptIcon,
  SearchIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExpenseDetailModal } from "@/components/accounting/expense-detail-modal";
import { ExpenseFormModal } from "@/components/accounting/expense-form-modal";
import { AppPage } from "@/components/layout/page";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { getAccountingOverview } from "@/lib/accounting-api";
import { rangeError, type DateRange } from "@/lib/analytics-api";
import { downloadCsv } from "@/lib/export-csv";
import {
  deleteExpense,
  getExpenseReceiptUrl,
  listExpenses,
  type ExpenseDetail,
  type ExpenseRecord,
  type ExpensesListResponse,
} from "@/lib/expenses-api";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type Period = "week" | "month" | "quarter" | "year" | "all" | "custom";
type SourceFilter = "all" | "cash" | "bank" | "claims";

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "quarter", label: "Last 3 months" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

const PAGE_SIZES = [10, 25, 50];

function localIso(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function periodStart(period: Period) {
  const now = new Date();
  if (period === "week") {
    // Weeks start on Monday.
    return localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
  }
  if (period === "month") return localIso(new Date(now.getFullYear(), now.getMonth(), 1));
  if (period === "quarter") return localIso(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  if (period === "year") return `${now.getFullYear()}-01-01`;
  return "";
}

function paymentMethodLabel(method: string) {
  switch (method) {
    case "cash":
      return "Cash";
    case "cheque":
      return "Cheque";
    case "bank_transfer":
      return "Bank transfer";
    case "wire_transfer":
      return "Wire transfer";
    default:
      return method.replaceAll("_", " ");
  }
}

function isCash(expense: ExpenseRecord) {
  return (expense.paymentSource ?? (expense.paymentMethod === "cash" ? "cash" : "bank")) === "cash";
}

function paidFromDetail(expense: ExpenseRecord) {
  if (expense.paymentMethod === "cash") return "Petty cash";
  return expense.bankAccountName ?? expense.paymentSourceLabel ?? "Bank account";
}

function paymentSourceLabel(expense: ExpenseRecord) {
  const prefix = expense.source === "reimbursement" ? "Staff claim · " : "";
  return `${prefix}${paymentMethodLabel(expense.paymentMethod)} · ${paidFromDetail(expense)}`;
}

function dateParts(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString(undefined, { month: "short" }),
  };
}

export function ExpensesPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExpensesListResponse | null>(null);
  const [cashOnHand, setCashOnHand] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<ExpenseRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingExpenseId, setViewingExpenseId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({ from: "", to: "" });
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, overview] = await Promise.all([
        listExpenses(),
        getAccountingOverview().catch(() => null),
      ]);
      setData(list);
      if (overview) {
        setCashOnHand(
          overview.journals.filter((j) => j.journalType === "cash").reduce((sum, j) => sum + j.balance, 0),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Start on "All time" if nothing was spent this month, so the page never opens empty when there is history.
  const periodChosenRef = useRef(false);
  useEffect(() => {
    if (!data || periodChosenRef.current) return;
    periodChosenRef.current = true;
    const monthStart = periodStart("month");
    if (data.expenses.length && !data.expenses.some((e) => e.expenseDate >= monthStart)) setPeriod("all");
  }, [data]);

  function choosePeriod(next: Period) {
    periodChosenRef.current = true;
    setCustomOpen(false);
    setPeriod(next);
    setPage(1);
  }

  function openCustom() {
    if (customOpen) return;
    periodChosenRef.current = true;
    setDraft(period === "custom" ? custom : { from: start, to: todayIsoDate() });
    setCustomOpen(true);
  }

  function applyCustom() {
    setCustom(draft);
    setPeriod("custom");
    setPage(1);
  }

  const all = data?.expenses ?? [];
  const start = period === "custom" ? custom.from : periodStart(period);
  const end = period === "custom" ? custom.to : "";
  const inPeriod = useMemo(
    () => all.filter((e) => (!start || e.expenseDate >= start) && (!end || e.expenseDate <= end)),
    [all, start, end],
  );

  const stats = useMemo(() => {
    let total = 0;
    let cash = 0;
    let bank = 0;
    let claims = 0;
    let missingReceipts = 0;
    const byCategory = new Map<string, number>();
    for (const e of inPeriod) {
      total += e.amount;
      if (isCash(e)) cash += e.amount;
      else bank += e.amount;
      if (e.source === "reimbursement") claims += e.amount;
      if (!e.hasReceipt && e.source !== "reimbursement") missingReceipts += 1;
      const key = e.categoryName ?? (e.source === "reimbursement" ? "Staff claims" : "Uncategorised");
      byCategory.set(key, (byCategory.get(key) ?? 0) + e.amount);
    }
    const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    return { total, cash, bank, claims, missingReceipts, categories };
  }, [inPeriod]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inPeriod.filter((e) => {
      if (source === "cash" && !isCash(e)) return false;
      if (source === "bank" && isCash(e)) return false;
      if (source === "claims" && e.source !== "reimbursement") return false;
      if (!q) return true;
      return [e.number, e.description, e.reference, e.categoryName, e.bankAccountName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [inPeriod, source, query]);


  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const filteredTotal = filtered.reduce((sum, e) => sum + e.amount, 0);

  const rangeLabel =
    period === "custom"
      ? `${formatAppDate(start)} – ${formatAppDate(end)}`
      : start
        ? `Since ${formatAppDate(start)}`
        : "Everything recorded";
  const draftError = customOpen ? rangeError(draft) : null;

  function handleExport() {
    if (!filtered.length) return;
    const rows: string[][] = [
      ["Expenses", `Exported ${todayIsoDate()}`],
      ["Period", rangeLabel],
      [],
      ["Number", "Date", "Category", "Description", "Reference", "Paid from", "Amount"],
      ...filtered.map((expense) => [
        expense.number,
        expense.expenseDate,
        expense.categoryName ?? "",
        expense.description,
        expense.reference && expense.reference !== expense.number ? expense.reference : "",
        paymentSourceLabel(expense),
        String(expense.amount),
      ]),
    ];
    downloadCsv(`expenses-${todayIsoDate()}.csv`, rows);
  }

  async function handleDelete() {
    if (!deletingExpense) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteExpense(deletingExpense.id);
      setSuccess(`Deleted expense ${deletingExpense.number} and reversed its journal entry.`);
      setDeletingExpense(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
    } finally {
      setDeleting(false);
    }
  }

  function openNew() {
    setEditingExpense(null);
    setModalOpen(true);
  }

  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? rangeLabel;
  const first = loading && !data;
  const topCategories = stats.categories.slice(0, 4);
  const sourceCounts = {
    all: inPeriod.length,
    cash: inPeriod.filter(isCash).length,
    bank: inPeriod.filter((e) => !isCash(e)).length,
    claims: inPeriod.filter((e) => e.source === "reimbursement").length,
  };

  return (
    <AppPage
      primaryAction={{ content: "Record expense", onAction: openNew }}
      secondaryActions={[
        { content: "Export CSV", icon: ExportIcon, disabled: !filtered.length, onAction: handleExport },
        { content: "Categories", url: "/dashboard/accounting/expense-categories" },
      ]}
      subtitle="Petty cash and operating costs. Every expense posts to your books automatically."
      title="Expenses & Petty Cash"
    >
      <div className="ex">
        {success ? (
          <Banner tone="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <div className="pl-period">
          <ButtonGroup variant="segmented">
            {PERIODS.map((p) => (
              <Button key={p.id} pressed={!customOpen && period === p.id} size="slim" onClick={() => choosePeriod(p.id)}>
                {p.label}
              </Button>
            ))}
            <Button pressed={customOpen} size="slim" onClick={openCustom}>
              Custom
            </Button>
          </ButtonGroup>
          <span className="pl-period__label">{rangeLabel}</span>
        </div>

        {customOpen ? (
          <InlineStack blockAlign="end" gap="300">
            <TextField
              autoComplete="off"
              label="From"
              max={draft.to || undefined}
              type="date"
              value={draft.from}
              onChange={(from) => setDraft((current) => ({ ...current, from }))}
            />
            <TextField
              autoComplete="off"
              label="To"
              min={draft.from || undefined}
              type="date"
              value={draft.to}
              onChange={(to) => setDraft((current) => ({ ...current, to }))}
            />
            <Button disabled={draftError !== null} variant="primary" onClick={applyCustom}>
              Apply
            </Button>
            {draftError ? (
              <Text as="span" tone="critical" variant="bodySm">
                {draftError}
              </Text>
            ) : null}
          </InlineStack>
        ) : null}

        {/* Hero */}
        <section className="pl-hero ex-hero">
          <div className="pl-hero__main">
            <span className="pl-hero__label">Spent · {periodLabel.toLowerCase()}</span>
            <strong className="pl-hero__value">{first ? "…" : formatBaseMoney(stats.total)}</strong>
            <span className="pl-hero__period">
              {inPeriod.length} expense{inPeriod.length === 1 ? "" : "s"}
              {stats.missingReceipts ? ` · ${stats.missingReceipts} without a receipt` : ""}
            </span>
          </div>
          <div className="pl-hero__tiles">
            <div className="ac-tile">
              <span>Paid from cash</span>
              <strong>{formatBaseMoney(stats.cash)}</strong>
              <small>Petty cash</small>
            </div>
            <div className="ac-tile">
              <span>Paid from bank</span>
              <strong>{formatBaseMoney(stats.bank)}</strong>
              <small>Transfers, cards &amp; cheques</small>
            </div>
            <div className={cn("ac-tile", cashOnHand !== null && cashOnHand < 0 && "is-alert")}>
              <span>Petty cash on hand</span>
              <strong>{cashOnHand === null ? "—" : formatBaseMoney(cashOnHand)}</strong>
              <small>{cashOnHand !== null && cashOnHand < 0 ? "Below zero — top it up" : "Cash journal balance today"}</small>
            </div>
          </div>
          {topCategories.length && stats.total > 0 ? (
            <div className="pl-hero__bar">
              <div className="ex-catbar">
                {topCategories.map(([name, amount], i) => (
                  <b className={`is-c${i}`} key={name} style={{ width: `${(amount / stats.total) * 100}%` }} title={`${name}: ${formatBaseMoney(amount)}`} />
                ))}
              </div>
              <div className="pl-hero__legend">
                {topCategories.map(([name, amount], i) => (
                  <span key={name}>
                    <i className={`ex-dot is-c${i}`} /> {name} {formatBaseMoney(amount)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* List */}
        <section className="ex-surface">
          <div className="ex-toolbar">
            <div className="iv-filters">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "cash", label: "Cash" },
                  { id: "bank", label: "Bank" },
                  { id: "claims", label: "Staff claims" },
                ] as Array<{ id: SourceFilter; label: string }>
              ).map((f) => (
                <button
                  className={cn("iv-filter", source === f.id && "is-active")}
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSource(f.id);
                    setPage(1);
                  }}
                >
                  {f.label}
                  <span>{sourceCounts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="ex-toolbar__search">
              <TextField
                autoComplete="off"
                clearButton
                label="Search expenses"
                labelHidden
                placeholder="Search description, number, category…"
                prefix={<Icon source={SearchIcon} />}
                value={query}
                onChange={(v) => {
                  setQuery(v);
                  setPage(1);
                }}
                onClearButtonClick={() => setQuery("")}
              />
            </div>
          </div>

          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={8} />
            </div>
          ) : all.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={ReceiptIcon} />
              </span>
              <strong>No expenses yet</strong>
              <p>Log fuel, supplies, repairs or any other cost — it posts to Operating Expenses straight away.</p>
              <Button variant="primary" onClick={openNew}>
                Record your first expense
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="ex-empty">
              <strong>Nothing matches</strong>
              <p>
                {query ? `No expenses match “${query}”` : `No ${source === "all" ? "" : source === "claims" ? "staff-claim " : `${source} `}expenses`}{" "}
                {period === "all" ? "" : `in ${periodLabel.toLowerCase()}`}.
              </p>
              {period !== "all" ? (
                <Button onClick={() => choosePeriod("all")}>Show all time</Button>
              ) : null}
            </div>
          ) : (
            <ul className="ex-list">
              {pageRows.map((expense) => {
                const { day, month } = dateParts(expense.expenseDate);
                const claim = expense.source === "reimbursement";
                const showRef = expense.reference && expense.reference !== expense.number;
                return (
                  <li className="ex-row" key={expense.id}>
                    <span className="ex-date" title={formatAppDate(expense.expenseDate)}>
                      <b>{day}</b>
                      <small>{month}</small>
                    </span>
                    <button className="ex-main" type="button" onClick={() => setViewingExpenseId(expense.id)}>
                      <strong>{expense.description}</strong>
                      <small>
                        <span className="ex-num">{expense.number}</span>
                        {expense.categoryName ? <span className="ex-cat">{expense.categoryName}</span> : null}
                        {showRef ? <span>Ref {expense.reference}</span> : null}
                        {claim ? <Badge size="small" tone="info">Staff claim</Badge> : null}
                      </small>
                    </button>
                    <span className="ex-paid">
                      <span className={cn("ex-paid__icon", isCash(expense) ? "is-cash" : "is-bank")}>
                        <Icon source={isCash(expense) ? CashDollarIcon : BankIcon} />
                      </span>
                      <span>
                        <strong>{paymentMethodLabel(expense.paymentMethod)}</strong>
                        <small>{paidFromDetail(expense)}</small>
                      </span>
                    </span>
                    <span className="ex-receipt">
                      {expense.hasReceipt ? (
                        <Button external icon={NoteIcon} size="slim" url={getExpenseReceiptUrl(expense.id)} variant="tertiary">
                          Receipt
                        </Button>
                      ) : expense.noReceiptReason ? (
                        <span className="ex-noreceipt" title={expense.noReceiptReason}>
                          No receipt · reason given
                        </span>
                      ) : claim ? null : (
                        <span className="ex-noreceipt">No receipt</span>
                      )}
                    </span>
                    <span className="ex-amount">{formatBaseMoney(expense.amount)}</span>
                    <span className="ex-actions">
                      <Popover
                        active={menuFor === expense.id}
                        activator={
                          <Button
                            accessibilityLabel={`Actions for ${expense.number}`}
                            icon={MenuHorizontalIcon}
                            size="slim"
                            variant="tertiary"
                            onClick={() => setMenuFor((v) => (v === expense.id ? null : expense.id))}
                          />
                        }
                        preferredAlignment="right"
                        onClose={() => setMenuFor(null)}
                      >
                        <ActionList
                          actionRole="menuitem"
                          items={[
                            { content: "View details", icon: ViewIcon, onAction: () => { setMenuFor(null); setViewingExpenseId(expense.id); } },
                            ...(claim
                              ? [
                                  {
                                    content: "Open staff claims",
                                    icon: PersonIcon,
                                    url: "/dashboard/accounting/expense-reimbursements",
                                  },
                                ]
                              : [
                                  {
                                    content: "Edit",
                                    icon: EditIcon,
                                    onAction: () => {
                                      setMenuFor(null);
                                      setEditingExpense(expense);
                                      setModalOpen(true);
                                    },
                                  },
                                  {
                                    content: "Delete",
                                    icon: DeleteIcon,
                                    destructive: true,
                                    onAction: () => {
                                      setMenuFor(null);
                                      setDeletingExpense(expense);
                                    },
                                  },
                                ]),
                          ]}
                        />
                      </Popover>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > 0 ? (
            <div className="iv-pager">
              <span>
                Showing <strong>{(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)}</strong> of{" "}
                <strong>{filtered.length}</strong> · total <strong>{formatBaseMoney(filteredTotal)}</strong>
              </span>
              <div className="iv-pager__controls">
                <div className="ex-perpage">
                  <Select
                    label="Rows per page"
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
          Each expense debits Operating Expenses (600000) and credits petty cash (101501) or the chosen bank account. Staff
          claims appear here once you reimburse them in{" "}
          <Link href="/dashboard/accounting/expense-reimbursements">Expense reimbursements</Link>; totals feed{" "}
          <Link href="/dashboard/accounting/profit-loss">Profit &amp; Loss</Link>.
        </p>
      </div>

      <ExpenseDetailModal
        expenseId={viewingExpenseId}
        onClose={() => setViewingExpenseId(null)}
        onEdit={(detail: ExpenseDetail) => {
          setEditingExpense(detail);
          setModalOpen(true);
        }}
      />

      <ExpenseFormModal
        open={modalOpen}
        expense={editingExpense}
        onClose={() => {
          setModalOpen(false);
          setEditingExpense(null);
        }}
        onSaved={async () => {
          setSuccess(editingExpense ? "Expense updated." : "Expense recorded and posted to Operating Expenses (600000).");
          await load();
        }}
      />

      <Modal
        open={Boolean(deletingExpense)}
        onClose={() => setDeletingExpense(null)}
        title={`Delete ${deletingExpense?.number ?? "expense"}?`}
        primaryAction={{
          content: "Delete expense",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeletingExpense(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            <strong>{deletingExpense?.description}</strong> ({deletingExpense ? formatBaseMoney(deletingExpense.amount) : ""}) will be
            removed and its journal entry reversed, so it drops off Profit &amp; Loss and the money goes back to{" "}
            {deletingExpense && isCash(deletingExpense) ? "petty cash" : "the bank account"}.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
