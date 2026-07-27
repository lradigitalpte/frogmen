"use client";

import {
  Banner,
  BlockStack,
  Button,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  InlineStack,
  Link,
  Modal,
  Text,
  TextField,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { FileText, ShoppingCart, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  quotationStateLabel,
  quotationStateVariant,
  StatusBadge,
} from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount, type CurrencyLike } from "@/lib/currency-utils";
import {
  confirmQuotation,
  deleteQuotation,
  listQuotations,
  sendQuotationEmail,
  type Quotation,
  type QuotationState,
} from "@/lib/quotations-api";
import { useBranchLabels } from "@/hooks/use-branch-labels";
import { useToast } from "@/components/providers/toast-provider";

const tabs: { id: QuotationState | "all"; content: string }[] = [
  { id: "all", content: "All Quotations" },
  { id: "draft", content: "Draft" },
  { id: "sent", content: "Sent" },
  { id: "confirmed", content: "Confirmed Orders" },
  { id: "cancelled", content: "Cancelled" },
];

function stateBadge(state: QuotationState) {
  return (
    <StatusBadge variant={quotationStateVariant(state)}>
      {quotationStateLabel(state)}
    </StatusBadge>
  );
}

function formatQuotationAmount(
  quotation: Quotation,
  formatOrgMoney: (amount: string | number) => string,
  resolveCurrency: (currencyId?: string | null) => CurrencyLike | null,
) {
  const currency = resolveCurrency(quotation.currencyId);
  if (currency) {
    return formatCurrencyAmount(quotation.amountTotal, currency);
  }

  return formatOrgMoney(quotation.amountTotal);
}

export function QuotationsListPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const { formatOrgMoney, formatBaseMoney, baseCurrencyCode, resolveCurrency } = useOrgCurrency();
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [pipelineTotalBase, setPipelineTotalBase] = useState("0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);
  const { showBranchColumn, branchLabel } = useBranchLabels();

  // Email Modal State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quotation | null>(null);
  const [deleteQuote, setDeleteQuote] = useState<Quotation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  const activeTab = tabs[selectedTab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listQuotations({
        page,
        perPage: 16,
        search: debouncedQuery || undefined,
        state: activeTab === "all" ? undefined : activeTab,
        sortBy: "quoteDate",
        sortDir: "desc",
      });

      setQuotations(result.data);
      setTotal(result.meta.total);
      setPipelineTotalBase(result.meta.pipelineTotalBase ?? "0");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load quotations",
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedQuery, page]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedQuery]);

  const emptyState = useMemo(
    () => (
      <EmptyState
        action={{
          content: "Create quotation",
          onAction: () => router.push("/dashboard/sales/quotations/new"),
        }}
        heading="Create your first sales quotation"
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>Build quotes for commercial buyers, then confirm them as sales orders.</p>
      </EmptyState>
    ),
    [router],
  );

  const totalPipeline = useMemo(
    () => parseFloat(pipelineTotalBase) || 0,
    [pipelineTotalBase],
  );

  async function handleConfirmOrder(qId: string) {
    try {
      await confirmQuotation(qId);
      setActionSuccess("Quotation successfully confirmed to Sales Order!");
      void loadQuotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm order");
    }
  }

  async function handleDeleteQuote() {
    if (!deleteQuote) return;
    setDeleting(true);
    try {
      await deleteQuotation(deleteQuote.id);
      showSuccess(`Cancelled quotation ${deleteQuote.number} deleted.`);
      setDeleteQuote(null);
      await loadQuotations();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete quotation";
      setError(message);
      showError(message);
    } finally {
      setDeleting(false);
    }
  }

  function openEmailModal(quote: Quotation) {
    setSelectedQuote(quote);
    setEmailRecipient(quote.customerEmail || "");
    setEmailSubject(`Commercial Quotation ${quote.number} - Subsea Equipment`);
    setEmailBody(
      `Dear ${quote.customerName || "Customer"},\n\nPlease find attached Commercial Quotation ${quote.number} for your subsea equipment requirement.\n\nTotal Amount: ${formatQuotationAmount(quote, formatOrgMoney, resolveCurrency)}\n\nBest regards,\nFrogmen Subsea ERP`
    );
    setEmailModalOpen(true);
  }

  async function handleSendEmail() {
    if (!selectedQuote) return;
    setEmailSending(true);
    try {
      await sendQuotationEmail(selectedQuote.id, emailRecipient, emailSubject, emailBody);
      setActionSuccess(`Quotation PDF email dispatched to ${emailRecipient}`);
      setEmailModalOpen(false);
      void loadQuotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  const rowMarkup = quotations.map((quotation, index) => {
    const viewHref = `/dashboard/sales/quotations/${quotation.id}`;
    const editHref = `/dashboard/sales/quotations/${quotation.id}/edit`;

    return (
      <IndexTable.Row id={quotation.id} key={quotation.id} position={index}>
        <IndexTable.Cell>
          <Link url={viewHref}>
            <Text as="span" fontWeight="bold">
              {quotation.number}
            </Text>
          </Link>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" fontWeight="semibold">
              {quotation.customerName ?? "Customer Account"}
            </Text>
            {quotation.customerReference && (
              <Text as="span" tone="subdued" variant="bodySm">
                Ref: {quotation.customerReference}
              </Text>
            )}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{quotation.quoteDate}</IndexTable.Cell>
        {showBranchColumn ? (
          <IndexTable.Cell>{branchLabel(quotation.branchId)}</IndexTable.Cell>
        ) : null}
        <IndexTable.Cell>{stateBadge(quotation.state)}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" fontWeight="bold" alignment="end">
            {formatQuotationAmount(quotation, formatOrgMoney, resolveCurrency)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="150" blockAlign="center">
            <Button
              size="slim"
              variant="primary"
              onClick={() => router.push(viewHref)}
            >
              View Invoice
            </Button>

            <Button
              size="slim"
              onClick={() => router.push(editHref)}
            >
              Edit
            </Button>

            <Button
              size="slim"
              onClick={() => openEmailModal(quotation)}
            >
              Send Email
            </Button>

            {quotation.state === "sent" ? (
              <Button
                size="slim"
                tone="success"
                onClick={() => void handleConfirmOrder(quotation.id)}
              >
                Confirm
              </Button>
            ) : null}

            {quotation.state === "cancelled" ? (
              <Button
                size="slim"
                tone="critical"
                onClick={() => setDeleteQuote(quotation)}
              >
                Delete
              </Button>
            ) : null}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <AppPage
      backAction={{ content: "Home", url: "/dashboard" }}
      fullWidth
      primaryAction={{
        content: "+ Create Quotation",
        onAction: () => router.push("/dashboard/sales/quotations/new"),
      }}
      subtitle="Quotations become confirmed sales orders when approved by customers."
      title="Quotations & Sales Orders"
    >
      <BlockStack gap="400">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            icon={<TrendingUp className="size-5" />}
            label="Total Quotation Pipeline"
            value={formatBaseMoney(totalPipeline)}
            hint={`Total active quote value in ${baseCurrencyCode}`}
            tone="default"
            loading={loading}
          />
          <KpiCard
            icon={<FileText className="size-5" />}
            label="Active Drafts"
            value={`${quotations.filter((q) => q.state === "draft").length} drafts`}
            hint="Pending completion"
            tone="muted"
            loading={loading}
          />
          <KpiCard
            icon={<ShoppingCart className="size-5" />}
            label="Confirmed Orders"
            value={`${quotations.filter((q) => q.state === "confirmed").length} orders`}
            hint="Ready to invoice"
            tone="success"
            loading={loading}
          />
        </div>

        {actionSuccess ? (
          <Banner tone="success" onDismiss={() => setActionSuccess(null)}>
            {actionSuccess}
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <IndexSurface>
          <IndexFilters
            canCreateNewView={false}
            cancelAction={{
              onAction: () => setQuery(""),
              disabled: false,
              loading: false,
            }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search quotations by quote number, customer name, or reference..."
            queryValue={query}
            selected={selectedTab}
            tabs={tabs}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={setSelectedTab}
            setMode={setMode}
          />

          <IndexTable
            emptyState={emptyState}
            headings={[
              { title: "Quotation Number" },
              { title: "Customer Account" },
              { title: "Date" },
              ...(showBranchColumn ? [{ title: "Branch" }] : []),
              { title: "Status" },
              { title: "Total Amount", alignment: "end" },
              { title: "Actions" },
            ]}
            itemCount={total}
            loading={loading}
            pagination={{
              hasNext: page * 16 < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "quotation", plural: "quotations" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>

      {/* Send Email Modal */}
      <Modal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        title={`Send Commercial Quotation ${selectedQuote?.number} to Customer`}
        primaryAction={{
          content: "Dispatch Quotation Email",
          loading: emailSending,
          onAction: () => void handleSendEmail(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setEmailModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              autoComplete="email"
              label="Recipient Customer Email"
              value={emailRecipient}
              onChange={setEmailRecipient}
            />
            <TextField
              autoComplete="off"
              label="Email Subject"
              value={emailSubject}
              onChange={setEmailSubject}
            />
            <TextField
              autoComplete="off"
              label="Email Body Preview"
              multiline={5}
              value={emailBody}
              onChange={setEmailBody}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={deleteQuote !== null}
        onClose={() => setDeleteQuote(null)}
        title={`Delete cancelled quotation ${deleteQuote?.number ?? ""}?`}
        primaryAction={{
          content: "Delete quotation",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDeleteQuote(),
        }}
        secondaryActions={[
          { content: "Keep quotation", onAction: () => setDeleteQuote(null) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p">
              This removes the cancelled quotation from normal lists. Its audit
              history and document number remain recorded.
            </Text>
            <Text as="p" fontWeight="semibold">
              Only cancelled quotations can be deleted.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
