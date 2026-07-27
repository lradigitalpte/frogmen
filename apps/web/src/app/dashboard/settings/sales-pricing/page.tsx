"use client";

import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { getSalesPricing, updateSalesPricing } from "@/lib/settings-api";
import { formatAdjustmentPercent } from "@frog1/shared";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Select,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";

const AVAILABLE_VAT_RATES = [0, 5, 7.5, 10, 15, 20];

export default function TaxesAndPricingSettingsPage() {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPercent, setLocalPercent] = useState("0");
  const [nonLocalPercent, setNonLocalPercent] = useState("0");
  const [defaultVatRate, setDefaultVatRate] = useState("5");
  const [vatRates, setVatRates] = useState<number[]>([0, 5]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSalesPricing();
      setLocalPercent(String(result.localAdjustmentPercent));
      setNonLocalPercent(String(result.nonLocalAdjustmentPercent));
      setDefaultVatRate(String(result.defaultVatRatePercent));
      setVatRates(result.vatRates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allVatOptions = useMemo(
    () =>
      [...new Set([...AVAILABLE_VAT_RATES, ...vatRates])]
        .sort((a, b) => a - b)
        .map((rate) => ({
          label: rate === 0 ? "0%   Zero rated / exempt" : `${rate}%`,
          value: String(rate),
        })),
    [vatRates],
  );

  function toggleVatRate(rate: number, checked: boolean) {
    setVatRates((current) => {
      const next = checked
        ? [...new Set([...current, rate])].sort((a, b) => a - b)
        : current.filter((item) => item !== rate);
      if (!checked && Number(defaultVatRate) === rate) {
        setDefaultVatRate(String(next[0] ?? 0));
      }
      return next;
    });
  }

  async function handleSave() {
    const localAdjustmentPercent = Number(localPercent);
    const nonLocalAdjustmentPercent = Number(nonLocalPercent);
    const defaultVatRatePercent = Number(defaultVatRate);

    if (
      !Number.isFinite(localAdjustmentPercent) ||
      !Number.isFinite(nonLocalAdjustmentPercent) ||
      !Number.isFinite(defaultVatRatePercent)
    ) {
      showError("Enter valid percentage values.");
      return;
    }
    if (
      localAdjustmentPercent < -100 ||
      localAdjustmentPercent > 100 ||
      nonLocalAdjustmentPercent < -100 ||
      nonLocalAdjustmentPercent > 100
    ) {
      showError("Customer adjustments must be between -100% and 100%.");
      return;
    }
    if (vatRates.length === 0 || !vatRates.includes(defaultVatRatePercent)) {
      showError("Select at least one VAT rate and choose a default from that list.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await updateSalesPricing({
        localAdjustmentPercent,
        nonLocalAdjustmentPercent,
        defaultVatRatePercent,
        vatRates,
      });
      setLocalPercent(String(result.localAdjustmentPercent));
      setNonLocalPercent(String(result.nonLocalAdjustmentPercent));
      setDefaultVatRate(String(result.defaultVatRatePercent));
      setVatRates(result.vatRates);
      showSuccess("Taxes and pricing settings saved.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppPage subtitle="VAT defaults and customer price rules." title="Taxes & pricing">
        <InlineStack align="center" blockAlign="center" gap="200">
          <Spinner size="small" />
          <Text as="p" tone="subdued">Loading finance settings…</Text>
        </InlineStack>
      </AppPage>
    );
  }

  return (
    <AppPage
      subtitle="Set the VAT choices used on documents and automatic customer price adjustments."
      title="Taxes & pricing"
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        ) : null}

        <div className="finance-settings-hero">
          <div>
            <span className="finance-settings-hero__eyebrow">Finance controls</span>
            <h2>Consistent tax and pricing on every sale</h2>
            <p>
              Your default VAT is preselected on new lines. Customer adjustments
              use the Local or Non-local classification saved on each customer.
            </p>
          </div>
          <div className="finance-settings-hero__stat">
            <span>Document default</span>
            <strong>{defaultVatRate}% VAT</strong>
          </div>
        </div>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="500">
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">VAT setup</Text>
                <Text as="p" tone="subdued">
                  Select the rates your organization uses. They appear as a
                  dropdown when adding quotation and invoice lines.
                </Text>
              </BlockStack>

              <Select
                label="Default VAT rate"
                options={allVatOptions.filter((option) =>
                  vatRates.includes(Number(option.value)),
                )}
                value={defaultVatRate}
                onChange={setDefaultVatRate}
                helpText="Automatically selected for new document lines."
              />

              <div className="finance-settings-rate-grid">
                {AVAILABLE_VAT_RATES.map((rate) => (
                  <div className="finance-settings-rate-option" key={rate}>
                    <Checkbox
                      checked={vatRates.includes(rate)}
                      label={rate === 0 ? "0%   Zero rated" : `${rate}% VAT`}
                      onChange={(checked) => toggleVatRate(rate, checked)}
                    />
                  </div>
                ))}
              </div>

              <Banner tone="info">
                <p>
                  VAT is calculated after line discounts. A user can choose any
                  configured rate for each taxable document line.
                </p>
              </Banner>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Customer price rules</Text>
                <Text as="p" tone="subdued">
                  Positive values increase the catalog price; negative values
                  decrease it. Enter 0 for no change.
                </Text>
              </BlockStack>

              <TextField
                autoComplete="off"
                label="Local customer adjustment"
                suffix="%"
                type="number"
                value={localPercent}
                onChange={setLocalPercent}
                helpText={`Result: ${formatAdjustmentPercent(Number(localPercent) || 0)}`}
              />
              <TextField
                autoComplete="off"
                label="Non-local customer adjustment"
                suffix="%"
                type="number"
                value={nonLocalPercent}
                onChange={setNonLocalPercent}
                helpText={`Result: ${formatAdjustmentPercent(Number(nonLocalPercent) || 0)}`}
              />

              <div className="finance-settings-example">
                <span>Example on a 1,000.00 catalog price</span>
                <div>
                  <strong>Local</strong>
                  <b>{(1000 * (1 + (Number(localPercent) || 0) / 100)).toFixed(2)}</b>
                </div>
                <div>
                  <strong>Non-local</strong>
                  <b>{(1000 * (1 + (Number(nonLocalPercent) || 0) / 100)).toFixed(2)}</b>
                </div>
              </div>
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineStack align="end">
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Save taxes & pricing
          </Button>
        </InlineStack>
      </BlockStack>
    </AppPage>
  );
}
