"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { sourceBadgeVariant } from "@/lib/leads-api";
import type { LeadStats } from "@/types/lead";
import {
  CheckCircle2,
  DollarSign,
  Target,
  Users,
} from "lucide-react";

interface LeadSourcesAnalyticsProps {
  stats: LeadStats;
}

export function LeadSourcesAnalytics({ stats }: LeadSourcesAnalyticsProps) {
  const { formatBaseMoney } = useOrgCurrency();
  const maxCount = Math.max(...stats.sourceBreakdown.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Users className="h-4 w-4 text-blue-500" /> Total Leads Tracked
          </span>
          <div className="text-2xl font-bold text-foreground">{stats.totalLeads}</div>
          <p className="text-xs text-muted-foreground">Across all acquisition channels</p>
        </div>

        <div className="p-4 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-emerald-500" /> Total Pipeline Value
          </span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatBaseMoney(stats.totalPipelineValue)}
          </div>
          <p className="text-xs text-muted-foreground">Estimated prospective deal revenue</p>
        </div>

        <div className="p-4 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-purple-500" /> Contact Outreach Rate
          </span>
          <div className="text-2xl font-bold text-foreground">{stats.contactedRate}%</div>
          <p className="text-xs text-muted-foreground">
            {stats.contactedCount} contacted / {stats.notContactedCount} pending outreach
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-card space-y-1 shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Target className="h-4 w-4 text-amber-500" /> Overall Win Rate
          </span>
          <div className="text-2xl font-bold text-foreground">{stats.winRate}%</div>
          <p className="text-xs text-muted-foreground">{stats.wonCount} won deals</p>
        </div>
      </div>

      {/* Sources Performance breakdown */}
      <div className="p-5 rounded-xl border bg-card shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Lead Source Acquisition Performance</h3>
            <p className="text-xs text-muted-foreground">
              Tracking lead origin channels, pipeline volume, and conversion efficiency
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            {stats.sourceBreakdown.length} Active Channels
          </span>
        </div>

        <div className="space-y-4">
          {stats.sourceBreakdown.map((src) => {
            const widthPct = Math.round((src.count / maxCount) * 100);

            return (
              <div key={src.source} className="p-3.5 rounded-lg border bg-muted/20 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge variant={sourceBadgeVariant(src.source)}>
                      {src.label}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground font-medium">
                      ({src.count} lead{src.count > 1 ? "s" : ""})
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground mr-1">Pipeline Value:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatBaseMoney(src.value)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-1">Volume Share:</span>
                      <strong className="text-foreground font-bold">{src.percentage}%</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-1">Win Rate:</span>
                      <strong className="text-foreground font-bold">{src.conversionRate}%</strong>
                    </div>
                  </div>
                </div>

                {/* Progress bar visual */}
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(widthPct, 6)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
