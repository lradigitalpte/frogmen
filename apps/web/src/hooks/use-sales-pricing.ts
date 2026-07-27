"use client";

import { useCallback, useEffect, useState } from "react";
import type { SalesPricingSettings } from "@frog1/shared";
import { getSalesPricing } from "@/lib/settings-api";

export function useSalesPricing() {
  const [settings, setSettings] = useState<SalesPricingSettings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getSalesPricing();
      setSettings({
        localAdjustmentPercent: result.localAdjustmentPercent,
        nonLocalAdjustmentPercent: result.nonLocalAdjustmentPercent,
        defaultVatRatePercent: result.defaultVatRatePercent,
        vatRates: result.vatRates,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing settings");
      setSettings({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    settings,
    loading,
    error,
    reload,
  };
}
