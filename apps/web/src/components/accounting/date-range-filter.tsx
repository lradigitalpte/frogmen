"use client";

import {
  Button,
  InlineGrid,
  Select,
  TextField,
} from "@shopify/polaris";
import { todayIsoDate } from "@/components/sales/format-money";

export const DATE_PRESETS = [
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
  { label: "Last quarter", value: "last_quarter" },
  { label: "Year to date", value: "ytd" },
  { label: "Custom range", value: "custom" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

export function presetRange(preset: DatePreset, customFrom: string, customTo: string) {
  const now = new Date();
  const end = todayIsoDate();

  if (preset === "custom") {
    return { dateFrom: customFrom, dateTo: customTo };
  }

  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const finish = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      dateFrom: start.toISOString().slice(0, 10),
      dateTo: finish.toISOString().slice(0, 10),
    };
  }

  if (preset === "last_quarter") {
    const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
    const finish = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
    return {
      dateFrom: start.toISOString().slice(0, 10),
      dateTo: finish.toISOString().slice(0, 10),
    };
  }

  if (preset === "ytd") {
    return {
      dateFrom: `${now.getFullYear()}-01-01`,
      dateTo: end,
    };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end,
  };
}

interface DateRangeFilterProps {
  preset: DatePreset;
  dateFrom: string;
  dateTo: string;
  onPresetChange: (preset: DatePreset) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onApply: () => void;
  loading?: boolean;
  summary?: string;
}

export function DateRangeFilter({
  preset,
  dateFrom,
  dateTo,
  onPresetChange,
  onDateFromChange,
  onDateToChange,
  onApply,
  loading = false,
  summary,
}: DateRangeFilterProps) {
  return (
    <div className="space-y-2">
      <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="200">
        <Select
          label="Period"
          options={[...DATE_PRESETS]}
          value={preset}
          onChange={(value) => onPresetChange(value as DatePreset)}
        />
        <TextField
          autoComplete="off"
          label="From"
          type="date"
          value={dateFrom}
          onChange={onDateFromChange}
          disabled={preset !== "custom"}
        />
        <TextField
          autoComplete="off"
          label="To"
          type="date"
          value={dateTo}
          onChange={onDateToChange}
          disabled={preset !== "custom"}
        />
        <div className="flex items-end pb-[2px]">
          <Button variant="primary" onClick={onApply} loading={loading}>
            Apply
          </Button>
        </div>
      </InlineGrid>
      {summary ? (
        <p className="text-sm font-medium text-foreground">{summary}</p>
      ) : null}
    </div>
  );
}
