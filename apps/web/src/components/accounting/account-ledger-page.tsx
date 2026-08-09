"use client";

import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  InlineGrid,
  InlineStack,
  Link,
  Pagination,
  Select,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AsOfDateFilter,
  resolveAsOfDate,
  type AsOfPreset,
} from "@/components/accounting/as-of-date-filter";
import {
  DateRangeFilter,
  presetRange,
  type DatePreset,
} from "@/components/accounting/date-range-filter";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  getAccountLedger,
  getJournalMoveDetail,
  type AccountLedgerEntry,
  type AccountLedgerReport,
  type JournalMoveDetail,
} from "@/lib/accounting-api";
import { Landmark, Receipt, Scale } from "lucide-react";

interface AccountLedgerPageProps {
  accountId: string;
}

function formatLedgerDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sourceUrl(entry: AccountLedgerEntry) {
  if (entry.source.invoiceId) {
    return `/dashboard/invoices/${entry.source.invoiceId}`;
  }
  return null;
}

function sourceLinkLabel(entry: AccountLedgerEntry) {
  switch (entry.source.type) {
    case "invoice":
      return `Invoice ${entry.source.label ?? ""}`.trim();
    case "payment":
      return entry.source.label
        ? `Payment · ${entry.source.label}`
        : "View payment invoice";
    case "expense":
      return "View expense entry";
    default:
      return entry.source.label ?? "View source";
  }
}

function LedgerEntryCard({
  entry,
  expandedMoveId,
  moveDetail,
  moveLoading,
  formatBaseMoney,
  onToggleMove,
}: {
  entry: AccountLedgerEntry;
  expandedMoveId: string | null;
  moveDetail: JournalMoveDetail | null;
  moveLoading: boolean;
  formatBaseMoney: (value: number) => string;
  onToggleMove: (moveId: string) => void;
}) {
  const url = sourceUrl(entry);
  const isExpanded = expandedMoveId === entry.moveId;

  return (
    <Box
      background="bg-surface-secondary"
      borderColor="border"
      borderRadius="300"
      borderWidth="025"
      padding="400"
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" wrap>
          <BlockStack gap="100">
            <Text as="p" fontWeight="semibold" variant="bodyMd">
              {entry.label}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {formatLedgerDate(entry.moveDate)} · {entry.journalCode} ·{" "}
              {entry.moveName}
              {entry.reference ? ` · ${entry.reference}` : ""}
            </Text>
          </BlockStack>
          <BlockStack gap="050">
            <Text as="p" fontWeight="semibold">
              {formatBaseMoney(entry.amount)}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Dr {formatBaseMoney(entry.debit)} · Cr{" "}
              {formatBaseMoney(entry.credit)}
            </Text>
          </BlockStack>
        </InlineStack>

        <InlineStack gap="300" wrap>
          {url ? (
            <Link url={url}>{sourceLinkLabel(entry)}</Link>
          ) : null}
          <Button variant="plain" onClick={() => onToggleMove(entry.moveId)}>
            {isExpanded ? "Hide full posting" : "View full posting"}
          </Button>
        </InlineStack>

        <Collapsible id={`move-${entry.moveId}`} open={isExpanded}>
          {moveLoading && isExpanded ? (
            <Spinner accessibilityLabel="Loading posting" size="small" />
          ) : null}
          {moveDetail && isExpanded ? (
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">
                  Journal entry (double-entry)
                </Text>
                <div className="accounting-report-table overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr>
                        <th className="py-2 text-left">Account</th>
                        <th className="py-2 text-left">Label</th>
                        <th className="py-2 text-right">Debit</th>
                        <th className="py-2 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moveDetail.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-2">
                            <Link
                              url={`/dashboard/accounting/chart-of-accounts/${line.accountId}`}
                            >
                              {line.accountCode} {line.accountName}
                            </Link>
                          </td>
                          <td className="py-2">{line.label}</td>
                          <td className="py-2 text-right">
                            {line.debit > 0
                              ? formatBaseMoney(line.debit)
                              : "—"}
                          </td>
                          <td className="py-2 text-right">
                            {line.credit > 0
                              ? formatBaseMoney(line.credit)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </BlockStack>

              {moveDetail.cogsLines.length > 0 ? (
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    COGS detail (product costs at invoice post)
                  </Text>
                  <div className="accounting-report-table overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr>
                          <th className="py-2 text-left">Product</th>
                          <th className="py-2 text-left">Serial</th>
                          <th className="py-2 text-right">Qty</th>
                          <th className="py-2 text-right">Unit cost</th>
                          <th className="py-2 text-right">COGS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moveDetail.cogsLines.map((line, index) => (
                          <tr key={`${line.productName}-${index}`}>
                            <td className="py-2">
                              {line.productUnitId ? (
                                <Link
                                  url={`/dashboard/inventory/units/${line.productUnitId}`}
                                >
                                  {line.productName}
                                </Link>
                              ) : (
                                line.productName
                              )}
                            </td>
                            <td className="py-2">
                              {line.serialNumber ?? "—"}
                            </td>
                            <td className="py-2 text-right">{line.quantity}</td>
                            <td className="py-2 text-right">
                              {line.unitCost
                                ? formatBaseMoney(Number(line.unitCost))
                                : "—"}
                            </td>
                            <td className="py-2 text-right">
                              {formatBaseMoney(Number(line.costAmount))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </BlockStack>
              ) : null}

              {moveDetail.move.invoiceId ? (
                <InlineStack gap="200">
                  <Link url={`/dashboard/invoices/${moveDetail.move.invoiceId}`}>
                    Open invoice {moveDetail.move.invoiceNumber ?? ""}
                  </Link>
                </InlineStack>
              ) : null}
            </BlockStack>
          ) : null}
        </Collapsible>
      </BlockStack>
    </Box>
  );
}

export function AccountLedgerPage({ accountId }: AccountLedgerPageProps) {
  const searchParams = useSearchParams();
  const { formatBaseMoney } = useOrgCurrency();

  const initialAsOf = searchParams.get("asOf") ?? todayIsoDate();

  const [asOfPreset, setAsOfPreset] = useState<AsOfPreset>("custom");
  const [asOf, setAsOf] = useState(initialAsOf);
  const [rangePreset, setRangePreset] = useState<DatePreset>("ytd");
  const [dateFrom, setDateFrom] = useState(
    presetRange("ytd", "", "").dateFrom,
  );
  const [dateTo, setDateTo] = useState(todayIsoDate());
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [journalCode, setJournalCode] = useState("");
  const [page, setPage] = useState(1);

  const [ledger, setLedger] = useState<AccountLedgerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMoveId, setExpandedMoveId] = useState<string | null>(null);
  const [moveDetail, setMoveDetail] = useState<JournalMoveDetail | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);

  const resolvedAsOf = resolveAsOfDate(asOfPreset, asOf);
  const resolvedRange = presetRange(rangePreset, dateFrom, dateTo);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLedger(
        await getAccountLedger(accountId, {
          asOf: resolvedAsOf,
          dateFrom: resolvedRange.dateFrom,
          dateTo: resolvedRange.dateTo,
          search: appliedSearch,
          journalCode: journalCode || undefined,
          page,
          perPage: 25,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ledger");
      setLedger(null);
    } finally {
      setLoading(false);
    }
  }, [
    accountId,
    resolvedAsOf,
    resolvedRange.dateFrom,
    resolvedRange.dateTo,
    appliedSearch,
    journalCode,
    page,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleMove(moveId: string) {
    if (expandedMoveId === moveId) {
      setExpandedMoveId(null);
      setMoveDetail(null);
      return;
    }

    setExpandedMoveId(moveId);
    setMoveLoading(true);
    try {
      setMoveDetail(await getJournalMoveDetail(moveId));
    } catch {
      setMoveDetail(null);
    } finally {
      setMoveLoading(false);
    }
  }

  const journalOptions = useMemo(() => {
    const codes = ledger?.journalCodes ?? [];
    return [
      { label: "All journals", value: "" },
      ...codes.map((code) => ({ label: code, value: code })),
    ];
  }, [ledger?.journalCodes]);

  const backUrl = `/dashboard/accounting/chart-of-accounts?asOf=${resolvedAsOf}`;

  return (
    <AppPage
      title={
        ledger
          ? `${ledger.account.code} · ${ledger.account.name}`
          : "Account ledger"
      }
      subtitle="Posted journal lines on this GL account — filter, verify, and open source documents."
      backAction={{ content: "Chart of Accounts", url: backUrl }}
      primaryAction={{
        content: "Profit & Loss",
        url: "/dashboard/accounting/profit-loss",
      }}
      secondaryActions={[
        {
          content: "Balance Sheet",
          url: "/dashboard/accounting/balance-sheet",
        },
      ]}
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Filters
            </Text>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <AsOfDateFilter
                asOf={asOf}
                loading={loading}
                onApply={() => {
                  setPage(1);
                  void load();
                }}
                onAsOfChange={setAsOf}
                onPresetChange={(nextPreset) => {
                  setAsOfPreset(nextPreset);
                  if (nextPreset !== "custom") {
                    setAsOf(resolveAsOfDate(nextPreset, asOf));
                  }
                }}
                preset={asOfPreset}
                summary={`Balance as of ${formatLedgerDate(resolvedAsOf)}`}
              />
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                loading={loading}
                onApply={() => {
                  setPage(1);
                  void load();
                }}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onPresetChange={(nextPreset) => {
                  setRangePreset(nextPreset);
                  if (nextPreset !== "custom") {
                    const range = presetRange(nextPreset, dateFrom, dateTo);
                    setDateFrom(range.dateFrom);
                    setDateTo(range.dateTo);
                  }
                }}
                preset={rangePreset}
                summary={`Entries ${formatLedgerDate(resolvedRange.dateFrom)} – ${formatLedgerDate(resolvedRange.dateTo)}`}
              />
            </InlineGrid>
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
              <TextField
                autoComplete="off"
                label="Search"
                placeholder="Invoice, label, reference…"
                value={search}
                onChange={setSearch}
                connectedRight={
                  <Button
                    onClick={() => {
                      setAppliedSearch(search);
                      setPage(1);
                    }}
                  >
                    Search
                  </Button>
                }
              />
              <Select
                label="Journal"
                options={journalOptions}
                value={journalCode}
                onChange={(value) => {
                  setJournalCode(value);
                  setPage(1);
                }}
              />
              <InlineStack align="end" blockAlign="end">
                <Button
                  onClick={() => {
                    setSearch("");
                    setAppliedSearch("");
                    setJournalCode("");
                    setPage(1);
                  }}
                  variant="tertiary"
                >
                  Clear filters
                </Button>
              </InlineStack>
            </InlineGrid>
          </BlockStack>
        </Card>

        {ledger ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              icon={<Landmark className="size-5" />}
              label="Balance as of date"
              value={formatBaseMoney(ledger.account.balance)}
              hint={formatLedgerDate(ledger.account.asOf)}
            />
            <KpiCard
              icon={<Receipt className="size-5" />}
              label="Period activity (net)"
              value={formatBaseMoney(ledger.periodTotals.net)}
              hint={`Dr ${formatBaseMoney(ledger.periodTotals.debit)} · Cr ${formatBaseMoney(ledger.periodTotals.credit)}`}
            />
            <KpiCard
              icon={<Scale className="size-5" />}
              label="Matching entries"
              value={String(ledger.meta.total)}
              hint={`Page ${ledger.meta.page} of ${ledger.meta.totalPages}`}
            />
          </div>
        ) : null}

        <Card>
          {loading ? (
            <InlineStack align="center" blockAlign="center" gap="200">
              <Spinner accessibilityLabel="Loading ledger" size="small" />
              <Text as="span" tone="subdued">
                Loading entries...
              </Text>
            </InlineStack>
          ) : null}

          {!loading && ledger && ledger.entries.length === 0 ? (
            <Banner tone="info">
              No journal lines match your filters on this account.
            </Banner>
          ) : null}

          {!loading && ledger && ledger.entries.length > 0 ? (
            <BlockStack gap="400">
              {ledger.entries.map((entry) => (
                <LedgerEntryCard
                  key={entry.id}
                  entry={entry}
                  expandedMoveId={expandedMoveId}
                  formatBaseMoney={formatBaseMoney}
                  moveDetail={
                    expandedMoveId === entry.moveId ? moveDetail : null
                  }
                  moveLoading={moveLoading && expandedMoveId === entry.moveId}
                  onToggleMove={(moveId) => void toggleMove(moveId)}
                />
              ))}

              {ledger.meta.totalPages > 1 ? (
                <InlineStack align="center">
                  <Pagination
                    hasNext={ledger.meta.page < ledger.meta.totalPages}
                    hasPrevious={ledger.meta.page > 1}
                    onNext={() => setPage((current) => current + 1)}
                    onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                    label={`Page ${ledger.meta.page} of ${ledger.meta.totalPages}`}
                  />
                </InlineStack>
              ) : null}
            </BlockStack>
          ) : null}
        </Card>
      </BlockStack>
    </AppPage>
  );
}
