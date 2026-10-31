"use client";

import {
  Autocomplete,
  Banner,
  BlockStack,
  Button,
  Checkbox,
  FormLayout,
  Icon,
  InlineStack,
  Layout,
  Select,
  SkeletonBodyText,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { QuotationFormSection } from "@/components/sales/quotation-form-section";
import { useToast } from "@/components/providers/toast-provider";
import {
  getCalendarSettings,
  listHolidayCountries,
  sendCalendarDigestNow,
  updateCalendarSettings,
  type CalendarSettings,
  type HolidayCountry,
} from "@/lib/calendar-api";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  label: `${String(hour).padStart(2, "0")}:00`,
  value: String(hour),
}));

const LOOKAHEAD_OPTIONS = [
  { label: "Today only", value: "0" },
  { label: "Today + 1 day", value: "1" },
  { label: "Today + 3 days", value: "3" },
  { label: "Today + 7 days", value: "7" },
  { label: "Today + 14 days", value: "14" },
];

export function CalendarSettingsPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [countries, setCountries] = useState<HolidayCountry[]>([]);
  const [countryQuery, setCountryQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    Promise.all([getCalendarSettings(), listHolidayCountries()])
      .then(([loadedSettings, loadedCountries]) => {
        setSettings(loadedSettings);
        setCountries(loadedCountries);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load settings"),
      );
  }, []);

  const countryNames = useMemo(
    () => Object.fromEntries(countries.map((country) => [country.code, country.name])),
    [countries],
  );

  const countryOptions = useMemo(() => {
    const term = countryQuery.trim().toLowerCase();
    return countries
      .filter(
        (country) =>
          !term ||
          country.name.toLowerCase().includes(term) ||
          country.code.toLowerCase() === term,
      )
      .slice(0, 50)
      .map((country) => ({
        value: country.code,
        label: `${country.name} (${country.code})`,
      }));
  }, [countries, countryQuery]);

  function update<K extends keyof CalendarSettings>(key: K, value: CalendarSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const { organizationId: _organizationId, ...input } = settings;
      const saved = await updateCalendarSettings({
        ...input,
        reminderEmails: input.reminderEmails?.trim() || null,
      });
      setSettings(saved);
      showSuccess("Calendar settings saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    setSendingTest(true);
    try {
      const result = await sendCalendarDigestNow();
      if (result.message) {
        showError(result.message);
      } else if (result.sent === 0) {
        showError("The digest could not be delivered. Check your mail configuration.");
      } else {
        showSuccess(
          `Digest sent to ${result.sent} recipient${result.sent === 1 ? "" : "s"} (${result.itemCount} item${result.itemCount === 1 ? "" : "s"})`,
        );
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send digest");
    } finally {
      setSendingTest(false);
    }
  }

  if (!settings) {
    return (
      <AppPage
        backAction={{ content: "Calendar", url: "/dashboard/calendar" }}
        title="Calendar settings"
      >
        {error ? <Banner tone="critical">{error}</Banner> : <SkeletonBodyText lines={10} />}
      </AppPage>
    );
  }

  return (
    <AppPage
      backAction={{ content: "Calendar", url: "/dashboard/calendar" }}
      primaryAction={{ content: "Save", loading: saving, onAction: () => void handleSave() }}
      secondaryActions={[
        { content: "Cancel", onAction: () => router.push("/dashboard/calendar") },
      ]}
      subtitle="Choose which countries' holidays to track and who gets email reminders."
      title="Calendar settings"
    >
      <div className="quotation-form">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {error ? (
                <Banner tone="critical" onDismiss={() => setError(null)}>
                  {error}
                </Banner>
              ) : null}

              <QuotationFormSection
                description="Search for a country and select it to show its public holidays on the calendar — useful for tracking supplier shutdowns (e.g. Chinese New Year)."
                title="Public holidays"
              >
                <BlockStack gap="300">
                  <Autocomplete
                    allowMultiple
                    options={countryOptions}
                    selected={settings.trackedCountries}
                    textField={
                      <Autocomplete.TextField
                        autoComplete="off"
                        label="Add country"
                        placeholder="Search countries, e.g. China"
                        prefix={<Icon source={SearchIcon} />}
                        value={countryQuery}
                        onChange={setCountryQuery}
                      />
                    }
                    onSelect={(selected) => update("trackedCountries", selected)}
                  />
                  {settings.trackedCountries.length ? (
                    <InlineStack gap="200">
                      {settings.trackedCountries.map((code) => (
                        <Tag
                          key={code}
                          onRemove={() =>
                            update(
                              "trackedCountries",
                              settings.trackedCountries.filter((item) => item !== code),
                            )
                          }
                        >
                          {countryNames[code] ?? code}
                        </Tag>
                      ))}
                    </InlineStack>
                  ) : (
                    <Text as="p" tone="subdued">
                      No countries selected yet.
                    </Text>
                  )}
                </BlockStack>
              </QuotationFormSection>

              <QuotationFormSection
                description="A daily email summarising what needs attention, plus any reminders set on individual events."
                title="Email reminders"
              >
                <FormLayout>
                  <Checkbox
                    checked={settings.remindersEnabled}
                    helpText="Turns off both the daily digest and per-event reminders."
                    label="Send email reminders"
                    onChange={(checked) => update("remindersEnabled", checked)}
                  />
                  <TextField
                    autoComplete="off"
                    disabled={!settings.remindersEnabled}
                    helpText="Comma or new-line separated. Receives the daily digest and is the default for event reminders."
                    label="Reminder recipients"
                    multiline={2}
                    placeholder="e.g. ops@company.com, purchasing@company.com"
                    value={settings.reminderEmails ?? ""}
                    onChange={(value) => update("reminderEmails", value)}
                  />
                  <FormLayout.Group>
                    <Select
                      disabled={!settings.remindersEnabled}
                      helpText="Server time. Reminders go out at or after this hour."
                      label="Send at"
                      options={HOUR_OPTIONS}
                      value={String(settings.digestHour)}
                      onChange={(value) => update("digestHour", Number(value))}
                    />
                    <Select
                      disabled={!settings.remindersEnabled}
                      label="Digest covers"
                      options={LOOKAHEAD_OPTIONS}
                      value={String(settings.digestLookaheadDays)}
                      onChange={(value) => update("digestLookaheadDays", Number(value))}
                    />
                  </FormLayout.Group>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingSm">
                      Include in the daily digest
                    </Text>
                    <Checkbox
                      checked={settings.includeDeliveries}
                      disabled={!settings.remindersEnabled}
                      label="Expected and overdue purchase order deliveries"
                      onChange={(checked) => update("includeDeliveries", checked)}
                    />
                    <Checkbox
                      checked={settings.includeInvoices}
                      disabled={!settings.remindersEnabled}
                      label="Invoice, quotation and warranty due dates"
                      onChange={(checked) => update("includeInvoices", checked)}
                    />
                    <Checkbox
                      checked={settings.includeAnniversaries}
                      disabled={!settings.remindersEnabled}
                      label="Customer and vendor anniversaries"
                      onChange={(checked) => update("includeAnniversaries", checked)}
                    />
                    <Checkbox
                      checked={settings.includeHolidays}
                      disabled={!settings.remindersEnabled}
                      label="Public holidays in tracked countries"
                      onChange={(checked) => update("includeHolidays", checked)}
                    />
                  </BlockStack>
                </FormLayout>
              </QuotationFormSection>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <QuotationFormSection
              description="Save your changes first, then send today's digest to check what recipients will receive."
              title="Test reminders"
            >
              <Button loading={sendingTest} onClick={() => void handleSendTest()}>
                Send digest now
              </Button>
            </QuotationFormSection>
          </Layout.Section>
        </Layout>
      </div>
    </AppPage>
  );
}
