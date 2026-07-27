"use client";

import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { listCurrencies, type Currency } from "@/lib/currencies-api";
import {
  findLatestRateForPair,
  listExchangeRates,
  type ExchangeRateRow,
  upsertExchangeRate,
} from "@/lib/exchange-rates-api";
import { getCompanySettings, updateCompanySettings } from "@/lib/settings-api";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  FormLayout,
  InlineGrid,
  InlineStack,
  Select,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  CalendarDays,
  Coins,
  Package,
  Plus,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

function trimCode(code: string) {
  return code.trim();
}

function formatRate(value: number | string) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 8,
  });
}

export default function CurrencySettingsPage() {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [savedRates, setSavedRates] = useState<ExchangeRateRow[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [baseCurrencyId, setBaseCurrencyId] = useState("");
  const [catalogCurrencyId, setCatalogCurrencyId] = useState("");
  const [ratePanelOpen, setRatePanelOpen] = useState(false);
  const [rateFromCurrencyId, setRateFromCurrencyId] = useState("");
  const [rateValue, setRateValue] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const loadRates = useCallback(async () => {
    try {
      const rates = await listExchangeRates();
      setSavedRates(rates);
      return rates;
    } catch {
      setSavedRates([]);
      return [];
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [company, currencyRows, rates] = await Promise.all([
        getCompanySettings(),
        listCurrencies(),
        listExchangeRates().catch(() => [] as ExchangeRateRow[]),
      ]);
      const normalizedCurrencies = currencyRows.map((currency) => ({
        ...currency,
        code: trimCode(currency.code),
      }));
      const resolvedBaseCurrencyId =
        company.baseCurrencyId ?? normalizedCurrencies[0]?.id ?? "";
      const foreignCurrency =
        normalizedCurrencies.find(
          (currency) =>
            currency.id !== resolvedBaseCurrencyId && currency.code === "USD",
        ) ??
        normalizedCurrencies.find(
          (currency) => currency.id !== resolvedBaseCurrencyId,
        );
      const fromId = foreignCurrency?.id ?? "";

      setCurrencies(normalizedCurrencies);
      setSavedRates(rates);
      setCompanyName(company.name);
      setBaseCurrencyId(resolvedBaseCurrencyId);
      setCatalogCurrencyId(
        company.catalogCurrencyId ?? resolvedBaseCurrencyId,
      );
      setRateFromCurrencyId(fromId);
      setRateValue(
        String(
          findLatestRateForPair(rates, fromId, resolvedBaseCurrencyId)?.rate ??
            "",
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load currency settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ratePanelOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRate) {
        setRatePanelOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [ratePanelOpen, savingRate]);

  function prefillRateForPair(fromCurrencyId: string, toCurrencyId: string) {
    const existingRate = findLatestRateForPair(
      savedRates,
      fromCurrencyId,
      toCurrencyId,
    );
    setRateValue(existingRate ? String(existingRate.rate) : "");
  }

  function openRatePanel(fromCurrencyId?: string) {
    const nextFromId =
      fromCurrencyId ||
      currencies.find((currency) => currency.id !== baseCurrencyId)?.id ||
      "";
    setRateFromCurrencyId(nextFromId);
    prefillRateForPair(nextFromId, baseCurrencyId);
    setRatePanelOpen(true);
  }

  async function handleSaveCurrencies() {
    if (!baseCurrencyId) {
      showError("Select a base currency.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateCompanySettings({
        name: companyName.trim() || "Organization",
        baseCurrencyId,
        catalogCurrencyId: catalogCurrencyId || baseCurrencyId,
      });
      await load();
      window.dispatchEvent(new Event("frog1:currency-settings-updated"));
      showSuccess("Currency defaults saved.");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to save currency settings",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRate() {
    const rate = Number(rateValue);
    if (
      !rateFromCurrencyId ||
      !baseCurrencyId ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      showError("Enter a valid positive exchange rate.");
      return;
    }

    setSavingRate(true);
    try {
      const result = await upsertExchangeRate({
        fromCurrencyId: rateFromCurrencyId,
        toCurrencyId: baseCurrencyId,
        rate,
      });
      await loadRates();
      setRatePanelOpen(false);
      const fromCode =
        currencies.find((currency) => currency.id === rateFromCurrencyId)
          ?.code ?? "?";
      const toCode =
        currencies.find((currency) => currency.id === baseCurrencyId)?.code ??
        "?";
      showSuccess(
        `Saved: 1 ${fromCode} = ${formatRate(result.rate)} ${toCode}`,
      );
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to save exchange rate",
      );
    } finally {
      setSavingRate(false);
    }
  }

  const baseCurrency = currencies.find(
    (currency) => currency.id === baseCurrencyId,
  );
  const catalogCurrency = currencies.find(
    (currency) => currency.id === catalogCurrencyId,
  );
  const rateFromCurrency = currencies.find(
    (currency) => currency.id === rateFromCurrencyId,
  );
  const currencyOptions = currencies.map((currency) => ({
    label: `${currency.code}   ${currency.name}`,
    value: currency.id,
  }));
  const foreignCurrencyOptions = useMemo(
    () =>
      currencies
        .filter((currency) => currency.id !== baseCurrencyId)
        .map((currency) => ({
          label: `${currency.code}   ${currency.name}`,
          value: currency.id,
        })),
    [currencies, baseCurrencyId],
  );
  const ratesForBase = useMemo(() => {
    const latestByFrom = new Map<string, ExchangeRateRow>();
    for (const rate of savedRates) {
      if (rate.toCurrencyId !== baseCurrencyId) continue;
      const existing = latestByFrom.get(rate.fromCurrencyId);
      if (!existing || rate.effectiveDate > existing.effectiveDate) {
        latestByFrom.set(rate.fromCurrencyId, rate);
      }
    }
    return Array.from(latestByFrom.values()).sort((left, right) =>
      (left.fromCurrencyCode ?? "").localeCompare(
        right.fromCurrencyCode ?? "",
      ),
    );
  }, [savedRates, baseCurrencyId]);
  const rateNumber = Number(rateValue);
  const conversionPreview =
    Number.isFinite(rateNumber) && rateNumber > 0 ? 200 * rateNumber : null;

  if (loading) {
    return (
      <AppPage
        subtitle="Manage pricing, reporting, and conversion currencies."
        title="Currencies"
      >
        <div className="currency-settings__loading">
          <InlineStack align="center" blockAlign="center" gap="200">
            <Spinner size="small" />
            <Text as="p" tone="subdued">
              Loading currency settings…
            </Text>
          </InlineStack>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      subtitle="Manage pricing, reporting, and conversion currencies."
      title="Currencies"
      primaryAction={{
        content: "Add exchange rate",
        onAction: () => openRatePanel(),
      }}
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        ) : null}

        <section className="currency-settings__hero">
          <div className="currency-settings__hero-copy">
            <div className="currency-settings__hero-icon">
              <Coins aria-hidden size={25} />
            </div>
            <div>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="h2" variant="headingLg">
                  Currency workspace
                </Text>
                <Badge tone="success">Configured</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Keep product pricing flexible while reporting every result in
                one trusted base currency.
              </Text>
            </div>
          </div>
          <div className="currency-settings__stats">
            <div>
              <span>{catalogCurrency?.code ?? " "}</span>
              <Text as="p" tone="subdued" variant="bodySm">
                Catalog
              </Text>
            </div>
            <div>
              <span>{baseCurrency?.code ?? " "}</span>
              <Text as="p" tone="subdued" variant="bodySm">
                Reporting
              </Text>
            </div>
            <div>
              <span>{ratesForBase.length}</span>
              <Text as="p" tone="subdued" variant="bodySm">
                Active rates
              </Text>
            </div>
          </div>
        </section>

        <div className="currency-settings__flow">
          <div className="currency-settings__flow-step">
            <div className="currency-settings__flow-icon">
              <Package aria-hidden size={18} />
            </div>
            <div>
              <Text as="p" fontWeight="semibold">
                Product price
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Entered in {catalogCurrency?.code ?? "catalog currency"}
              </Text>
            </div>
          </div>
          <ArrowRight aria-hidden className="currency-settings__flow-arrow" />
          <div className="currency-settings__flow-step">
            <div className="currency-settings__flow-icon">
              <ArrowRightLeft aria-hidden size={18} />
            </div>
            <div>
              <Text as="p" fontWeight="semibold">
                Exchange rate
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Converts at document time
              </Text>
            </div>
          </div>
          <ArrowRight aria-hidden className="currency-settings__flow-arrow" />
          <div className="currency-settings__flow-step">
            <div className="currency-settings__flow-icon">
              <ReceiptText aria-hidden size={18} />
            </div>
            <div>
              <Text as="p" fontWeight="semibold">
                Quote or invoice
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Displayed in customer currency
              </Text>
            </div>
          </div>
          <ArrowRight aria-hidden className="currency-settings__flow-arrow" />
          <div className="currency-settings__flow-step">
            <div className="currency-settings__flow-icon">
              <BarChart3 aria-hidden size={18} />
            </div>
            <div>
              <Text as="p" fontWeight="semibold">
                Reports
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Normalized to {baseCurrency?.code ?? "base currency"}
              </Text>
            </div>
          </div>
        </div>

        <Card>
          <BlockStack gap="500">
            <div className="currency-settings__section-heading">
              <div className="currency-settings__section-icon">
                <TrendingUp aria-hidden size={19} />
              </div>
              <div>
                <Text as="h2" variant="headingMd">
                  Currency defaults
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  These defaults apply organization-wide and can be overridden
                  where supported.
                </Text>
              </div>
            </div>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <div className="currency-settings__default-card">
                <div className="currency-settings__currency-symbol">
                  {baseCurrency?.symbol || baseCurrency?.code || " "}
                </div>
                <BlockStack gap="300">
                  <div>
                    <Text as="h3" variant="headingSm">
                      Base / reporting currency
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Used for KPIs, dashboards, and consolidated reports.
                    </Text>
                  </div>
                  <Select
                    label="Reporting currency"
                    labelHidden
                    options={currencyOptions}
                    value={baseCurrencyId}
                    onChange={(value) => {
                      setBaseCurrencyId(value);
                      if (
                        !catalogCurrencyId ||
                        catalogCurrencyId === baseCurrencyId
                      ) {
                        setCatalogCurrencyId(value);
                      }
                      prefillRateForPair(rateFromCurrencyId, value);
                    }}
                  />
                </BlockStack>
              </div>

              <div className="currency-settings__default-card">
                <div className="currency-settings__currency-symbol is-catalog">
                  {catalogCurrency?.symbol || catalogCurrency?.code || " "}
                </div>
                <BlockStack gap="300">
                  <div>
                    <Text as="h3" variant="headingSm">
                      Catalog / pricing currency
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Default for new product sales prices and costs.
                    </Text>
                  </div>
                  <Select
                    label="Catalog currency"
                    labelHidden
                    options={currencyOptions}
                    value={catalogCurrencyId || baseCurrencyId}
                    onChange={setCatalogCurrencyId}
                  />
                </BlockStack>
              </div>
            </InlineGrid>

            <div className="currency-settings__defaults-footer">
              <Text as="p" tone="subdued" variant="bodySm">
                Changing the reporting currency may require new exchange rates.
              </Text>
              <Button
                loading={saving}
                variant="primary"
                onClick={() => void handleSaveCurrencies()}
              >
                Save defaults
              </Button>
            </div>
          </BlockStack>
        </Card>

        <BlockStack gap="300">
          <div className="currency-settings__section-title">
            <div>
              <Text as="h2" variant="headingMd">
                Exchange rates
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Latest foreign-currency rates into{" "}
                {baseCurrency?.code ?? "your reporting currency"}.
              </Text>
            </div>
            <Badge>{`${ratesForBase.length} saved`}</Badge>
          </div>

          {ratesForBase.length === 0 ? (
            <Card>
              <EmptyState
                action={{
                  content: "Add exchange rate",
                  onAction: () => openRatePanel(),
                }}
                heading="No exchange rates yet"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
              >
                <p>
                  Add a rate before quoting in a different currency from your
                  product catalog.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <InlineGrid columns={{ xs: 1, sm: 2, lg: 3 }} gap="400">
              {ratesForBase.map((rate) => (
                <Card key={rate.id}>
                  <BlockStack gap="400">
                    <div className="currency-settings__rate-header">
                      <div className="currency-settings__rate-pair">
                        <span>{rate.fromCurrencyCode ?? "?"}</span>
                        <ArrowRight aria-hidden size={16} />
                        <span>
                          {rate.toCurrencyCode ?? baseCurrency?.code ?? "?"}
                        </span>
                      </div>
                      <Badge tone="success">Active</Badge>
                    </div>
                    <div>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Current rate
                      </Text>
                      <Text as="p" variant="headingXl">
                        {formatRate(rate.rate)}
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        1 {rate.fromCurrencyCode ?? "unit"} equals{" "}
                        {formatRate(rate.rate)}{" "}
                        {rate.toCurrencyCode ?? baseCurrency?.code}
                      </Text>
                    </div>
                    <div className="currency-settings__rate-footer">
                      <div>
                        <CalendarDays aria-hidden size={16} />
                        <Text as="p" tone="subdued" variant="bodySm">
                          {rate.effectiveDate}
                        </Text>
                      </div>
                      <Button
                        size="slim"
                        variant="plain"
                        onClick={() => openRatePanel(rate.fromCurrencyId)}
                      >
                        Update rate
                      </Button>
                    </div>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          )}
        </BlockStack>

        <Banner tone="info" title="Rate direction">
          <p>
            Store rates as foreign currency → reporting currency. For example,
            1 USD = 3.67 AED. FrogmenDash applies the correct pair when creating
            documents and reports.
          </p>
        </Banner>
      </BlockStack>

      {ratePanelOpen ? (
        <div className="currency-rate-panel">
          <div
            aria-hidden
            className="currency-rate-panel__overlay"
            onClick={() => {
              if (!savingRate) setRatePanelOpen(false);
            }}
          />
          <aside
            aria-labelledby="currency-rate-panel-title"
            aria-modal="true"
            className="currency-rate-panel__drawer"
            role="dialog"
          >
            <header className="currency-rate-panel__header">
              <div>
                <Text as="h2" id="currency-rate-panel-title" variant="headingLg">
                  Exchange rate
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Convert a foreign currency into{" "}
                  {baseCurrency?.code ?? "your reporting currency"}.
                </Text>
              </div>
              <Button
                disabled={savingRate}
                variant="tertiary"
                onClick={() => setRatePanelOpen(false)}
              >
                Close
              </Button>
            </header>

            <div className="currency-rate-panel__body">
              <div className="currency-rate-panel__intro">
                <div className="currency-settings__section-icon">
                  <Plus aria-hidden size={19} />
                </div>
                <div>
                  <Text as="h3" variant="headingMd">
                    Rate details
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Saving the same pair updates its latest effective rate.
                  </Text>
                </div>
              </div>

              <FormLayout>
                <Select
                  label="From currency"
                  options={foreignCurrencyOptions}
                  value={rateFromCurrencyId}
                  onChange={(value) => {
                    setRateFromCurrencyId(value);
                    prefillRateForPair(value, baseCurrencyId);
                  }}
                />
                <div className="currency-rate-panel__destination">
                  <Text as="p" tone="subdued" variant="bodySm">
                    To reporting currency
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <div className="currency-rate-panel__code">
                      {baseCurrency?.code ?? " "}
                    </div>
                    <Text as="p" fontWeight="semibold">
                      {baseCurrency?.name ?? "Reporting currency"}
                    </Text>
                  </InlineStack>
                </div>
                <TextField
                  autoComplete="off"
                  helpText={`How many ${baseCurrency?.code ?? "reporting currency"} equal one ${rateFromCurrency?.code ?? "foreign currency"} unit.`}
                  label={`1 ${rateFromCurrency?.code ?? "foreign unit"} equals`}
                  suffix={baseCurrency?.code}
                  type="number"
                  value={rateValue}
                  onChange={setRateValue}
                />
              </FormLayout>

              <div className="currency-rate-panel__preview">
                <ArrowRightLeft aria-hidden size={19} />
                <div>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Conversion preview
                  </Text>
                  <Text as="p" variant="headingMd">
                    200 {rateFromCurrency?.code ?? "USD"} ={" "}
                    {conversionPreview === null
                      ? " "
                      : formatRate(conversionPreview)}{" "}
                    {baseCurrency?.code ?? "AED"}
                  </Text>
                </div>
              </div>

              <Banner tone="warning">
                <p>
                  Confirm the rate source and direction before saving. This rate
                  will be used for new conversions.
                </p>
              </Banner>
            </div>

            <footer className="currency-rate-panel__footer">
              <Button
                disabled={savingRate}
                onClick={() => setRatePanelOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !rateFromCurrencyId ||
                  !Number.isFinite(rateNumber) ||
                  rateNumber <= 0
                }
                loading={savingRate}
                variant="primary"
                onClick={() => void handleSaveRate()}
              >
                Save exchange rate
              </Button>
            </footer>
          </aside>
        </div>
      ) : null}
    </AppPage>
  );
}
