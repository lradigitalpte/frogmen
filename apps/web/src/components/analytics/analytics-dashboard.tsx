"use client";

import {
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  InlineStack,
  SkeletonBodyText,
  SkeletonDisplayText,
  Text,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { fetchAnalytics, getPresets, type AnalyticsData } from "@/lib/analytics-api";
import { ANALYTICS_SECTIONS, type AnalyticsSection } from "@/lib/analytics-sections";
import { formatAppDate } from "@/lib/format-date";
import { MetricGrid } from "./analytics-ui";
import { TabInvoices } from "./tab-invoices";
import { TabPurchasing } from "./tab-purchasing";
import { TabQuotations } from "./tab-quotations";
import { TabSales } from "./tab-sales";

const PRESET_STORAGE_KEY = "frogmen-analytics-preset";
const DEFAULT_PRESET = 3; // "This Year"

function readStoredPreset() {
  try {
    const raw = window.sessionStorage.getItem(PRESET_STORAGE_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= 3 ? value : DEFAULT_PRESET;
  } catch {
    return DEFAULT_PRESET;
  }
}

function formatRange(from: string, to: string) {
  return `${formatAppDate(from) || from} – ${formatAppDate(to) || to}`;
}

export function AnalyticsDashboard({ section }: { section: AnalyticsSection }) {
  const presets = useMemo(() => getPresets(), []);
  const [presetIndex, setPresetIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read the remembered period after mount (sessionStorage is client-only).
  useEffect(() => setPresetIndex(readStoredPreset()), []);

  const preset = presets[presetIndex ?? DEFAULT_PRESET];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAnalytics({ current: preset.current, compare: preset.compare }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    if (presetIndex !== null) void load();
  }, [presetIndex, load]);

  function choosePreset(index: number) {
    setPresetIndex(index);
    try {
      window.sessionStorage.setItem(PRESET_STORAGE_KEY, String(index));
    } catch {
      // ignore — period simply won't be remembered
    }
  }

  const meta = ANALYTICS_SECTIONS[section];

  return (
    <AppPage title={meta.title} subtitle={meta.subtitle}>
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <InlineStack gap="300" blockAlign="center">
              <ButtonGroup variant="segmented">
                {presets.map((p, index) => (
                  <Button
                    key={p.label}
                    pressed={(presetIndex ?? DEFAULT_PRESET) === index}
                    onClick={() => choosePreset(index)}
                  >
                    {p.label}
                  </Button>
                ))}
              </ButtonGroup>
              {presetIndex !== null ? (
                <Text as="span" tone="subdued" variant="bodySm">
                  {formatRange(preset.current.from, preset.current.to)} · compared with{" "}
                  {formatRange(preset.compare.from, preset.compare.to)}
                </Text>
              ) : null}
            </InlineStack>
            <Button icon={RefreshIcon} loading={loading} onClick={() => void load()}>
              Refresh
            </Button>
          </InlineStack>
        </Card>

        {error ? (
          <Banner tone="critical" title="Analytics could not be loaded">
            <p>{error}</p>
          </Banner>
        ) : null}

        {!data ? (
          loading ? (
            <AnalyticsSkeleton />
          ) : null
        ) : (
          <div className={loading ? "an-content is-loading" : "an-content"}>
            {section === "quotations" && <TabQuotations data={data.quotations} />}
            {section === "sales" && <TabSales data={data.sales} />}
            {section === "invoices" && <TabInvoices data={data.invoices} />}
            {section === "purchasing" && <TabPurchasing data={data.purchasing} />}
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
