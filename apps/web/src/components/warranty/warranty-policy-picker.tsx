"use client";

import { useCallback, useEffect, useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import {
  listWarrantyPolicies,
  type WarrantyPolicy,
} from "@/lib/warranty-api";

interface WarrantyPolicyPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  allowNone?: boolean;
  activeOnly?: boolean;
  helpText?: string;
}

export function WarrantyPolicyPicker({
  label = "Warranty policy",
  value,
  onChange,
  allowNone = true,
  activeOnly = true,
  helpText,
}: WarrantyPolicyPickerProps) {
  const [policies, setPolicies] = useState<WarrantyPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listWarrantyPolicies({
        activeOnly,
        perPage: 200,
      });
      setPolicies(result.data);
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const options = [
    ...(allowNone
      ? [{ label: "No warranty", value: "" }]
      : []),
    ...policies.map((policy) => ({
      label: `${policy.name} (${policy.durationMonths} mo)`,
      value: policy.id,
    })),
  ];

  return (
    <AppSelect
      disabled={loading}
      helpText={helpText}
      label={label}
      onChange={onChange}
      options={options}
      value={value}
    />
  );
}
