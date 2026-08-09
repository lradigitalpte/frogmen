"use client";

import {
  Banner,
  BlockStack,
  Box,
  Button,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  InlineStack,
  Link,
  Modal,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { FileText, ShoppingCart, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { SendDocumentEmailModal } from "@/components/documents/send-document-email-modal";
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
    setEmailModalOpen(true);
  }

  async function handleSendEmail(input: {
    recipientEmail: string;
    subject: string;
    body: string;
  }) {
    if (!selectedQuote) return;
    setEmailSending(true);
    try {
      await sendQuotationEmail(
        selectedQuote.id,
        input.recipientEmail,
        input.subject,
        input.body,
      );
      setActionSuccess(`Quotation PDF email dispatched to ${input.recipientEmail}`);
      setEmailModalOpen(false);
      void loadQuotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  // Collapsed deal state (map of dealId -> boolean)
  const [collapsedDeals, setCollapsedDeals] = useState<Record<string, boolean>>({});

  const toggleDealCollapse = (dealId: string) => {
    setCollapsedDeals((prev) => ({
      ...prev,
      [dealId]: !prev[dealId],
    }));
  };

  // Group quotations by dealId or render individually
  const groupedRows = useMemo(() => {
    const groups: { dealId: string | null; items: Quotation[] }[] = [];
    const dealMap = new Map<string, Quotation[]>();
    const nonDealItems: Quotation[] = [];

    quotations.forEach((q) => {
      if (q.dealId) {
        if (!dealMap.has(q.dealId)) {
          dealMap.set(q.dealId, []);
        }
        dealMap.get(q.dealId)!.push(q);
      } else {
        nonDealItems.push(q);
      }
    });

    // Sort items within each deal so latest is first
    dealMap.forEach((items) => {
      items.sort((a, b) => b.number.localeCompare(a.number, undefined, { numeric: true }));
    });

    const processedDeals = new Set<string>();
    quotations.forEach((q) => {
      if (q.dealId && !processedDeals.has(q.dealId)) {
        processedDeals.add(q.dealId);
        groups.push({ dealId: q.dealId, items: dealMap.get(q.dealId)! });
      } else if (!q.dealId) {
        groups.push({ dealId: null, items: [q] });
      }
    });

    return groups;
  }, [quotations]);

  let rowIndexCounter = 0;

  const rowMarkup = groupedRows.map((group) => {
    if (group.dealId && group.items.length > 1) {
      // Render Deal Thread Group
      const mainCustomer = group.items[0]?.customerName ?? "Customer";
      const totalRevisions = group.items.length;
      const latestItem = group.items[0];
      const isCollapsed = collapsedDeals[group.dealId] ?? true;

      return (
        <React.Fragment key={`deal-group-${group.dealId}`}>
          {/* Thread Header Row */}
          <IndexTable.Row
            id={`deal-header-${group.dealId}`}
            position={rowIndexCounter++}
            selected={false}
            onClick={() => toggleDealCollapse(group.dealId!)}
          >
            <IndexTable.Cell colSpan={showBranchColumn ? 7 : 6}>
              <Box background="bg-surface-tertiary" padding="200" borderRadius="150">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      size="slim"
                      variant="plain"
                      accessibilityLabel={isCollapsed ? "Expand deal thread" : "Collapse deal thread"}
                      onClick={(e?: React.MouseEvent) => {
                        e?.stopPropagation?.();
                        toggleDealCollapse(group.dealId!);
                      }}
                    >
                      {isCollapsed ? "▶" : "▼"}
                    </Button>
                    <Text as="span" variant="headingSm" fontWeight="bold">
                      📁 Deal Thread: {mainCustomer}
                    </Text>
                    <StatusBadge variant="info">
                      {`${totalRevisions} Revisions`}
                    </StatusBadge>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Latest: {latestItem?.number} ({latestItem?.quoteDate})
                    </Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued">
                      {isCollapsed ? "[Click to Expand]" : "[Click to Collapse]"}
                    </Text>
                  </InlineStack>
                </InlineStack>
              </Box>
            </IndexTable.Cell>
          </IndexTable.Row>

          {/* Child Rows for this Deal (only rendered if not collapsed) */}
          {!isCollapsed &&
            group.items.map((quotation) => {
              const viewHref = `/dashboard/sales/quotations/${quotation.id}`;
              const editHref = `/dashboard/sales/quotations/${quotation.id}/edit`;
              const isCancelled = quotation.state === "cancelled";

            return (
              <IndexTable.Row
                id={quotation.id}
                key={quotation.id}
                position={rowIndexCounter++}
                onClick={() => router.push(viewHref)}
              >
                <IndexTable.Cell>
                  <div style={{ paddingLeft: 20, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--p-color-text-subdued)", fontSize: 14 }}>└──</span>
                    <Link url={viewHref}>
                      <span style={{ textDecoration: isCancelled ? "line-through" : "none", opacity: isCancelled ? 0.7 : 1 }}>
                        <Text as="span" fontWeight="bold">
                          {quotation.number}
                        </Text>
                      </span>
                    </Link>
                  </div>
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
                      onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); router.push(viewHref); }}
                    >
                      View Quote
                    </Button>

                    <Button
                      size="slim"
                      onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); router.push(editHref); }}
                    >
                      Edit
                    </Button>

                    {quotation.state === "draft" || quotation.state === "sent" ? (
                      <Button
                        size="slim"
                        onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); openEmailModal(quotation); }}
                      >
                        Send Email
                      </Button>
                    ) : null}

                    {quotation.state === "sent" ? (
                      <Button
                        size="slim"
                        tone="success"
                        onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); void handleConfirmOrder(quotation.id); }}
                      >
                        Confirm
                      </Button>
                    ) : null}

                    {quotation.state === "cancelled" ? (
                      <Button
                        size="slim"
                        tone="critical"
                        onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); setDeleteQuote(quotation); }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </InlineStack>
                </IndexTable.Cell>
              </IndexTable.Row>
            );
          })}
        </React.Fragment>
      );
    }

    // Standard standalone row
    const quotation = group.items[0];
    const viewHref = `/dashboard/sales/quotations/${quotation.id}`;
    const editHref = `/dashboard/sales/quotations/${quotation.id}/edit`;

    return (
      <IndexTable.Row
        id={quotation.id}
        key={quotation.id}
        position={rowIndexCounter++}
        onClick={() => router.push(viewHref)}
      >
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
              onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); router.push(viewHref); }}
            >
              View Quote
            </Button>

            <Button
              size="slim"
              onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); router.push(editHref); }}
            >
              Edit
            </Button>

            {quotation.state === "draft" || quotation.state === "sent" ? (
              <Button
                size="slim"
                onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); openEmailModal(quotation); }}
              >
                Send Email
              </Button>
            ) : null}

            {quotation.state === "sent" ? (
              <Button
                size="slim"
                tone="success"
                onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); void handleConfirmOrder(quotation.id); }}
              >
                Confirm
              </Button>
            ) : null}

            {quotation.state === "cancelled" ? (
              <Button
                size="slim"
                tone="critical"
                onClick={(e?: React.MouseEvent) => { e?.stopPropagation?.(); setDeleteQuote(quotation); }}
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

      <SendDocumentEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        title={`Send quotation ${selectedQuote?.number ?? ""} to customer`}
        pdfLabel={selectedQuote ? `quotation-${selectedQuote.number}.pdf` : undefined}
        loading={emailSending}
        documentType="quotation"
        recipient={selectedQuote?.customerEmail ?? ""}
        placeholders={{
          number: selectedQuote?.number ?? "",
          customerName: selectedQuote?.customerName ?? "Customer",
          companyName: "",
          total: selectedQuote
            ? formatQuotationAmount(selectedQuote, formatOrgMoney, resolveCurrency)
            : "",
        }}
        primaryActionLabel="Dispatch quotation email"
        onSend={handleSendEmail}
      />

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
