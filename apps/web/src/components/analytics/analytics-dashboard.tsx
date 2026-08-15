"use client";

import { useState, useEffect } from "react";
import { AppPage } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchAnalytics,
  getPresets,
  type AnalyticsData,
  type DateRange,
} from "@/lib/analytics-api";
import { TabQuotations } from "./tab-quotations";
import { TabSales } from "./tab-sales";
import { TabInvoices } from "./tab-invoices";
import { TabPurchasing } from "./tab-purchasing";
import {
  BarChart3,
  Calendar,
  DollarSign,
  FileText,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ActiveTab = "quotations" | "sales" | "invoices" | "purchasing";

export function AnalyticsDashboard() {
  const presets = getPresets();
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(3); // Default: "This Year"
  const [customCurrent, setCustomCurrent] = useState<DateRange>(presets[3].current);
  const [customCompare, setCustomCompare] = useState<DateRange>(presets[3].compare);
  const [isCustomDate, setIsCustomDate] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>("quotations");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentRange = isCustomDate ? customCurrent : presets[selectedPresetIndex].current;
  const compareRange = isCustomDate ? customCompare : presets[selectedPresetIndex].compare;

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAnalytics({
        current: currentRange,
        compare: compareRange,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [selectedPresetIndex, isCustomDate, customCurrent.from, customCurrent.to]);

  const tabs = [
    {
      id: "quotations" as const,
      label: "Quotations Pipeline",
      icon: FileText,
    },
    {
      id: "sales" as const,
      label: "Sales & Revenue",
      icon: ShoppingBag,
    },
    {
      id: "invoices" as const,
      label: "Invoices & Cash",
      icon: Wallet,
    },
    {
      id: "purchasing" as const,
      label: "Purchasing & Cost",
      icon: DollarSign,
    },
  ];

  return (
    <AppPage fullWidth title="Analytics & Executive Dashboard">
      <div className="flex flex-col gap-6">
        {/* Controls Hero Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card">
          {/* Tab Navigation (Buttons, NOT dropdown) */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/60 p-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all",
                    isActive
                      ? "bg-white text-primary shadow-sm dark:bg-muted dark:text-foreground"
                      : "text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-muted/40",
                  )}
                >
                  <Icon className="size-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Date Filter Controls & Refresh */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 text-xs">
              <Calendar className="ml-2 size-3.5 text-muted-foreground" />
              {presets.map((preset, idx) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setIsCustomDate(false);
                    setSelectedPresetIndex(idx);
                  }}
                  className={cn(
                    "rounded px-2.5 py-1 font-medium transition-all",
                    !isCustomDate && selectedPresetIndex === idx
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {/* Loading Spinner */}
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : data ? (
          <>
            {activeTab === "quotations" && <TabQuotations data={data.quotations} />}
            {activeTab === "sales" && <TabSales data={data.sales} />}
            {activeTab === "invoices" && <TabInvoices data={data.invoices} />}
            {activeTab === "purchasing" && <TabPurchasing data={data.purchasing} />}
          </>
        ) : null}
      </div>
    </AppPage>
  );
}
