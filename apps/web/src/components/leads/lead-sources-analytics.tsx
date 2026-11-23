"use client";

import { RankingTable, useChartTheme } from "@/components/analytics/analytics-ui";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import type { LeadSource, LeadStats } from "@/types/lead";

interface LeadSourcesAnalyticsProps {
  stats: LeadStats;
  onPickSource: (source: LeadSource) => void;
}

/** Where leads come from, ranked by number of leads. */
export function LeadSourcesAnalytics({ stats, onPickSource }: LeadSourcesAnalyticsProps) {
  const { formatBaseMoney } = useOrgCurrency();
  const theme = useChartTheme();

  return (
    <RankingTable
      title="Lead sources"
      description="Which channels bring in leads and how much pipeline they are worth. Click a source to see its leads."
      nameLabel="Source"
      countLabel="Leads"
      valueLabel="Pipeline value"
      emptyText="No leads yet — sources appear once you add leads."
      formatValue={formatBaseMoney}
      barColor={theme.series.primary}
      onRowClick={(row) => onPickSource(row.id as LeadSource)}
      rows={stats.sourceBreakdown.map((s) => ({
        id: s.source,
        name: s.label,
        count: s.count,
        value: s.totalValue,
      }))}
    />
  );
}
