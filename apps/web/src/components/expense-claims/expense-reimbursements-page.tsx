"use client";

import { Banner, BlockStack, Button, Icon, Modal, Pagination, Select, SkeletonBodyText, Text, TextField } from "@shopify/polaris";
import { ReceiptIcon } from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExpenseClaimDetailModal } from "@/components/expense-claims/expense-claim-detail-modal";
import {
  ExpenseClaimStatusBadge,
  formatExpenseClaimDate,
} from "@/components/expense-claims/expense-claim-utils";
import { ReimburseClaimModal } from "@/components/expense-claims/reimburse-claim-modal";
import { AppPage } from "@/components/layout/page";
import { useAccess } from "@/components/providers/access-provider";
import { cn } from "@/lib/utils";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  approveExpenseClaim,
  listExpenseClaims,
  rejectExpenseClaim,
  sendBackExpenseClaim,
  type ExpenseClaim,
  type ExpenseClaimStatus,
} from "@/lib/expense-claims-api";

const APPROVED_TAB = 1;
const REIMBURSED_TAB = 2;

const STATUS_TABS: Array<{ id: string; content: string; status?: ExpenseClaimStatus }> = [
  { id: "submitted", content: "Submitted", status: "submitted" },
  { id: "approved", content: "Approved (to pay)", status: "approved" },
  { id: "reimbursed", content: "Reimbursed", status: "reimbursed" },
  { id: "rejected", content: "Rejected", status: "rejected" },
  { id: "all", content: "All records" },
];

function emptyMessageForTab(tabIndex: number) {
  switch (tabIndex) {
    case 0:
      return "No claims awaiting review. Submitted claims appear here until you approve or reject them.";
    case APPROVED_TAB:
      return "No approved claims waiting for payment. After you approve a claim, it moves here until you record reimbursement.";
    case REIMBURSED_TAB:
      return "No reimbursed claims yet. Recording reimbursement posts the expense to Profit & Loss and your books.";
    case 3:
      return "No rejected claims.";
    default:
      return "No expense reimbursement claims recorded yet.";
  }
}

function initials(name: string) {
  return name
    .split(/[s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function dateParts(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return { day: String(d.getDate()), month: d.toLocaleDateString(undefined, { month: "short" }) };
}

const PAGE_SIZES = [10, 25, 50];

export function ExpenseReimbursementsPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const { can } = useAccess();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [allClaims, setAllClaims] = useState<ExpenseClaim[]>([]);
  const [summary, setSummary] = useState({
    outstandingApprovedTotal: 0,
    reimbursedThisMonth: 0,
    submittedCount: 0,
  });
  const [selectedTab, setTabState] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);
  const setSelectedTab = (tab: number) => {
    setTabState(tab);
    setPage(1);
  };
  const tabChosenRef = useRef(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingClaim, setRejectingClaim] = useState<ExpenseClaim | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [approvingClaim, setApprovingClaim] = useState<ExpenseClaim | null>(null);
  const [reimburseOpen, setReimburseOpen] = useState(false);
  const [reimbursingClaim, setReimbursingClaim] = useState<ExpenseClaim | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailClaim, setDetailClaim] = useState<ExpenseClaim | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listExpenseClaims();
      setAllClaims(data.claims);
      if (!tabChosenRef.current) {
        tabChosenRef.current = true;
        const hasSubmitted = data.claims.some((c) => c.status === "submitted");
        const hasApproved = data.claims.some((c) => c.status === "approved");
        setTabState(hasSubmitted ? 0 : hasApproved ? APPROVED_TAB : data.claims.length ? 4 : 0);
      }
      setSummary(data.summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredClaims = useMemo(() => {
    const status = STATUS_TABS[selectedTab]?.status;
    const list = status ? allClaims.filter((claim) => claim.status === status) : [...allClaims];
    // Newest first: by expense date, then by when it was created.
    return list.sort(
      (a, b) =>
        b.expenseDate.localeCompare(a.expenseDate) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }, [allClaims, selectedTab]);

  const totalPages = Math.max(1, Math.ceil(filteredClaims.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageClaims = filteredClaims.slice((safePage - 1) * perPage, safePage * perPage);
  const filteredTotal = filteredClaims.reduce((sum, c) => sum + c.amount, 0);

  function openDetail(claim: ExpenseClaim) {
    setDetailClaim(claim);
    setDetailOpen(true);
  }

  function promptApprove(claim: ExpenseClaim) {
    setApprovingClaim(claim);
    setApproveOpen(true);
  }

  async function handleApproveConfirmed() {
    if (!approvingClaim) return;
    setActionId(approvingClaim.id);
    setError(null);
    try {
      await approveExpenseClaim(approvingClaim.id);
      setApproveOpen(false);
      setDetailOpen(false);
      setDetailClaim(null);
      setApprovingClaim(null);
      setSelectedTab(APPROVED_TAB);
      setSuccess(
        `${approvingClaim.number} approved and saved under Approved (to pay). Record reimbursement to post ${formatBaseMoney(approvingClaim.amount)} to the books and Expenses & Petty Cash.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve claim");
    } finally {
      setActionId(null);
    }
  }

  function handleRejectFromDetail(claim: ExpenseClaim) {
    setDetailOpen(false);
    setRejectingClaim(claim);
    setRejectReason("");
    setRejectOpen(true);
  }

  function handleReimburseFromDetail(claim: ExpenseClaim) {
    setDetailOpen(false);
    setReimbursingClaim(claim);
    setReimburseOpen(true);
  }

  // Approved claims go back to draft; submitted ones are rejected.
  const sendingBack = rejectingClaim?.status === "approved";

  async function handleReject() {
    if (!rejectingClaim) return;
    setActionId(rejectingClaim.id);
    setError(null);
    try {
      if (sendingBack) {
        await sendBackExpenseClaim(rejectingClaim.id, rejectReason);
        setSuccess(`Claim ${rejectingClaim.number} sent back to ${rejectingClaim.submitterName || "the employee"} as a draft.`);
      } else {
        await rejectExpenseClaim(rejectingClaim.id, rejectReason);
        setSuccess(`Claim ${rejectingClaim.number} rejected. The record stays under Rejected for audit.`);
      }
      setRejectOpen(false);
      setRejectingClaim(null);
      setRejectReason("");
      setSelectedTab(sendingBack ? 4 : 3);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : sendingBack ? "Failed to send the claim back" : "Failed to reject claim");
    } finally {
      setActionId(null);
    }
  }

  const stage = (status: ExpenseClaimStatus) => {
    const list = allClaims.filter((c) => c.status === status);
    return { count: list.length, total: list.reduce((sum, c) => sum + c.amount, 0) };
  };
  const submittedStage = stage("submitted");
  const approvedStage = stage("approved");
  const reimbursedStage = stage("reimbursed");
  const rejectedStage = stage("rejected");
  const first = loading && allClaims.length === 0;

  const FLOW: Array<{ tab: number; label: string; hint: string; data: { count: number; total: number }; tone: string }> = [
    { tab: 0, label: "Submitted", hint: "Waiting for your review", data: submittedStage, tone: "is-review" },
    { tab: APPROVED_TAB, label: "Approved", hint: "Ready to pay back", data: approvedStage, tone: "is-pay" },
    { tab: REIMBURSED_TAB, label: "Reimbursed", hint: "Paid and posted", data: reimbursedStage, tone: "is-done" },
  ];

  return (
    <AppPage
      secondaryActions={[
        { content: "Expenses & petty cash", url: "/dashboard/accounting/expenses" },
        { content: "My claims", url: "/dashboard/profile/expense-claims" },
      ]}
      subtitle="Staff pay out of pocket, you approve, then pay them back — and it posts to your books."
      title="Expense reimbursements"
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

        {/* Hero */}
        <section className="pl-hero">
          <div className="pl-hero__main">
            <span className="pl-hero__label">Owed to your team</span>
            <strong className="pl-hero__value">{first ? "…" : formatBaseMoney(summary.outstandingApprovedTotal)}</strong>
            <span className="pl-hero__period">
              {approvedStage.count
                ? `${approvedStage.count} approved claim${approvedStage.count === 1 ? "" : "s"} ready to pay`
                : "Nothing waiting to be paid"}
            </span>
            {approvedStage.count ? (
              <div className="er-hero__cta">
                <Button onClick={() => setSelectedTab(APPROVED_TAB)}>Pay approved claims</Button>
              </div>
            ) : null}
          </div>
          <div className="pl-hero__tiles">
            <button className={cn("ac-tile is-link", submittedStage.count > 0 && "is-alert-soft")} type="button" onClick={() => setSelectedTab(0)}>
              <span>Awaiting review</span>
              <strong>{submittedStage.count}</strong>
              <small>{submittedStage.count ? formatBaseMoney(submittedStage.total) : "All caught up"}</small>
            </button>
            <button className="ac-tile is-link" type="button" onClick={() => setSelectedTab(REIMBURSED_TAB)}>
              <span>Reimbursed this month</span>
              <strong>{formatBaseMoney(summary.reimbursedThisMonth)}</strong>
              <small>Posted to Operating Expenses</small>
            </button>
            <div className="ac-tile">
              <span>Rejected</span>
              <strong>{rejectedStage.count}</strong>
              <small>{rejectedStage.count ? formatBaseMoney(rejectedStage.total) : "None"}</small>
            </div>
          </div>
        </section>

        {/* Flow */}
        <div className="er-flow">
          {FLOW.map((step, i) => (
            <button
              className={cn("er-step", step.tone, selectedTab === step.tab && "is-active")}
              key={step.label}
              type="button"
              onClick={() => setSelectedTab(step.tab)}
            >
              <span className="er-step__num">{i + 1}</span>
              <span className="er-step__text">
                <strong>
                  {step.label} <em>{step.data.count}</em>
                </strong>
                <small>
                  {step.hint}
                  {step.data.count ? ` · ${formatBaseMoney(step.data.total)}` : ""}
                </small>
              </span>
            </button>
          ))}
          <div className="er-flow__extra">
            <button className={cn("iv-filter", selectedTab === 3 && "is-active")} type="button" onClick={() => setSelectedTab(3)}>
              Rejected <span>{rejectedStage.count}</span>
            </button>
            <button className={cn("iv-filter", selectedTab === 4 && "is-active")} type="button" onClick={() => setSelectedTab(4)}>
              All <span>{allClaims.length}</span>
            </button>
          </div>
        </div>

        {/* List */}
        <section className="ex-surface">
          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={6} />
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={ReceiptIcon} />
              </span>
              <strong>{allClaims.length === 0 ? "No claims yet" : "Nothing here"}</strong>
              <p>{emptyMessageForTab(selectedTab)}</p>
              {allClaims.length === 0 ? (
                <Button url="/dashboard/profile/expense-claims" variant="primary">
                  Submit a claim
                </Button>
              ) : selectedTab !== APPROVED_TAB && approvedStage.count ? (
                <Button onClick={() => setSelectedTab(APPROVED_TAB)}>
                  {`Pay ${formatBaseMoney(approvedStage.total)} in approved claims`}
                </Button>
              ) : selectedTab !== 4 ? (
                <Button onClick={() => setSelectedTab(4)}>View all claims</Button>
              ) : null}
            </div>
          ) : (
            <ul className="ex-list">
              {pageClaims.map((claim) => {
                const { day, month } = dateParts(claim.expenseDate);
                const busy = actionId === claim.id;
                return (
                  <li className="ex-row er-row" key={claim.id}>
                    <span className="ex-date" title={formatExpenseClaimDate(claim.expenseDate)}>
                      <b>{day}</b>
                      <small>{month}</small>
                    </span>
                    <span className="er-person">
                      <span className="ci-recent__avatar">{initials(claim.submitterName || claim.submitterEmail)}</span>
                      <span>
                        <strong>{claim.submitterName || "—"}</strong>
                        <small>{claim.submitterEmail}</small>
                      </span>
                    </span>
                    <button className="ex-main" type="button" onClick={() => openDetail(claim)}>
                      <strong>{claim.description}</strong>
                      <small>
                        <span className="ex-num">{claim.number}</span>
                        {claim.categoryName && claim.categoryName !== claim.description ? (
                          <span className="ex-cat">{claim.categoryName}</span>
                        ) : null}
                        {claim.editReason ? (
                          <span className="er-warn" title={claim.editReason}>
                            Edited after approval
                          </span>
                        ) : null}
                        {claim.hasReceipt ? <span>Receipt attached</span> : (
                          <span className="er-warn" title={claim.noReceiptReason ?? undefined}>
                            {claim.noReceiptReason ? "No receipt · reason given" : "No receipt"}
                          </span>
                        )}
                      </small>
                    </button>
                    <span className="er-status">
                      <ExpenseClaimStatusBadge status={claim.status} />
                    </span>
                    <span className="ex-amount">{formatBaseMoney(claim.amount)}</span>
                    <span className="er-actions">
                      {claim.status === "submitted" ? (
                        <>
                          <Button loading={busy} size="slim" variant="primary" onClick={() => promptApprove(claim)}>
                            Approve
                          </Button>
                          <Button size="slim" tone="critical" variant="tertiary" onClick={() => handleRejectFromDetail(claim)}>
                            Reject
                          </Button>
                        </>
                      ) : claim.status === "approved" ? (
                        <Button size="slim" variant="primary" onClick={() => handleReimburseFromDetail(claim)}>
                          Pay back
                        </Button>
                      ) : (
                        <Button size="slim" variant="tertiary" onClick={() => openDetail(claim)}>
                          View
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {filteredClaims.length > 0 ? (
            <div className="iv-pager">
              <span>
                Showing{" "}
                <strong>
                  {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filteredClaims.length)}
                </strong>{" "}
                of <strong>{filteredClaims.length}</strong> claim{filteredClaims.length === 1 ? "" : "s"} · total{" "}
                <strong>{formatBaseMoney(filteredTotal)}</strong>
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
          Approving doesn&apos;t touch your books. Paying back posts the amount to Operating Expenses (600000) and it shows up
          on <Link href="/dashboard/accounting/expenses">Expenses &amp; Petty Cash</Link> and{" "}
          <Link href="/dashboard/accounting/profit-loss">Profit &amp; Loss</Link>. Every claim stays on record for audit.
        </p>
      </div>

      <ExpenseClaimDetailModal
        open={detailOpen}
        claim={detailClaim}
        mode="review"
        actionLoading={Boolean(actionId)}
        onClose={() => {
          setDetailOpen(false);
          setDetailClaim(null);
        }}
        onApprove={promptApprove}
        onReject={handleRejectFromDetail}
        onReimburse={handleReimburseFromDetail}
        onSendBack={handleRejectFromDetail}
        onCorrect={can("expense_claims.reimburse") ? handleReimburseFromDetail : undefined}
      />

      <Modal
        open={approveOpen}
        onClose={() => {
          setApproveOpen(false);
          setApprovingClaim(null);
        }}
        title={`Approve ${approvingClaim?.number ?? "claim"}?`}
        primaryAction={{
          content: "Approve claim",
          loading: Boolean(actionId),
          onAction: () => void handleApproveConfirmed(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setApproveOpen(false);
              setApprovingClaim(null);
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Approve {formatBaseMoney(approvingClaim?.amount ?? 0)} for{" "}
              <strong>{approvingClaim?.submitterName}</strong> (
              {approvingClaim?.description})?
            </Text>
            <Text as="p" tone="subdued">
              The claim stays on record under Approved (to pay). It is{" "}
              <strong>not</strong> posted to Profit &amp; Loss until you record
              reimbursement on the next step.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`${sendingBack ? "Send back" : "Reject"} ${rejectingClaim?.number ?? "claim"}`}
        primaryAction={{
          content: sendingBack ? "Send back to draft" : "Reject claim",
          destructive: !sendingBack,
          loading: Boolean(actionId),
          disabled: !rejectReason.trim(),
          onAction: () => void handleReject(),
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setRejectOpen(false) },
        ]}
      >
        <Modal.Section>
          <TextField
            autoComplete="off"
            label={sendingBack ? "What needs to change?" : "Rejection reason"}
            multiline={3}
            value={rejectReason}
            onChange={setRejectReason}
          />
        </Modal.Section>
      </Modal>

      <ReimburseClaimModal
        open={reimburseOpen}
        claim={reimbursingClaim}
        onClose={() => {
          setReimburseOpen(false);
          setReimbursingClaim(null);
        }}
        onReimbursed={async () => {
          const number = reimbursingClaim?.number ?? "";
          const amount = reimbursingClaim?.amount ?? 0;
          setSelectedTab(REIMBURSED_TAB);
          setSuccess(
            reimbursingClaim?.status === "reimbursed"
              ? `${number} payment corrected. The old journal entry was reversed and a new one posted.`
              : `${number} reimbursed (${formatBaseMoney(amount)}). Posted to Operating Expenses — see Expenses & Petty Cash and Profit & Loss.`,
          );
          await load();
        }}
      />
    </AppPage>
  );
}
