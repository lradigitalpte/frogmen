"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Link,
  Modal,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { Banknote, CheckCircle2, Clock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExpenseClaimDetailModal } from "@/components/expense-claims/expense-claim-detail-modal";
import {
  ExpenseClaimStatusBadge,
  formatExpenseClaimDate,
} from "@/components/expense-claims/expense-claim-utils";
import { ReimburseClaimModal } from "@/components/expense-claims/reimburse-claim-modal";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  approveExpenseClaim,
  listExpenseClaims,
  rejectExpenseClaim,
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

export function ExpenseReimbursementsPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [allClaims, setAllClaims] = useState<ExpenseClaim[]>([]);
  const [summary, setSummary] = useState({
    outstandingApprovedTotal: 0,
    reimbursedThisMonth: 0,
    submittedCount: 0,
  });
  const [selectedTab, setSelectedTab] = useState(0);
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
    if (!status) return allClaims;
    return allClaims.filter((claim) => claim.status === status);
  }, [allClaims, selectedTab]);

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
        `${approvingClaim.number} approved and saved under Approved (to pay). Record reimbursement to post AED ${approvingClaim.amount} to Profit & Loss — approval alone does not appear on Expenses or P&L.`,
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

  async function handleReject() {
    if (!rejectingClaim) return;
    setActionId(rejectingClaim.id);
    setError(null);
    try {
      await rejectExpenseClaim(rejectingClaim.id, rejectReason);
      setSuccess(`Claim ${rejectingClaim.number} rejected. The record stays under Rejected for audit.`);
      setRejectOpen(false);
      setRejectingClaim(null);
      setRejectReason("");
      setSelectedTab(3);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject claim");
    } finally {
      setActionId(null);
    }
  }

  const rows = filteredClaims.map((claim, index) => (
    <IndexTable.Row id={claim.id} key={claim.id} position={index}>
      <IndexTable.Cell>
        <Button variant="plain" onClick={() => openDetail(claim)}>
          {claim.number}
        </Button>
      </IndexTable.Cell>
      <IndexTable.Cell>{formatExpenseClaimDate(claim.expenseDate)}</IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="050">
          <Text as="span" fontWeight="semibold">{claim.submitterName}</Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {claim.submitterEmail}
          </Text>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="subdued">{claim.categoryName ?? "—"}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{claim.description}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatBaseMoney(claim.amount)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <ExpenseClaimStatusBadge status={claim.status} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        {claim.hasReceipt ? (
          <Badge tone="success">Attached</Badge>
        ) : (
          <Text as="span" tone="subdued">None</Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="150">
          <Button size="slim" onClick={() => openDetail(claim)}>
            Details
          </Button>
          {claim.status === "submitted" ? (
            <>
              <Button
                size="slim"
                variant="primary"
                loading={actionId === claim.id}
                onClick={() => promptApprove(claim)}
              >
                Approve
              </Button>
              <Button
                size="slim"
                onClick={() => handleRejectFromDetail(claim)}
              >
                Reject
              </Button>
            </>
          ) : null}
          {claim.status === "approved" ? (
            <Button
              size="slim"
              variant="primary"
              onClick={() => handleReimburseFromDetail(claim)}
            >
              Reimburse
            </Button>
          ) : null}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      title="Expense reimbursements"
      subtitle="Review staff out-of-pocket claims, approve, and record reimbursement."
      secondaryActions={[
        {
          content: "Expenses & petty cash",
          url: "/dashboard/accounting/expenses",
        },
        {
          content: "Profit & Loss",
          url: "/dashboard/accounting/profit-loss",
        },
      ]}
    >
      <BlockStack gap="500">
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

        <Banner tone="info">
          Claims are kept on record in each tab — they do not disappear after
          approval. <strong>Approve</strong> only marks ready to pay.{" "}
          <strong>Reimburse</strong> posts to Operating Expenses (600000) and
          then shows on Profit &amp; Loss. It will not appear under Expenses
          &amp; Petty Cash (that page is for company-paid spend only).
        </Banner>

        {summary.outstandingApprovedTotal > 0 ? (
          <Banner tone="warning">
            {formatBaseMoney(summary.outstandingApprovedTotal)} approved and
            awaiting reimbursement. Open the{" "}
            <Button
              variant="plain"
              onClick={() => setSelectedTab(APPROVED_TAB)}
            >
              Approved (to pay)
            </Button>{" "}
            tab and click Reimburse to post to your books.
          </Banner>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            icon={<Clock className="size-5" />}
            label="Submitted"
            value={String(summary.submittedCount)}
            hint="Awaiting review"
            tone="default"
            loading={loading}
          />
          <KpiCard
            icon={<Banknote className="size-5" />}
            label="Approved — outstanding"
            value={formatBaseMoney(summary.outstandingApprovedTotal)}
            hint="To reimburse"
            tone="success"
            loading={loading}
          />
          <KpiCard
            icon={<CheckCircle2 className="size-5" />}
            label="Reimbursed this month"
            value={formatBaseMoney(summary.reimbursedThisMonth)}
            hint="Posted to books"
            tone="default"
            loading={loading}
          />
        </div>

        <Card>
          <BlockStack gap="400">
            <Tabs
              tabs={STATUS_TABS.map(({ id, content }) => ({ id, content }))}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />

            {loading ? (
              <Text as="p" tone="subdued">Loading claims...</Text>
            ) : !filteredClaims.length ? (
              <BlockStack gap="300">
                <Text as="p" tone="subdued">
                  {emptyMessageForTab(selectedTab)}
                </Text>
                {selectedTab === 0 && allClaims.length === 0 ? (
                  <>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        <strong>1.</strong> Profile →{" "}
                        <Link url="/dashboard/profile/expense-claims">
                          My expense claims
                        </Link>
                        {" "}→ New claim → Submit
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>2.</strong> Submitted tab → Approve or Reject
                      </Text>
                      <Text as="p" variant="bodySm">
                        <strong>3.</strong> Approved tab → Reimburse (posts to P&L)
                      </Text>
                    </BlockStack>
                    <Button url="/dashboard/profile/expense-claims">
                      Go to My expense claims
                    </Button>
                  </>
                ) : selectedTab === 0 && summary.outstandingApprovedTotal > 0 ? (
                  <Button onClick={() => setSelectedTab(APPROVED_TAB)}>
                    View {formatBaseMoney(summary.outstandingApprovedTotal)} approved — to pay
                  </Button>
                ) : selectedTab !== 4 ? (
                  <Button onClick={() => setSelectedTab(4)}>
                    View all records
                  </Button>
                ) : null}
              </BlockStack>
            ) : (
              <div className="accounting-report-table">
                <IndexTable
                  selectable={false}
                  itemCount={filteredClaims.length}
                  headings={[
                    { title: "Number" },
                    { title: "Date" },
                    { title: "Employee" },
                    { title: "Category" },
                    { title: "Description" },
                    { title: "Amount", alignment: "end" },
                    { title: "Status" },
                    { title: "Receipt" },
                    { title: "Actions" },
                  ]}
                >
                  {rows}
                </IndexTable>
              </div>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

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
        title={`Reject ${rejectingClaim?.number ?? "claim"}`}
        primaryAction={{
          content: "Reject claim",
          destructive: true,
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
            label="Rejection reason"
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
            `${number} reimbursed and posted to Operating Expenses (${formatBaseMoney(amount)}). Check Profit & Loss — not listed under Expenses & Petty Cash.`,
          );
          await load();
        }}
      />
    </AppPage>
  );
}
