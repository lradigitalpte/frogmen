"use client";

import {
  ActionList,
  Badge,
  Button,
  Icon,
  Modal,
  Popover,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  DeleteIcon,
  EditIcon,
  MenuHorizontalIcon,
  NoteIcon,
  ReceiptIcon,
  SearchIcon,
  UndoIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExpenseClaimDetailModal } from "@/components/expense-claims/expense-claim-detail-modal";
import { ExpenseClaimFormModal } from "@/components/expense-claims/expense-claim-form-modal";
import {
  ExpenseClaimStatusBadge,
  formatExpenseClaimDate,
  formatExpenseClaimPaymentMethod,
} from "@/components/expense-claims/expense-claim-utils";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  deleteExpenseClaim,
  getExpenseClaimReceiptUrl,
  listMyExpenseClaims,
  requestExpenseClaimEdit,
  submitExpenseClaim,
  withdrawExpenseClaim,
  type ExpenseClaim,
  type ExpenseClaimStatus,
} from "@/lib/expense-claims-api";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type Filter = "all" | ExpenseClaimStatus;
type Sort = "newest" | "oldest" | "amount";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "submitted", label: "Awaiting approval" },
  { id: "approved", label: "To be paid" },
  { id: "rejected", label: "Rejected" },
  { id: "reimbursed", label: "Paid" },
];

const SORT_OPTIONS = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Largest amount", value: "amount" },
];

const FLOW: Array<{ status: ExpenseClaimStatus; title: string; text: string }> = [
  { status: "draft", title: "Draft", text: "Add the details and receipt" },
  { status: "submitted", title: "Submitted", text: "Finance reviews it" },
  { status: "approved", title: "Approved", text: "Waiting to be paid" },
  { status: "reimbursed", title: "Paid", text: "Money is back with you" },
];

function dayParts(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { day: "—", month: "" };
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString(undefined, { month: "short" }),
  };
}

function shortDate(value?: string | null) {
  return value ? formatAppDate(value) || value.slice(0, 10) : null;
}

/** One line under the status badge: where the claim is and who moved it. */
function statusNote(claim: ExpenseClaim) {
  switch (claim.status) {
    case "draft":
      return claim.rejectionReason || claim.editReason ? "Being revised — submit again when ready" : "Not submitted yet";
    case "submitted":
      return `Sent ${shortDate(claim.submittedAt) ?? ""}`.trim();
    case "approved":
      return claim.reviewedByName ? `Approved by ${claim.reviewedByName}` : "Approved — waiting for payment";
    case "rejected":
      return claim.reviewedByName ? `Rejected by ${claim.reviewedByName}` : "Rejected";
    case "reimbursed":
      return [shortDate(claim.reimbursedAt), claim.paymentMethod ? formatExpenseClaimPaymentMethod(claim.paymentMethod) : null]
        .filter(Boolean)
        .join(" · ");
    default:
      return "";
  }
}

export function MyExpenseClaimsPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<ExpenseClaim | null>(null);
  const [detailClaim, setDetailClaim] = useState<ExpenseClaim | null>(null);
  const [deletingClaim, setDeletingClaim] = useState<ExpenseClaim | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reopeningClaim, setReopeningClaim] = useState<ExpenseClaim | null>(null);
  const [editReason, setEditReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMyExpenseClaims();
      setClaims(data.claims);
      setError(null);
      return data.claims;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your claims");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a status change, refresh, and keep the open detail modal in sync. */
  const runAction = useCallback(
    async (claim: ExpenseClaim, action: () => Promise<unknown>, message: string) => {
      setBusyId(claim.id);
      try {
        await action();
        showSuccess(message);
        const fresh = await load();
        setDetailClaim((open) => (open && fresh ? fresh.find((c) => c.id === open.id) ?? null : open));
      } catch (err) {
        showError(err instanceof Error ? err.message : "That didn't work. Try again.");
      } finally {
        setBusyId(null);
      }
    },
    [load, showError, showSuccess],
  );

  const handleSubmit = (claim: ExpenseClaim) =>
    void runAction(claim, () => submitExpenseClaim(claim.id), `${claim.number} sent for approval`);
  const handleWithdraw = (claim: ExpenseClaim) =>
    void runAction(claim, () => withdrawExpenseClaim(claim.id), `${claim.number} is back in draft`);
  const handleRevise = (claim: ExpenseClaim) =>
    void runAction(
      claim,
      async () => {
        await withdrawExpenseClaim(claim.id);
        const fresh = await listMyExpenseClaims();
        const next = fresh.claims.find((c) => c.id === claim.id) ?? claim;
        setDetailClaim(null);
        setEditingClaim(next);
        setFormOpen(true);
      },
      `${claim.number} reopened — update it and submit again`,
    );

  const openEdit = (claim: ExpenseClaim) => {
    setDetailClaim(null);
    setEditingClaim(claim);
    setFormOpen(true);
  };

  const promptRequestEdit = (claim: ExpenseClaim) => {
    setDetailClaim(null);
    setEditReason("");
    setReopeningClaim(claim);
  };

  const handleRequestEdit = (claim: ExpenseClaim) =>
    void runAction(
      claim,
      async () => {
        const reopened = await requestExpenseClaimEdit(claim.id, editReason.trim());
        setReopeningClaim(null);
        openEdit(reopened);
      },
      `${claim.number} reopened — update it and submit again`,
    );

  async function handleDeleteConfirmed() {
    if (!deletingClaim) return;
    setDeleting(true);
    try {
      await deleteExpenseClaim(deletingClaim.id);
      showSuccess(`${deletingClaim.number} deleted`);
      setDeletingClaim(null);
      setDetailClaim(null);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't delete the claim");
    } finally {
      setDeleting(false);
    }
  }

  // ── Totals ──
  const stats = useMemo(() => {
    const year = String(new Date().getFullYear());
    const by = (s: ExpenseClaimStatus) => claims.filter((c) => c.status === s);
    const sum = (list: ExpenseClaim[]) => list.reduce((t, c) => t + c.amount, 0);
    const paidThisYear = by("reimbursed").filter((c) => (c.reimbursedAt ?? c.expenseDate).startsWith(year));
    return {
      counts: {
        all: claims.length,
        draft: by("draft").length,
        submitted: by("submitted").length,
        approved: by("approved").length,
        rejected: by("rejected").length,
        reimbursed: by("reimbursed").length,
      } as Record<Filter, number>,
      owed: sum(by("approved")),
      pending: sum(by("submitted")),
      drafts: sum(by("draft")),
      paidYear: sum(paidThisYear),
      paidYearCount: paidThisYear.length,
      draftsNoReceipt: by("draft").filter((c) => !c.hasReceipt).length,
    };
  }, [claims]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = claims.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return [c.number, c.description, c.categoryName, c.reference]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      if (sort === "amount") return b.amount - a.amount;
      const cmp = a.expenseDate.localeCompare(b.expenseDate) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      return sort === "oldest" ? cmp : -cmp;
    });
  }, [claims, filter, query, sort]);

  const visibleTotal = visible.reduce((t, c) => t + c.amount, 0);
  const newClaim = () => {
    setEditingClaim(null);
    setFormOpen(true);
  };

  return (
    <AppPage
      fullWidth
      title="My expense claims"
      subtitle="Log out-of-pocket spend and track reimbursement from the company."
      primaryAction={{ content: "New claim", onAction: newClaim }}
    >
      <div className="mec">
        {error ? (
          <div className="ac-error">
            <span>{error}</span>
            <button className="st-link" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}

        {/* ── Summary ── */}
        <section className={cn("pl-hero mec-hero", loading && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Owed to you</span>
            <span className="pl-hero__value">{formatBaseMoney(stats.owed)}</span>
            <span className="pl-hero__period">
              {stats.counts.approved
                ? `${stats.counts.approved} approved claim${stats.counts.approved === 1 ? "" : "s"} waiting for payment`
                : "Nothing approved is waiting to be paid"}
            </span>
          </div>
          <div className="pl-hero__tiles">
            <button
              type="button"
              className={cn("ac-tile is-link mec-tile", filter === "submitted" && "is-on")}
              onClick={() => setFilter("submitted")}
            >
              <span>Awaiting approval</span>
              <strong>{formatBaseMoney(stats.pending)}</strong>
              <small>
                {stats.counts.submitted} claim{stats.counts.submitted === 1 ? "" : "s"} with finance
              </small>
            </button>
            <button
              type="button"
              className={cn("ac-tile is-link mec-tile", stats.counts.draft > 0 && "is-alert", filter === "draft" && "is-on")}
              onClick={() => setFilter("draft")}
            >
              <span>Drafts</span>
              <strong>{formatBaseMoney(stats.drafts)}</strong>
              <small>
                {stats.counts.draft
                  ? `${stats.counts.draft} not submitted${stats.draftsNoReceipt ? ` · ${stats.draftsNoReceipt} without receipt` : ""}`
                  : "Nothing left to submit"}
              </small>
            </button>
            <button
              type="button"
              className={cn("ac-tile is-link mec-tile", filter === "reimbursed" && "is-on")}
              onClick={() => setFilter("reimbursed")}
            >
              <span>Paid back this year</span>
              <strong>{formatBaseMoney(stats.paidYear)}</strong>
              <small>
                {stats.paidYearCount} claim{stats.paidYearCount === 1 ? "" : "s"} reimbursed
              </small>
            </button>
          </div>

          <ol className="mec-flow" aria-label="How a claim moves">
            {FLOW.map((step, i) => (
              <li key={step.status}>
                <span className="mec-flow__n">{i + 1}</span>
                <span>
                  <b>
                    {step.title}
                    {stats.counts[step.status] ? <em>{stats.counts[step.status]}</em> : null}
                  </b>
                  <small>{step.text}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Claims ── */}
        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters" role="tablist" aria-label="Filter claims by status">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={cn(
                    "iv-filter",
                    filter === f.id && "is-active",
                    f.id === "rejected" && stats.counts.rejected > 0 && "is-alert",
                  )}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span>{stats.counts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  label="Search claims"
                  labelHidden
                  autoComplete="off"
                  placeholder="Search number, description, reference…"
                  prefix={<Icon source={SearchIcon} tone="subdued" />}
                  value={query}
                  onChange={setQuery}
                  clearButton
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
              <Select
                label="Sort"
                labelHidden
                options={SORT_OPTIONS}
                value={sort}
                onChange={(v) => setSort(v as Sort)}
              />
            </div>
          </div>

          {loading && !claims.length ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={6} />
            </div>
          ) : !claims.length ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={ReceiptIcon} />
              </span>
              <Text as="h3" variant="headingMd">
                No claims yet
              </Text>
              <p>
                Paid for something on behalf of the company? Create a claim with the amount and a photo of the
                receipt, then submit it. Finance approves it and pays you back.
              </p>
              <Button variant="primary" onClick={newClaim}>
                New claim
              </Button>
            </div>
          ) : !visible.length ? (
            <div className="ex-empty">
              <Text as="h3" variant="headingSm">
                No claims match
              </Text>
              <p>Try another filter or clear the search.</p>
              <Button
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Show all claims
              </Button>
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              {visible.map((claim) => {
                const { day, month } = dayParts(claim.expenseDate);
                const busy = busyId === claim.id;
                const menuItems = [
                  { content: "View details", icon: ViewIcon, onAction: () => setDetailClaim(claim) },
                  ...(claim.status === "draft"
                    ? [{ content: "Edit", icon: EditIcon, onAction: () => openEdit(claim) }]
                    : []),
                  ...(claim.status === "approved"
                    ? [{ content: "Request edit", icon: EditIcon, onAction: () => promptRequestEdit(claim) }]
                    : []),
                  ...(claim.status === "submitted"
                    ? [{ content: "Cancel submission", icon: UndoIcon, onAction: () => handleWithdraw(claim) }]
                    : []),
                  ...(claim.hasReceipt
                    ? [
                        {
                          content: "Open receipt",
                          icon: NoteIcon,
                          url: getExpenseClaimReceiptUrl(claim.id),
                          external: true,
                        },
                      ]
                    : []),
                  ...(["draft", "submitted", "rejected"].includes(claim.status)
                    ? [
                        {
                          content: "Delete",
                          icon: DeleteIcon,
                          destructive: true,
                          onAction: () => setDeletingClaim(claim),
                        },
                      ]
                    : []),
                ];

                return (
                  <li className="ex-row mec-row" key={claim.id}>
                    <span className="ex-date" title={formatExpenseClaimDate(claim.expenseDate)}>
                      <b>{day}</b>
                      <small>{month}</small>
                    </span>

                    <button className="ex-main" type="button" onClick={() => setDetailClaim(claim)}>
                      <strong>{claim.description}</strong>
                      <small>
                        <span className="ex-num">{claim.number}</span>
                        {claim.categoryName ? <span className="ex-cat">{claim.categoryName}</span> : null}
                        {claim.reference ? <span>Ref {claim.reference}</span> : null}
                      </small>
                      {claim.rejectionReason && (claim.status === "rejected" || claim.status === "draft") ? (
                        <span className="mec-reason">
                          {claim.status === "rejected" ? "Reason: " : "Finance said: "}
                          {claim.rejectionReason}
                        </span>
                      ) : null}
                    </button>

                    <span className="mec-status">
                      <ExpenseClaimStatusBadge status={claim.status} />
                      <small>{statusNote(claim)}</small>
                    </span>

                    <span className="ex-receipt mec-receipt">
                      {claim.hasReceipt ? (
                        <Button
                          external
                          icon={NoteIcon}
                          size="slim"
                          url={getExpenseClaimReceiptUrl(claim.id)}
                          variant="tertiary"
                        >
                          Receipt
                        </Button>
                      ) : claim.noReceiptReason ? (
                        <span className="ex-noreceipt" title={claim.noReceiptReason}>
                          No receipt · reason given
                        </span>
                      ) : claim.status === "draft" ? (
                        <Badge tone="attention" size="small">
                          No receipt
                        </Badge>
                      ) : (
                        <span className="ex-noreceipt">No receipt</span>
                      )}
                    </span>

                    <span className="ex-amount">{formatBaseMoney(claim.amount)}</span>

                    <span className="mec-actions">
                      {claim.status === "draft" ? (
                        <Button size="slim" variant="primary" loading={busy} onClick={() => handleSubmit(claim)}>
                          Submit
                        </Button>
                      ) : claim.status === "rejected" ? (
                        <Button size="slim" loading={busy} onClick={() => handleRevise(claim)}>
                          Revise
                        </Button>
                      ) : null}
                      <Popover
                        active={menuFor === claim.id}
                        activator={
                          <Button
                            accessibilityLabel={`Actions for ${claim.number}`}
                            icon={MenuHorizontalIcon}
                            size="slim"
                            variant="tertiary"
                            disabled={busy}
                            onClick={() => setMenuFor((v) => (v === claim.id ? null : claim.id))}
                          />
                        }
                        preferredAlignment="right"
                        onClose={() => setMenuFor(null)}
                      >
                        <ActionList
                          actionRole="menuitem"
                          onActionAnyItem={() => setMenuFor(null)}
                          items={menuItems}
                        />
                      </Popover>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {visible.length ? (
          <p className="pl-foot">
            Showing {visible.length} of {claims.length} claim{claims.length === 1 ? "" : "s"} · {formatBaseMoney(visibleTotal)}.
            Drafts can be edited or deleted; submitted claims can be pulled back until finance approves them. Approved claims can be
            reopened with a reason until they&apos;re paid.
          </p>
        ) : null}
      </div>

      <ExpenseClaimFormModal
        open={formOpen}
        claim={editingClaim}
        onClose={() => {
          setFormOpen(false);
          setEditingClaim(null);
        }}
        onSaved={async (result) => {
          showSuccess(
            result === "submitted"
              ? "Claim sent to finance for approval"
              : editingClaim
                ? "Draft updated"
                : "Draft saved — submit it when you're ready",
          );
          await load();
        }}
      />

      <ExpenseClaimDetailModal
        open={Boolean(detailClaim)}
        claim={detailClaim}
        mode="mine"
        actionLoading={Boolean(busyId) || deleting}
        onClose={() => setDetailClaim(null)}
        onSubmit={handleSubmit}
        onEdit={openEdit}
        onRevise={handleRevise}
        onRequestEdit={promptRequestEdit}
        onWithdraw={handleWithdraw}
        onDelete={setDeletingClaim}
      />

      <Modal
        open={Boolean(reopeningClaim)}
        onClose={() => setReopeningClaim(null)}
        title={`Edit approved claim ${reopeningClaim?.number ?? ""}`}
        primaryAction={{
          content: "Reopen and edit",
          loading: Boolean(busyId),
          disabled: !editReason.trim(),
          onAction: () => {
            if (reopeningClaim) handleRequestEdit(reopeningClaim);
          },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setReopeningClaim(null) }]}
      >
        <Modal.Section>
          <TextField
            autoComplete="off"
            label="Why does it need editing?"
            helpText="The approval is cancelled and the claim goes back to draft. Finance sees this reason and must approve it again before you're paid."
            maxLength={500}
            multiline={3}
            value={editReason}
            onChange={setEditReason}
          />
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(deletingClaim)}
        onClose={() => setDeletingClaim(null)}
        title={`Delete ${deletingClaim?.number ?? "claim"}?`}
        primaryAction={{
          content: "Delete claim",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDeleteConfirmed(),
        }}
        secondaryActions={[{ content: "Keep it", onAction: () => setDeletingClaim(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            <strong>{deletingClaim?.description}</strong>
            {deletingClaim ? ` (${formatBaseMoney(deletingClaim.amount)})` : ""} and its receipt will be removed. This
            can&apos;t be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
