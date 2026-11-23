"use client";

import {
  Badge,
  Button,
  DropZone,
  Icon,
  Select,
  SkeletonBodyText,
  Spinner,
  Tabs,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { getCompanySettings, updateCompanySettings, uploadCompanyLogo } from "@/lib/settings-api";
import { cn } from "@/lib/utils";
import { listWarehouses } from "@/lib/warehouses-api";

type TabId = "identity" | "contact" | "emails" | "operations";

interface CompanyForm {
  name: string;
  tagline: string;
  taxId: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  replyToEmail: string;
  alertEmails: string[];
  defaultWarehouseId: string;
}

const EMPTY: CompanyForm = {
  name: "",
  tagline: "",
  taxId: "",
  address: "",
  city: "",
  country: "",
  phone: "",
  email: "",
  website: "",
  replyToEmail: "",
  alertEmails: [],
  defaultWarehouseId: "",
};

const TAB_FIELDS: Record<TabId, Array<keyof CompanyForm>> = {
  identity: ["name", "tagline", "taxId"],
  contact: ["address", "city", "country", "phone", "email", "website"],
  emails: ["replyToEmail", "alertEmails"],
  operations: ["defaultWarehouseId"],
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "identity", label: "Identity" },
  { id: "contact", label: "Address & contact" },
  { id: "emails", label: "Emails & alerts" },
  { id: "operations", label: "Operations" },
];

/** What a complete document header needs, and which tab holds it. */
const COMPLETENESS: Array<{ key: keyof CompanyForm | "logo"; label: string; tab: TabId }> = [
  { key: "name", label: "Company name", tab: "identity" },
  { key: "logo", label: "Logo", tab: "identity" },
  { key: "tagline", label: "Tagline", tab: "identity" },
  { key: "taxId", label: "Tax ID", tab: "identity" },
  { key: "address", label: "Street address", tab: "contact" },
  { key: "city", label: "City", tab: "contact" },
  { key: "country", label: "Country", tab: "contact" },
  { key: "phone", label: "Phone", tab: "contact" },
  { key: "email", label: "Email", tab: "contact" },
  { key: "website", label: "Website", tab: "contact" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join("")
      .toUpperCase() || "CO"
  );
}

function sameValue(a: CompanyForm[keyof CompanyForm], b: CompanyForm[keyof CompanyForm]) {
  return Array.isArray(a) && Array.isArray(b) ? a.join("|") === b.join("|") : a === b;
}

function validate(form: CompanyForm) {
  const errors: Partial<Record<keyof CompanyForm, string>> = {};
  if (!form.name.trim()) errors.name = "Company name is required";
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address";
  if (form.replyToEmail.trim() && !EMAIL_RE.test(form.replyToEmail.trim()))
    errors.replyToEmail = "Enter a valid email address";
  if (form.website.trim() && !/^(https?:\/\/)?[^\s.]+\.[^\s]+$/i.test(form.website.trim()))
    errors.website = "Enter a web address like https://company.com";
  return errors;
}

function CompanySettingsInner() {
  const { showSuccess, showError } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "identity";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saved, setSaved] = useState<CompanyForm>(EMPTY);
  const [form, setForm] = useState<CompanyForm>(EMPTY);
  const [baseCurrencyId, setBaseCurrencyId] = useState("");
  const [baseCurrencyCode, setBaseCurrencyCode] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  // The stored file can go missing (e.g. local uploads not migrated); treat that as no logo.
  const [logoBroken, setLogoBroken] = useState(false);
  const logoOk = Boolean(logoUrl) && !logoBroken;
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [alertDraft, setAlertDraft] = useState("");
  const [alertError, setAlertError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [company, warehouses] = await Promise.all([
        getCompanySettings(),
        listWarehouses({ perPage: 100 }).catch(() => ({ data: [] as Array<{ id: string; code: string; name: string }> })),
      ]);
      const p = company.companyProfile;
      const next: CompanyForm = {
        name: company.name,
        tagline: p.tagline,
        taxId: p.taxId,
        address: p.address,
        city: p.city,
        country: p.country,
        phone: p.phone,
        email: p.email,
        website: p.website,
        replyToEmail: p.replyToEmail,
        alertEmails: p.alertEmails,
        defaultWarehouseId: company.defaultWarehouseId ?? "",
      };
      setSaved(next);
      setForm(next);
      setBaseCurrencyId(company.baseCurrencyId ?? "");
      setBaseCurrencyCode(company.baseCurrencyCode ?? null);
      setLogoUrl(company.logoUrl);
      setWarehouseOptions(warehouses.data.map((w) => ({ label: `${w.code} · ${w.name}`, value: w.id })));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load company settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = useCallback(<K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const errors = useMemo(() => validate(form), [form]);
  const fieldError = (key: keyof CompanyForm) => (showErrors || form[key] !== saved[key] ? errors[key] : undefined);

  const dirtyFields = (Object.keys(form) as Array<keyof CompanyForm>).filter((k) => !sameValue(form[k], saved[k]));
  const dirty = dirtyFields.length > 0;
  const dirtyTabs = TABS.filter((t) => TAB_FIELDS[t.id].some((k) => dirtyFields.includes(k)));
  const errorTabs = TABS.filter((t) => TAB_FIELDS[t.id].some((k) => errors[k]));

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const missing = COMPLETENESS.filter((item) =>
    item.key === "logo" ? !logoOk : !String(form[item.key as keyof CompanyForm] ?? "").trim(),
  );
  const completion = Math.round(((COMPLETENESS.length - missing.length) / COMPLETENESS.length) * 100);

  const goTab = useCallback(
    (id: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  async function handleSave() {
    if (saving) return;
    setShowErrors(true);
    if (Object.keys(errors).length) {
      const first = errorTabs[0];
      if (first && first.id !== tab) goTab(first.id);
      showError("Fix the highlighted fields before saving.");
      return;
    }
    if (!baseCurrencyId) {
      showError("Set a base currency under Settings → Currencies first.");
      return;
    }
    setSaving(true);
    try {
      const website = form.website.trim();
      const normalized: CompanyForm = {
        ...form,
        name: form.name.trim(),
        website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
      };
      const result = await updateCompanySettings({
        name: normalized.name,
        baseCurrencyId,
        defaultWarehouseId: normalized.defaultWarehouseId || null,
        companyProfile: {
          tagline: normalized.tagline,
          address: normalized.address,
          city: normalized.city,
          country: normalized.country,
          phone: normalized.phone,
          email: normalized.email.trim(),
          replyToEmail: normalized.replyToEmail.trim(),
          website: normalized.website,
          taxId: normalized.taxId,
          alertEmails: normalized.alertEmails,
        },
      });
      setLogoUrl(result.logoUrl);
      setSaved(normalized);
      setForm(normalized);
      setShowErrors(false);
      showSuccess("Company profile saved");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't save company settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) {
      showError("Choose a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError("That image is over 5 MB. Choose a smaller one.");
      return;
    }
    setUploadingLogo(true);
    try {
      const result = await uploadCompanyLogo(file);
      setLogoUrl(result.logoUrl);
      setLogoBroken(false);
      showSuccess("Logo updated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Couldn't upload the logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  function addAlertEmails() {
    const candidates = alertDraft
      .split(/[,;\s]+/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (!candidates.length) {
      setAlertError("Enter an email address");
      return;
    }
    const bad = candidates.find((v) => !EMAIL_RE.test(v));
    if (bad) {
      setAlertError(`${bad} isn't a valid email address`);
      return;
    }
    const next = [...new Set([...form.alertEmails, ...candidates])];
    if (next.length > 20) {
      setAlertError("You can add up to 20 recipients");
      return;
    }
    set("alertEmails", next);
    setAlertDraft("");
    setAlertError(undefined);
  }

  const tabs = TABS.map((t) => ({
    id: t.id,
    content: `${t.label}${errorTabs.some((e) => e.id === t.id) && showErrors ? " ⚠" : dirtyTabs.some((d) => d.id === t.id) ? " •" : ""}`,
    accessibilityLabel: t.label,
    panelID: `company-${t.id}`,
    badge:
      t.id === "emails"
        ? String(form.alertEmails.length)
        : t.id === "identity" || t.id === "contact"
          ? missing.filter((m) => m.tab === t.id).length
            ? String(missing.filter((m) => m.tab === t.id).length)
            : undefined
          : undefined,
  }));
  const selectedIndex = TABS.findIndex((t) => t.id === tab);
  const initials = initialsOf(form.name);
  const cityLine = [form.city, form.country].filter((v) => v.trim()).join(", ");

  if (loading) {
    return (
      <AppPage title="Company profile">
        <div className="cpf">
          <section className="prf-hero">
            <SkeletonBodyText lines={3} />
          </section>
          <section className="ex-surface ex-pad">
            <SkeletonBodyText lines={8} />
          </section>
        </div>
      </AppPage>
    );
  }

  if (loadError) {
    return (
      <AppPage title="Company profile">
        <div className="ac-error">
          <span>{loadError}</span>
          <button className="st-link" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      fullWidth
      title="Company profile"
      subtitle="Your business identity on quotations, invoices, emails and reports."
      primaryAction={{ content: "Save changes", loading: saving, disabled: !dirty, onAction: () => void handleSave() }}
    >
      <div className="cpf">
        {/* ── Summary ── */}
        <section className="prf-hero cpf-hero">
          <span className="cpf-hero__logo">
            {logoOk && logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={logoUrl} onError={() => setLogoBroken(true)} />
            ) : (
              <span>{initials}</span>
            )}
          </span>
          <div className="prf-hero__main">
            <span className="prf-hero__label">Active organization</span>
            <h2>{form.name || "Your company"}</h2>
            <p>{form.tagline || "No tagline yet"}</p>
            <div className="prf-hero__facts">
              {form.taxId ? (
                <span>
                  <b>Tax ID</b> {form.taxId}
                </span>
              ) : null}
              {cityLine ? (
                <span>
                  <b>Based in</b> {cityLine}
                </span>
              ) : null}
              <span>
                <b>Base currency</b> {baseCurrencyCode ?? "Not set"}
              </span>
            </div>
          </div>
          <div className="cpf-hero__score">
            <div className="cpf-hero__ring" style={{ ["--cpf-pct" as string]: `${completion}%` }}>
              <strong>{completion}%</strong>
            </div>
            <div className="cpf-hero__todo">
              <span>{missing.length ? "To complete your documents" : "Profile complete"}</span>
              {missing.length ? (
                <div>
                  {missing.slice(0, 4).map((m) => (
                    <button key={m.key} type="button" onClick={() => goTab(m.tab)}>
                      + {m.label}
                    </button>
                  ))}
                  {missing.length > 4 ? <small>+{missing.length - 4} more</small> : null}
                </div>
              ) : (
                <small>Every document header field is filled in.</small>
              )}
            </div>
          </div>
        </section>

        {/* ── Tabs ── */}
        <section className="ex-surface cpf-tabs">
          <Tabs tabs={tabs} selected={selectedIndex < 0 ? 0 : selectedIndex} onSelect={(i) => goTab(TABS[i].id)} />
        </section>

        <div className="cpf-grid">
          <div className="cpf-main" id={`company-${tab}`}>
            {tab === "identity" ? (
              <>
                <section className="ex-surface prf-card">
                  <header className="prf-card__head">
                    <h3>Business identity</h3>
                    <p>The legal and public-facing name printed at the top of every document.</p>
                  </header>
                  <div className="prf-card__body">
                    <TextField
                      autoComplete="organization"
                      label="Company name"
                      value={form.name}
                      onChange={(v) => set("name", v)}
                      error={fieldError("name")}
                      requiredIndicator
                    />
                    <TextField
                      autoComplete="off"
                      label="Tagline"
                      helpText="One short line under your company name."
                      placeholder="e.g. Marine engineering, delivered with confidence"
                      value={form.tagline}
                      onChange={(v) => set("tagline", v)}
                      maxLength={255}
                    />
                    <TextField
                      autoComplete="off"
                      label="Tax / registration ID"
                      helpText="Shown as TRN on invoices."
                      placeholder="Company registration or tax number"
                      value={form.taxId}
                      onChange={(v) => set("taxId", v)}
                    />
                  </div>
                </section>

                <section className="ex-surface prf-card">
                  <header className="prf-card__head">
                    <h3>Logo</h3>
                    <p>Used on PDFs and customer documents. Uploading saves it straight away.</p>
                  </header>
                  <div className="prf-card__body cpf-logo">
                    <div className="cpf-logo__preview">
                      {logoOk && logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={`${form.name} logo`} src={logoUrl} onError={() => setLogoBroken(true)} />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>
                    <div className="cpf-logo__drop">
                      <DropZone
                        accept="image/png,image/jpeg,image/webp"
                        allowMultiple={false}
                        disabled={uploadingLogo}
                        type="image"
                        label="Company logo"
                        labelHidden
                        onDrop={(_all, accepted) => void handleLogoUpload(accepted[0])}
                      >
                        <div className="cpf-logo__zone">
                          {uploadingLogo ? (
                            <>
                              <Spinner size="small" />
                              <Text as="span" tone="subdued">
                                Uploading…
                              </Text>
                            </>
                          ) : (
                            <>
                              <span className="ecf__icon">
                                <Icon source={ImageIcon} />
                              </span>
                              <Text as="span" fontWeight="semibold">
                                {logoOk ? "Drop a new logo to replace it" : logoUrl ? "Logo file is missing — upload it again" : "Drop your logo here"}
                              </Text>
                              <Text as="span" tone="subdued" variant="bodySm">
                                or click to choose · PNG, JPG or WebP up to 5 MB · a wide image on a transparent
                                background looks best
                              </Text>
                            </>
                          )}
                        </div>
                      </DropZone>
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {tab === "contact" ? (
              <>
                <section className="ex-surface prf-card">
                  <header className="prf-card__head">
                    <h3>Registered address</h3>
                    <p>Printed in the document header and footer.</p>
                  </header>
                  <div className="prf-card__body">
                    <TextField
                      autoComplete="street-address"
                      label="Street address"
                      multiline={2}
                      placeholder="Building, street, district"
                      value={form.address}
                      onChange={(v) => set("address", v)}
                    />
                    <div className="cpf-pair">
                      <TextField
                        autoComplete="address-level2"
                        label="City"
                        value={form.city}
                        onChange={(v) => set("city", v)}
                      />
                      <TextField
                        autoComplete="country-name"
                        label="Country"
                        value={form.country}
                        onChange={(v) => set("country", v)}
                      />
                    </div>
                  </div>
                </section>

                <section className="ex-surface prf-card">
                  <header className="prf-card__head">
                    <h3>Contact details</h3>
                    <p>How customers reach you — printed on quotations and invoices.</p>
                  </header>
                  <div className="prf-card__body">
                    <div className="cpf-pair">
                      <TextField
                        autoComplete="tel"
                        label="Phone"
                        type="tel"
                        placeholder="+971 00 000 0000"
                        value={form.phone}
                        onChange={(v) => set("phone", v)}
                      />
                      <TextField
                        autoComplete="email"
                        label="Email"
                        type="email"
                        placeholder="accounts@company.com"
                        value={form.email}
                        onChange={(v) => set("email", v)}
                        error={fieldError("email")}
                      />
                    </div>
                    <TextField
                      autoComplete="url"
                      label="Website"
                      placeholder="https://www.company.com"
                      helpText="https:// is added for you if you leave it out."
                      value={form.website}
                      onChange={(v) => set("website", v)}
                      error={fieldError("website")}
                    />
                  </div>
                </section>
              </>
            ) : null}

            {tab === "emails" ? (
              <>
                <section className="ex-surface prf-card">
                  <header className="prf-card__head">
                    <h3>Reply-to address</h3>
                    <p>Where customer replies to quotation follow-ups and other company emails land.</p>
                  </header>
                  <div className="prf-card__body">
                    <TextField
                      autoComplete="email"
                      label="Reply-to email"
                      type="email"
                      placeholder={form.email || "info@company.com"}
                      helpText={
                        form.email
                          ? `Leave empty to use ${form.email}. Use an inbox someone checks.`
                          : "Use an inbox someone checks."
                      }
                      value={form.replyToEmail}
                      onChange={(v) => set("replyToEmail", v)}
                      error={fieldError("replyToEmail")}
                    />
                  </div>
                </section>

                <section className="ex-surface prf-card">
                  <header className="prf-card__head sec-card-head">
                    <span>
                      <h3>Signed-quotation alerts</h3>
                      <p>These people get an email when a customer digitally signs a quotation.</p>
                    </span>
                    <Badge tone={form.alertEmails.length ? "info" : "attention"}>
                      {`${form.alertEmails.length} of 20`}
                    </Badge>
                  </header>
                  <div className="prf-card__body">
                    <div className="cpf-add">
                      <TextField
                        autoComplete="off"
                        label="Add recipients"
                        placeholder="name@company.com — paste several separated by commas"
                        value={alertDraft}
                        onChange={(v) => {
                          setAlertDraft(v);
                          setAlertError(undefined);
                        }}
                        error={alertError}
                        connectedRight={
                          <Button onClick={addAlertEmails} disabled={!alertDraft.trim()}>
                            Add
                          </Button>
                        }
                      />
                    </div>
                    {form.alertEmails.length ? (
                      <div className="cpf-tags">
                        {form.alertEmails.map((r) => (
                          <Tag key={r} onRemove={() => set("alertEmails", form.alertEmails.filter((x) => x !== r))}>
                            {r}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <p className="cpf-warn">
                        <i className="st-dot is-low" /> Nobody is notified yet. Signatures are still saved, but no one
                        gets an email.
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : null}

            {tab === "operations" ? (
              <>
                <section className="ex-surface prf-card">
                  <header className="prf-card__head">
                    <h3>Fulfillment</h3>
                    <p>The fallback location for bulk-stock sales.</p>
                  </header>
                  <div className="prf-card__body">
                    <Select
                      label="Default warehouse"
                      helpText="Used only when a sales order line has no warehouse selected."
                      options={[{ label: "No default warehouse", value: "" }, ...warehouseOptions]}
                      value={form.defaultWarehouseId}
                      onChange={(v) => set("defaultWarehouseId", v)}
                    />
                  </div>
                </section>

                <section className="ex-surface prf-card">
                  <header className="prf-card__head sec-card-head">
                    <span>
                      <h3>Currency</h3>
                      <p>Pricing, reporting currency and exchange rates live on their own page.</p>
                    </span>
                    {baseCurrencyId ? (
                      <Badge tone="success">{`Base: ${baseCurrencyCode ?? "set"}`}</Badge>
                    ) : (
                      <Badge tone="attention">Not set</Badge>
                    )}
                  </header>
                  <footer className="prf-links">
                    <Link href="/dashboard/settings/currencies">Manage currencies →</Link>
                    <Link href="/dashboard/settings/sales-pricing">Taxes &amp; pricing →</Link>
                    <Link href="/dashboard/settings/branches">Branches →</Link>
                  </footer>
                </section>
              </>
            ) : null}
          </div>

          {/* ── Live document header ── */}
          <aside className="cpf-side">
            <section className="ex-surface prf-card">
              <header className="prf-card__head">
                <h3>On your documents</h3>
                <p>A live preview of the header on quotations and invoices.</p>
              </header>
              <div className="cpf-doc">
                <div className="cpf-doc__top">
                  <span className="cpf-doc__logo">
                    {logoOk && logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" src={logoUrl} onError={() => setLogoBroken(true)} />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </span>
                  <span className="cpf-doc__title">
                    <b>QUOTATION</b>
                    <small>QT-0001</small>
                  </span>
                </div>
                <strong className="cpf-doc__name">{form.name || "Company name"}</strong>
                {form.tagline ? <em className="cpf-doc__tag">{form.tagline}</em> : null}
                <div className="cpf-doc__lines">
                  {form.address ? <span>{form.address.replace(/[\s,]+$/g, "").replace(/\n+/g, ", ")}</span> : null}
                  {cityLine ? <span>{cityLine}</span> : null}
                  {[form.phone, form.email].filter(Boolean).length ? (
                    <span>{[form.phone, form.email].filter(Boolean).join(" · ")}</span>
                  ) : null}
                  {form.website ? <span>{form.website.replace(/^https?:\/\//i, "")}</span> : null}
                  {form.taxId ? <span>TRN {form.taxId}</span> : null}
                </div>
                <div className="cpf-doc__ghost" aria-hidden>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </section>
          </aside>
        </div>

        {dirty ? (
          <div className="cpf-savebar" role="status">
            <span>
              <i className="st-dot is-low" /> Unsaved changes in {dirtyTabs.map((t) => t.label).join(", ")}
            </span>
            <span className="prf-card__actions">
              <Button
                disabled={saving}
                onClick={() => {
                  setForm(saved);
                  setShowErrors(false);
                }}
              >
                Discard
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
                Save changes
              </Button>
            </span>
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

export default function CompanySettingsPage() {
  return (
    <Suspense fallback={null}>
      <CompanySettingsInner />
    </Suspense>
  );
}
