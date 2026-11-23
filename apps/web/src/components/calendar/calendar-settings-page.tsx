"use client";

import {
  Autocomplete,
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  Icon,
  InlineStack,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  ClockIcon,
  EmailIcon,
  GlobeIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  XIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { parseEmailList } from "@frog1/shared";
import {
  getCalendarSettings,
  listHolidayCountries,
  sendCalendarDigestNow,
  updateCalendarSettings,
  type CalendarSettings,
  type HolidayCountry,
} from "@/lib/calendar-api";
import { cn } from "@/lib/utils";

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

/** Shortcuts shown under the country search. */
const POPULAR_COUNTRIES = ["AE", "CN", "US", "GB", "IN", "SA", "DE"];

type DigestKey = "includeDeliveries" | "includeInvoices" | "includeAnniversaries" | "includeHolidays";

const DIGEST_OPTIONS: Array<{ key: DigestKey; label: string; help: string; source: string }> = [
  {
    key: "includeDeliveries",
    label: "Deliveries",
    help: "Expected and overdue purchase order deliveries",
    source: "purchase_order",
  },
  {
    key: "includeInvoices",
    label: "Due dates",
    help: "Invoice, quotation and warranty due dates",
    source: "invoice_due",
  },
  {
    key: "includeAnniversaries",
    label: "Anniversaries",
    help: "Customer and vendor anniversaries",
    source: "customer_anniversary",
  },
  {
    key: "includeHolidays",
    label: "Public holidays",
    help: "Holidays in the countries you track",
    source: "holiday",
  },
];

function lookaheadLabel(days: number) {
  return LOOKAHEAD_OPTIONS.find((option) => option.value === String(days))?.label ?? `Today + ${days} days`;
}

export function CalendarSettingsPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [saved, setSaved] = useState<CalendarSettings | null>(null);
  const [countries, setCountries] = useState<HolidayCountry[]>([]);
  const [countryQuery, setCountryQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    Promise.all([getCalendarSettings(), listHolidayCountries()])
      .then(([loadedSettings, loadedCountries]) => {
        setSettings(loadedSettings);
        setSaved(loadedSettings);
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

  const dirty = useMemo(
    () => Boolean(settings && saved && JSON.stringify(settings) !== JSON.stringify(saved)),
    [settings, saved],
  );

  function update<K extends keyof CalendarSettings>(key: K, value: CalendarSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const { organizationId: _organizationId, ...input } = settings;
      const result = await updateCalendarSettings({
        ...input,
        reminderEmails: input.reminderEmails?.trim() || null,
      });
      setSettings(result);
      setSaved(result);
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
      <AppPage backAction={{ content: "Calendar", url: "/dashboard/calendar" }} title="Calendar settings">
        {error ? (
          <Banner tone="critical">{error}</Banner>
        ) : (
          <Card>
            <SkeletonBodyText lines={10} />
          </Card>
        )}
      </AppPage>
    );
  }

  const tracked = settings.trackedCountries;
  const popular = POPULAR_COUNTRIES.filter((code) => countryNames[code] && !tracked.includes(code));
  const recipients = parseEmailList(settings.reminderEmails ?? "");
  const included = DIGEST_OPTIONS.filter((option) => settings[option.key]);
  const on = settings.remindersEnabled;

  return (
    <AppPage
      backAction={{ content: "Calendar", url: "/dashboard/calendar" }}
      primaryAction={{
        content: "Save",
        loading: saving,
        disabled: !dirty,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[
        {
          content: "Discard changes",
          disabled: !dirty,
          onAction: () => setSettings(saved),
        },
      ]}
      subtitle="Choose which countries' holidays to track and who gets email reminders."
      title="Calendar settings"
      titleMetadata={dirty ? <Badge tone="attention">Unsaved changes</Badge> : undefined}
    >
      <div className="cset">
        <BlockStack gap="400">
          {error ? (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}

          {/* Public holidays */}
          <Card>
            <BlockStack gap="400">
              <div className="cset-head">
                <span className="cset-head__icon">
                  <Icon source={GlobeIcon} />
                </span>
                <div>
                  <Text as="h2" variant="headingMd">
                    Public holidays
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Show the public holidays of the countries you work with — handy for supplier
                    shutdowns like Chinese New Year.
                  </Text>
                </div>
                <Badge>{`${tracked.length} tracked`}</Badge>
              </div>

              <Autocomplete
                allowMultiple
                options={countryOptions}
                selected={tracked}
                textField={
                  <Autocomplete.TextField
                    autoComplete="off"
                    label="Add country"
                    labelHidden
                    placeholder="Search countries, e.g. China"
                    prefix={<Icon source={SearchIcon} />}
                    value={countryQuery}
                    onChange={setCountryQuery}
                  />
                }
                onSelect={(selected) => update("trackedCountries", selected)}
              />

              {tracked.length ? (
                <div className="cset-countries">
                  {tracked.map((code) => (
                    <div className="cset-country" key={code}>
                      <span className="cset-country__code">{code}</span>
                      <span className="cset-country__name">{countryNames[code] ?? code}</span>
                      <Button
                        accessibilityLabel={`Stop tracking ${countryNames[code] ?? code}`}
                        icon={XIcon}
                        size="slim"
                        variant="tertiary"
                        onClick={() =>
                          update(
                            "trackedCountries",
                            tracked.filter((item) => item !== code),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cset-empty">No countries tracked yet — search above or pick one below.</div>
              )}

              {popular.length ? (
                <div className="cset-popular">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Popular:
                  </Text>
                  {popular.map((code) => (
                    <Button
                      icon={PlusIcon}
                      key={code}
                      size="slim"
                      onClick={() => update("trackedCountries", [...tracked, code])}
                    >
                      {countryNames[code]}
                    </Button>
                  ))}
                </div>
              ) : null}
            </BlockStack>
          </Card>

          {/* Email reminders */}
          <Card>
            <BlockStack gap="400">
              <div className="cset-head">
                <span className="cset-head__icon">
                  <Icon source={EmailIcon} />
                </span>
                <div>
                  <Text as="h2" variant="headingMd">
                    Email reminders
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    A daily email of what needs attention, plus the reminders you set on individual
                    events.
                  </Text>
                </div>
                <Badge tone={on ? "success" : undefined}>{on ? "On" : "Off"}</Badge>
              </div>

              <div className={cn("cset-switch", on && "is-on")}>
                <Checkbox
                  checked={on}
                  helpText={
                    on
                      ? "The daily digest and event reminders are being sent."
                      : "No digest or event reminder emails will be sent."
                  }
                  label="Send email reminders"
                  onChange={(checked) => update("remindersEnabled", checked)}
                />
              </div>

              {on ? (
                <>
                  <TextField
                    autoComplete="off"
                    helpText="Separate with commas or new lines. These people get the daily digest, and event reminders go here unless the event says otherwise."
                    label="Recipients"
                    multiline={2}
                    placeholder="ops@company.com, purchasing@company.com"
                    value={settings.reminderEmails ?? ""}
                    onChange={(value) => update("reminderEmails", value)}
                  />
                  <FormLayout>
                    <FormLayout.Group>
                      <Select
                        helpText="Server time"
                        label="Send every day at"
                        options={HOUR_OPTIONS}
                        value={String(settings.digestHour)}
                        onChange={(value) => update("digestHour", Number(value))}
                      />
                      <Select
                        helpText="How far ahead each digest looks"
                        label="Digest covers"
                        options={LOOKAHEAD_OPTIONS}
                        value={String(settings.digestLookaheadDays)}
                        onChange={(value) => update("digestLookaheadDays", Number(value))}
                      />
                    </FormLayout.Group>
                  </FormLayout>

                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Include in the digest
                    </Text>
                    <div className="cset-opts">
                      {DIGEST_OPTIONS.map((option) => (
                        <div
                          className={cn("cset-opt", `calendar-dot--${option.source}`, settings[option.key] && "is-on")}
                          key={option.key}
                        >
                          <span className="cset-opt__dot" />
                          <Checkbox
                            checked={settings[option.key]}
                            helpText={option.help}
                            label={option.label}
                            onChange={(checked) => update(option.key, checked)}
                          />
                        </div>
                      ))}
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Your own calendar events are always included.
                    </Text>
                  </BlockStack>
                </>
              ) : null}
            </BlockStack>
          </Card>
        </BlockStack>

        {/* Side: what the digest will look like */}
        <div className="cset-side">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Daily digest
              </Text>
              <div className={cn("cset-mail", !on && "is-off")}>
                <div className="cset-mail__row">
                  <span>To</span>
                  <strong>
                    {recipients.length
                      ? recipients.length > 2
                        ? `${recipients.slice(0, 2).join(", ")} +${recipients.length - 2}`
                        : recipients.join(", ")
                      : "No recipients yet"}
                  </strong>
                </div>
                <div className="cset-mail__row">
                  <span>When</span>
                  <strong>
                    <Icon source={ClockIcon} tone="subdued" />
                    Every day at {HOUR_OPTIONS[settings.digestHour]?.label ?? "—"}
                  </strong>
                </div>
                <div className="cset-mail__row">
                  <span>Covers</span>
                  <strong>{lookaheadLabel(settings.digestLookaheadDays)}</strong>
                </div>
                <div className="cset-mail__list">
                  <span className="cset-mail__item calendar-dot--event">
                    <i />
                    Your events
                  </span>
                  {included.map((option) => (
                    <span className={cn("cset-mail__item", `calendar-dot--${option.source}`)} key={option.key}>
                      <i />
                      {option.label}
                    </span>
                  ))}
                </div>
                {!on ? <div className="cset-mail__off">Reminders are switched off</div> : null}
              </div>
              <Button
                disabled={dirty || !on || (saved?.reminderEmails ?? "").trim() === ""}
                fullWidth
                icon={SendIcon}
                loading={sendingTest}
                onClick={() => void handleSendTest()}
              >
                Send a test digest now
              </Button>
              <Text as="p" variant="bodySm" tone="subdued">
                {dirty
                  ? "Save your changes first, then send a test."
                  : !on
                    ? "Turn on email reminders to send a test."
                    : (saved?.reminderEmails ?? "").trim() === ""
                      ? "Add and save at least one recipient to send a test."
                      : "Sends today's digest to the recipients above so you can check it."}
              </Text>
            </BlockStack>
          </Card>
        </div>
      </div>
    </AppPage>
  );
}
