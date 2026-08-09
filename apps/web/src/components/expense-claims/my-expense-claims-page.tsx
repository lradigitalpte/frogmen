"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import { Receipt, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ExpenseClaimDetailModal } from "@/components/expense-claims/expense-claim-detail-modal";
import { ExpenseClaimFormModal } from "@/components/expense-claims/expense-claim-form-modal";
import {
  ExpenseClaimStatusBadge,
  formatExpenseClaimDate,
} from "@/components/expense-claims/expense-claim-utils";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  deleteExpenseClaim,
  listMyExpenseClaims,
  submitExpenseClaim,
  withdrawExpenseClaim,
  type ExpenseClaim,
} from "@/lib/expense-claims-api";

export function MyExpenseClaimsPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [summary, setSummary] = useState({
    submittedCount: 0,
    approvedAwaitingPaymentTotal: 0,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<ExpenseClaim | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailClaim, setDetailClaim] = useState<ExpenseClaim | null>(null);
  const [deletingClaim, setDeletingClaim] = useState<ExpenseClaim | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMyExpenseClaims();
      setClaims(data.claims);
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

  async function handleSubmit(claim: ExpenseClaim) {
    setSubmittingId(claim.id);
    setError(null);
    try {
      await submitExpenseClaim(claim.id);
      setSuccess(`Claim ${claim.number} submitted for approval.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit claim");
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleWithdraw(claim: ExpenseClaim) {
    setActionId(claim.id);
    setError(null);
    try {
      await withdrawExpenseClaim(claim.id);
      setSuccess(
        `Submission cancelled. ${claim.number} is back in draft — you can edit and resubmit.`,
      );
      setDetailOpen(false);
      setDetailClaim(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel submission");
    } finally {
      setActionId(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deletingClaim) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteExpenseClaim(deletingClaim.id);
      setSuccess(`Claim ${deletingClaim.number} deleted.`);
      setDeletingClaim(null);
      setDetailOpen(false);
      setDetailClaim(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete claim");
    } finally {
      setDeleting(false);
    }
  }

  function promptDelete(claim: ExpenseClaim) {
    setDeletingClaim(claim);
  }

  const rows = claims.map((claim, index) => (
    <IndexTable.Row id={claim.id} key={claim.id} position={index}>
      <IndexTable.Cell>
        <Button
          variant="plain"
          onClick={() => {
            setDetailClaim(claim);
            setDetailOpen(true);
          }}
        >
          {claim.number}
        </Button>
      </IndexTable.Cell>
      <IndexTable.Cell>{formatExpenseClaimDate(claim.expenseDate)}</IndexTable.Cell>
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
          <Button
            size="slim"
            onClick={() => {
              setDetailClaim(claim);
              setDetailOpen(true);
            }}
          >
            Details
          </Button>
          {claim.status === "draft" ? (
            <>
              <Button
                size="slim"
                onClick={() => {
                  setEditingClaim(claim);
                  setModalOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="slim"
                variant="primary"
                loading={submittingId === claim.id}
                onClick={() => void handleSubmit(claim)}
              >
                Submit
              </Button>
              <Button
                size="slim"
                tone="critical"
                onClick={() => promptDelete(claim)}
              >
                Delete
              </Button>
            </>
          ) : null}
          {claim.status === "submitted" ? (
            <>
              <Button
                size="slim"
                loading={actionId === claim.id}
                onClick={() => void handleWithdraw(claim)}
              >
                Cancel
              </Button>
              <Button
                size="slim"
                tone="critical"
                onClick={() => promptDelete(claim)}
              >
                Delete
              </Button>
            </>
          ) : null}
          {claim.status === "rejected" ? (
            <>
              <Button
                size="slim"
                tone="critical"
                onClick={() => promptDelete(claim)}
              >
                Delete
              </Button>
            </>
          ) : null}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      title="My expense claims"
      subtitle="Log out-of-pocket spend and track reimbursement from the company."
      primaryAction={{
        content: "New claim",
        onAction: () => {
          setEditingClaim(null);
          setModalOpen(true);
        },
      }}
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
          Draft claims can be edited or deleted. Submitted claims can be
          cancelled (back to draft) or deleted before finance approves them.
        </Banner>

        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            icon={<Receipt className="size-5" />}
            label="Awaiting approval"
            value={String(summary.submittedCount)}
            hint="Submitted claims"
            tone="default"
            loading={loading}
          />
          <KpiCard
            icon={<Wallet className="size-5" />}
            label="Approved — to be paid"
            value={formatBaseMoney(summary.approvedAwaitingPaymentTotal)}
            hint="Outstanding reimbursement"
            tone="success"
            loading={loading}
          />
        </div>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Your claims</Text>
            {loading ? (
              <Text as="p" tone="subdued">Loading claims...</Text>
            ) : !claims.length ? (
              <Text as="p" tone="subdued">
                No claims yet. Create one when you pay for something on behalf
                of the company.
              </Text>
            ) : (
              <div className="accounting-report-table">
                <IndexTable
                  selectable={false}
                  itemCount={claims.length}
                  headings={[
                    { title: "Number" },
                    { title: "Date" },
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

      <ExpenseClaimFormModal
        open={modalOpen}
        claim={editingClaim}
        onClose={() => {
          setModalOpen(false);
          setEditingClaim(null);
        }}
        onSaved={async () => {
          setSuccess(
            editingClaim ? "Claim updated." : "Draft claim saved.",
          );
          await load();
        }}
      />

      <ExpenseClaimDetailModal
        open={detailOpen}
        claim={detailClaim}
        mode="mine"
        actionLoading={Boolean(actionId) || deleting}
        onClose={() => {
          setDetailOpen(false);
          setDetailClaim(null);
        }}
        onWithdraw={(claim) => void handleWithdraw(claim)}
        onDelete={promptDelete}
      />

      <Modal
        open={Boolean(deletingClaim)}
        onClose={() => setDeletingClaim(null)}
        title="Delete expense claim?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDeleteConfirmed(),
        }}
        secondaryActions={[
          { content: "Keep claim", onAction: () => setDeletingClaim(null) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This will permanently remove claim{" "}
            <strong>{deletingClaim?.number}</strong> ({deletingClaim?.description}
            ). This cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
