"use client";

import { InlineStack, Text } from "@shopify/polaris";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AccountingJournalCard, JournalChart } from "@/lib/accounting-api";

interface JournalChartCardProps {
  journal: AccountingJournalCard;
  formatMoney: (amount: number) => string;
}

const chartAxisColor = "var(--muted-foreground)";
const chartGridColor = "var(--border)";

function toChartRows(chart: JournalChart) {
  return chart.labels.map((label, index) => {
    const row: Record<string, string | number> = { label };
    for (const dataset of chart.datasets) {
      row[dataset.label] = dataset.data[index] ?? 0;
    }
    return row;
  });
}

function ChartTooltip({
  active,
  payload,
  label,
  formatMoney,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  formatMoney: (amount: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border/90 bg-white px-3 py-2 text-sm shadow-lg dark:border-border dark:bg-card">
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex justify-between gap-4 text-muted-foreground"
        >
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-medium text-foreground">
            {formatMoney(Number(entry.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function JournalChartCard({
  journal,
  formatMoney,
}: JournalChartCardProps) {
  const chartRows = toChartRows(journal.chart);
  const isLine = journal.chart.type === "line";

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{journal.name}</CardTitle>
        <CardDescription>{formatMoney(journal.balance)} balance</CardDescription>
        <CardAction>
          <StatusBadge variant="info">{journal.code}</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {journal.stats.length > 0 ? (
          <div className="accounting-stat-grid">
            {journal.stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-border/90 bg-white p-3 shadow-sm dark:border-border dark:bg-muted/30 dark:shadow-none"
              >
                <Text as="p" tone="subdued" variant="bodySm">
                  {stat.label}
                </Text>
                <InlineStack align="space-between">
                  <Text as="span" fontWeight="semibold">
                    {stat.value}
                  </Text>
                  {stat.amount !== undefined ? (
                    <Text as="span" tone="subdued" variant="bodySm">
                      {formatMoney(stat.amount)}
                    </Text>
                  ) : null}
                </InlineStack>
              </div>
            ))}
          </div>
        ) : null}

        <div className="accounting-journal-chart rounded-xl border border-border/90 bg-white p-2 dark:border-border dark:bg-muted/20">
          <ResponsiveContainer width="100%" height={260}>
            {isLine ? (
              <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chartAxisColor }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: chartAxisColor }}
                  width={56}
                  tickFormatter={(value: number) =>
                    new Intl.NumberFormat(undefined, {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value)
                  }
                />
                <Tooltip content={<ChartTooltip formatMoney={formatMoney} />} />
                <Legend />
                {journal.chart.datasets.map((dataset) => (
                  <Line
                    key={dataset.label}
                    type="monotone"
                    dataKey={dataset.label}
                    stroke={dataset.color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chartAxisColor }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: chartAxisColor }}
                  width={56}
                  tickFormatter={(value: number) =>
                    new Intl.NumberFormat(undefined, {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value)
                  }
                />
                <Tooltip content={<ChartTooltip formatMoney={formatMoney} />} />
                <Legend />
                {journal.chart.datasets.map((dataset, index) => (
                  <Bar
                    key={dataset.label}
                    dataKey={dataset.label}
                    fill={dataset.color}
                    stackId={journal.chart.datasets.length > 1 ? "stack" : undefined}
                    radius={
                      index === journal.chart.datasets.length - 1
                        ? [4, 4, 0, 0]
                        : [0, 0, 0, 0]
                    }
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
