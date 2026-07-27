"use client";

import {
  Button,
  InlineGrid,
  Select,
  TextField,
} from "@shopify/polaris";
import { todayIsoDate } from "@/components/sales/format-money";

export const AS_OF_PRESETS = [
  { label: "Today", value: "today" },
  { label: "End of last month", value: "last_month_end" },
  { label: "End of last quarter", value: "last_quarter_end" },
  { label: "Custom date", value: "custom" },
] as const;

export type AsOfPreset = (typeof AS_OF_PRESETS)[number]["value"];

export function resolveAsOfDate(preset: AsOfPreset, customDate: string) {
  const now = new Date();

  if (preset === "custom") {
    return customDate;
  }

  if (preset === "last_month_end") {
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return end.toISOString().slice(0, 10);
  }

  if (preset === "last_quarter_end") {
    const end = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
    return end.toISOString().slice(0, 10);
  }

  return todayIsoDate();
}

interface AsOfDateFilterProps {
  preset: AsOfPreset;
  asOf: string;
  onPresetChange: (preset: AsOfPreset) => void;
  onAsOfChange: (value: string) => void;
  onApply: () => void;
  loading?: boolean;
  summary?: string;
}

export function AsOfDateFilter({
  preset,
  asOf,
  onPresetChange,
  onAsOfChange,
  onApply,
  loading = false,
  summary,
}: AsOfDateFilterProps) {
  return (
    <div className="space-y-2">
      <InlineGrid columns={{ xs: 1, sm: 2, lg: 3 }} gap="200">
        <Select
          label="As of"
          options={[...AS_OF_PRESETS]}
          value={preset}
          onChange={(value) => onPresetChange(value as AsOfPreset)}
        />
        <TextField
          autoComplete="off"
          label="Date"
          type="date"
          value={asOf}
          onChange={onAsOfChange}
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
