"use client";

import { FormLayout, Select } from "@shopify/polaris";
import type { Currency } from "@/lib/currencies-api";

interface CurrencyPickerProps {
  currencies: Currency[];
  value: string;
  onChange: (currencyId: string) => void;
  disabled?: boolean;
  error?: string;
  loading?: boolean;
}

export function CurrencyPicker({
  currencies,
  value,
  onChange,
  disabled,
  error,
  loading,
}: CurrencyPickerProps) {
  const options = [
    { label: "Select currency", value: "" },
    ...currencies.map((currency) => ({
      label: `${currency.code}   ${currency.name}`,
      value: currency.id,
    })),
  ];

  return (
    <FormLayout>
      <Select
        disabled={disabled || loading}
        error={error}
        label="Currency"
        onChange={onChange}
        options={options}
        value={value}
      />
    </FormLayout>
  );
}
