"use client";

import {
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  InlineStack,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
  TextField,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  MAX_DAILY_DAYS,
  fetchAnalytics,
  getPresets,
  previousRange,
  rangeDays,
  rangeError,
  resolveGroupBy,
  type AnalyticsData,
  type AnalyticsGroupBy,
  type DateRange,
  type GroupByChoice,
  type PresetId,
} from "@/lib/analytics-api";
import { ANALYTICS_SECTIONS, type AnalyticsSection } from "@/lib/analytics-sections";
import { formatAppDate } from "@/lib/format-date";
import { MetricGrid } from "./analytics-ui";
import { TabInvoices } from "./tab-invoices";
import { TabPurchasing } from "./tab-purchasing";
import { TabQuotations } from "./tab-quotations";
import { TabSales } from "./tab-sales";

const FILTER_STORAGE_KEY = "frogmen-analytics-filter";

interface Filter {
  period: PresetId | "custom";
  /** The applied custom range, used when period is "custom". */
  custom: DateRange | null;
  groupBy: GroupByChoice;
}

const DEFAULT_FILTER: Filter = { period: "year", custom: null, groupBy: "auto" };

function readStoredFilter(): Filter {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(FILTER_STORAGE_KEY) ?? "null") as Filter | null;
    if (!stored) return DEFAULT_FILTER;
    const custom = stored.custom && !rangeError(stored.custom) ? stored.custom : null;
    const validPeriod =
      stored.period === "custom" ? custom !== null : getPresets().some((p) => p.id === stored.period);
    return {
      period: validPeriod ? stored.period : DEFAULT_FILTER.period,
      custom,
      groupBy: ["auto", "day", "week", "month"].includes(stored.groupBy) ? stored.groupBy : "auto",
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

function formatRange(from: string, to: string) {
  return `${formatAppDate(from) || from} – ${formatAppDate(to) || to}`;
}

export function AnalyticsDashboard({ section }: { section: AnalyticsSection }) {
  const presets = useMemo(() => getPresets(), []);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{ data: AnalyticsData; groupBy: AnalyticsGroupBy } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Read the remembered period after mount (sessionStorage is client-only).
  useEffect(() => {
    const stored = readStoredFilter();
    setFilter(stored);
    if (stored.period === "custom" && stored.custom) {
      setDraft(stored.custom);
      setCustomOpen(true);
    }
  }, []);

  const active = useMemo(() => {
    const { period, custom, groupBy } = filter ?? DEFAULT_FILTER;
    const preset = presets.find((p) => p.id === period) ?? presets[presets.length - 1];
    const current = period === "custom" && custom ? custom : preset.current;
    const compare = period === "custom" && custom ? previousRange(custom) : preset.compare;
    return { current, compare, groupBy: resolveGroupBy(groupBy, current) };
  }, [filter, presets]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalytics(active);
      if (id === requestId.current) setResult({ data, groupBy: active.groupBy });
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof Error ? err.message : "Failed to load analytics data");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    if (filter) void load();
  }, [filter, load]);

  function applyFilter(changes: Partial<Filter>) {
    const next = { ...(filter ?? DEFAULT_FILTER), ...changes };
    setFilter(next);
    try {
      window.sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore — filter simply won't be remembered
    }
  }

  function choosePreset(period: PresetId) {
    setCustomOpen(false);
    applyFilter({ period });
  }

  function openCustom() {
    if (!customOpen) setDraft(active.current);
    setCustomOpen(true);
  }

  const draftError = customOpen ? rangeError(draft) : null;
  const dailyTooLong = rangeDays(active.current) > MAX_DAILY_DAYS;
  const chosenGroupBy = filter?.groupBy ?? "auto";
  const period = filter?.period ?? DEFAULT_FILTER.period;

  const meta = ANALYTICS_SECTIONS[section];

  return (
    <AppPage title={meta.title} subtitle={meta.subtitle}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" gap="300">
              <ButtonGroup variant="segmented">
                {presets.map((p) => (
                  <Button
                    key={p.id}
                    pressed={!customOpen && period === p.id}
                    onClick={() => choosePreset(p.id)}
                  >
                    {p.label}
                  </Button>
                ))}
                <Button pressed={customOpen} onClick={openCustom}>
                  Custom
                </Button>
              </ButtonGroup>
              <InlineStack gap="200" blockAlign="center">
                <Select
                  label="Group by"
                  labelInline
                  options={[
                    { label: "Auto", value: "auto" },
                    { label: "Day", value: "day", disabled: dailyTooLong },
                    { label: "Week", value: "week" },
                    { label: "Month", value: "month" },
                  ]}
                  value={chosenGroupBy === "day" && dailyTooLong ? "week" : chosenGroupBy}
                  onChange={(value) => applyFilter({ groupBy: value as GroupByChoice })}
                />
                <Button icon={RefreshIcon} loading={loading} onClick={() => void load()}>
                  Refresh
                </Button>
              </InlineStack>
            </InlineStack>

            {customOpen ? (
              <InlineStack gap="300" blockAlign="end">
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
                <Button
                  disabled={draftError !== null}
                  variant="primary"
                  onClick={() => applyFilter({ period: "custom", custom: draft })}
                >
                  Apply
                </Button>
                {draftError ? (
                  <Text as="span" tone="critical" variant="bodySm">
                    {draftError}
                  </Text>
                ) : null}
              </InlineStack>
            ) : null}

            {filter ? (
              <Text as="p" tone="subdued" variant="bodySm">
                {formatRange(active.current.from, active.current.to)} · compared with{" "}
                {formatRange(active.compare.from, active.compare.to)}
              </Text>
            ) : null}
          </BlockStack>
        </Card>

        {error ? (
          <Banner tone="critical" title="Analytics could not be loaded">
            <p>{error}</p>
          </Banner>
        ) : null}

        {!result ? (
          loading ? (
            <AnalyticsSkeleton />
          ) : null
        ) : (
          <div className={loading ? "an-content is-loading" : "an-content"}>
            {section === "quotations" && <TabQuotations data={result.data.quotations} groupBy={result.groupBy} />}
            {section === "sales" && <TabSales data={result.data.sales} groupBy={result.groupBy} />}
            {section === "invoices" && <TabInvoices data={result.data.invoices} groupBy={result.groupBy} />}
            {section === "purchasing" && <TabPurchasing data={result.data.purchasing} groupBy={result.groupBy} />}
          </div>
        )}
      </BlockStack>
    </AppPage>
  );
}

function AnalyticsSkeleton() {
  return (
    <BlockStack gap="400">
      <MetricGrid>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <BlockStack gap="300">
              <SkeletonBodyText lines={1} />
              <SkeletonDisplayText size="medium" />
            </BlockStack>
          </Card>
        ))}
      </MetricGrid>
      <Card>
        <SkeletonBodyText lines={8} />
      </Card>
    </BlockStack>
  );
}
