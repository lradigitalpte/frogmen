"use client";

import {
  Badge,
  BlockStack,
  Box,
  Card,
  IndexTable,
  InlineStack,
  Text,
} from "@shopify/polaris";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTheme } from "@/components/providers/theme-provider";

/* ── Chart theme ─────────────────────────────────────────────────────────── */

export interface ChartTheme {
  grid: string;
  axis: string;
  cursor: string;
  series: {
    primary: string;
    secondary: string;
    info: string;
    critical: string;
    neutral: string;
    previous: string;
  };
}

const LIGHT: ChartTheme = {
  grid: "#e8eaeb",
  axis: "#7a838b",
  cursor: "rgba(43, 71, 110, 0.06)",
  series: {
    primary: "#2b476e",
    secondary: "#d9a441",
    info: "#4a7fb5",
    critical: "#d9654f",
    neutral: "#a2aab1",
    previous: "#b8bfc5",
  },
};

const DARK: ChartTheme = {
  grid: "#212931",
  axis: "#89949c",
  cursor: "rgba(255, 255, 255, 0.04)",
  series: {
    primary: "#588ac6",
    secondary: "#e8bd6a",
    info: "#7aa7d6",
    critical: "#ef8a76",
    neutral: "#5e6771",
    previous: "#4a535d",
  },
};

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}

/** "2026-03" → "Mar 26"; a day or week start "2026-03-09" → "9 Mar" */
export function bucketLabel(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month) return key;
  if (day) {
    const date = new Date(year, month - 1, day);
    return `${day} ${date.toLocaleString("en", { month: "short" })}`;
  }
  const date = new Date(year, month - 1, 1);
  return `${date.toLocaleString("en", { month: "short" })} ${String(year).slice(2)}`;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const compactNumber = (value: number) => compact.format(value);

/* ── Metric card ─────────────────────────────────────────────────────────── */

interface MetricCardProps {
  label: string;
  value: string;
  /** % change vs the comparison period, or null when there is no baseline. */
  delta: number | null;
  /** Shown when there is no delta. */
  hint: string;
  /** For metrics where going down is good (e.g. overdue). */
  lowerIsBetter?: boolean;
  highlight?: boolean;
}

export function MetricCard({ label, value, delta, hint, lowerIsBetter, highlight }: MetricCardProps) {
  const good = delta === null ? null : lowerIsBetter ? delta <= 0 : delta >= 0;
  return (
    <div className={highlight ? "an-metric an-metric--highlight" : "an-metric"}>
      <span className="an-metric__label">{label}</span>
      <span className="an-metric__value">{value}</span>
      <InlineStack gap="150" blockAlign="center" wrap={false}>
        {delta === null ? (
          <span className="an-metric__hint">{hint}</span>
        ) : (
          <>
            <Badge tone={good ? "success" : "critical"} size="small">
              {`${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${Math.abs(delta)}%`}
            </Badge>
            <span className="an-metric__hint">vs previous period</span>
          </>
        )}
      </InlineStack>
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="an-metric-grid">{children}</div>;
}

/* ── Chart card ──────────────────────────────────────────────────────────── */

interface ChartCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  legend?: { label: string; color: string; dashed?: boolean }[];
  height?: number;
  children: ReactNode;
}

export function ChartCard({ title, description, action, legend, height = 280, children }: ChartCardProps) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="start" gap="300">
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">{title}</Text>
            {description ? <Text as="p" tone="subdued" variant="bodySm">{description}</Text> : null}
          </BlockStack>
          {action}
        </InlineStack>
        <div style={{ height }}>{children}</div>
        {legend?.length ? (
          <div className="an-legend">
            {legend.map((item) => (
              <span key={item.label}>
                <i
                  className={item.dashed ? "is-dashed" : undefined}
                  style={item.dashed ? { borderColor: item.color } : { background: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
      </BlockStack>
    </Card>
  );
}

/* ── Recharts tooltip ────────────────────────────────────────────────────── */

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  stroke?: string;
  fill?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  format: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="an-tooltip">
      {label !== undefined ? <strong>{label}</strong> : null}
      {payload.map((entry) => (
        <span key={String(entry.name)}>
          <i style={{ background: entry.color ?? entry.stroke ?? entry.fill }} />
          {entry.name}
          <b>{format(Number(entry.value) || 0)}</b>
        </span>
      ))}
    </div>
  );
}

/* ── Breakdown (donut + list) ────────────────────────────────────────────── */

export interface BreakdownItem {
  key: string;
  label: string;
  count: number;
  amount?: number;
  color: string;
}

interface BreakdownCardProps {
  title: string;
  description?: string;
  items: BreakdownItem[];
  unit: string;
  formatAmount?: (value: number) => string;
}

export function BreakdownCard({ title, description, items, unit, formatAmount }: BreakdownCardProps) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const visible = items.filter((item) => item.count > 0);

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="050">
          <Text as="h2" variant="headingMd">{title}</Text>
          {description ? <Text as="p" tone="subdued" variant="bodySm">{description}</Text> : null}
        </BlockStack>

        {total === 0 ? (
          <Box paddingBlock="800">
            <Text as="p" tone="subdued" alignment="center">Nothing in this period.</Text>
          </Box>
        ) : (
          <>
            <div className="an-donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={visible}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="68%"
                    outerRadius="100%"
                    paddingAngle={visible.length > 1 ? 2 : 0}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {visible.map((item) => (
                      <Cell key={item.key} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload?.map((p) => ({
                          name: p.name,
                          value: p.value as number,
                          color: (p.payload as BreakdownItem).color,
                        }))}
                        format={(v) => `${v} ${unit}`}
                      />
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="an-donut__center">
                <strong>{total}</strong>
                <span>{unit}</span>
              </div>
            </div>

            <div className="an-breakdown">
              {items.map((item) => {
                const share = total ? Math.round((item.count / total) * 100) : 0;
                return (
                  <div className="an-breakdown__row" key={item.key}>
                    <span className="an-breakdown__name">
                      <i style={{ background: item.color }} />
                      {item.label}
                    </span>
                    <span className="an-breakdown__value">
                      {item.count}
                      {item.amount !== undefined && formatAmount ? (
                        <small>{formatAmount(item.amount)}</small>
                      ) : null}
                    </span>
                    <span className="an-breakdown__share">{share}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

/* ── Ranking table ───────────────────────────────────────────────────────── */

export interface RankingRow {
  id: string;
  name: string;
  count: number;
  value: number;
}

interface RankingTableProps {
  title: string;
  description?: string;
  rows: RankingRow[];
  nameLabel: string;
  countLabel: string;
  valueLabel: string;
  emptyText: string;
  formatValue: (value: number) => string;
  barColor: string;
  onRowClick?: (row: RankingRow) => void;
}

export function RankingTable({
  title,
  description,
  rows,
  nameLabel,
  countLabel,
  valueLabel,
  emptyText,
  formatValue,
  barColor,
  onRowClick,
}: RankingTableProps) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <Card padding="0">
      <Box padding="400" paddingBlockEnd="300">
        <BlockStack gap="050">
          <Text as="h2" variant="headingMd">{title}</Text>
          {description ? <Text as="p" tone="subdued" variant="bodySm">{description}</Text> : null}
        </BlockStack>
      </Box>
      <IndexTable
        resourceName={{ singular: nameLabel.toLowerCase(), plural: `${nameLabel.toLowerCase()}s` }}
        itemCount={rows.length}
        selectable={false}
        emptyState={<div className="an-empty">{emptyText}</div>}
        headings={[
          { title: "#" },
          { title: nameLabel },
          { title: countLabel, alignment: "end" },
          { title: "Share" },
          { title: valueLabel, alignment: "end" },
        ]}
      >
        {rows.map((row, index) => (
          <IndexTable.Row
            id={row.id}
            key={row.id}
            position={index}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <IndexTable.Cell>
              <span className="an-rank">{index + 1}</span>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Text as="span" fontWeight="semibold">{row.name}</Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Text as="span" alignment="end" numeric>{row.count}</Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <div className="an-share">
                <div className="an-share__track">
                  <i style={{ width: `${(row.value / max) * 100}%`, background: barColor }} />
                </div>
                <span>{total ? Math.round((row.value / total) * 100) : 0}%</span>
              </div>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Text as="span" alignment="end" fontWeight="semibold" numeric>
                {formatValue(row.value)}
              </Text>
            </IndexTable.Cell>
          </IndexTable.Row>
        ))}
      </IndexTable>
    </Card>
  );
}

/* ── Layout helpers ──────────────────────────────────────────────────────── */

export function ChartRow({ children }: { children: ReactNode }) {
  return <div className="an-chart-row">{children}</div>;
}
