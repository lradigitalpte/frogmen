"use client";

import { Banner, Form, Modal, Select, TextField } from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import { createBranch, updateBranch, type Branch } from "@/lib/security-api";

export type NumberingFormat =
  | "alphanumeric_random"
  | "numeric_random"
  | "date_random"
  | "sequential"
  | "numeric_8";

interface BranchFormModalProps {
  open: boolean;
  branch: Branch | null;
  branches: Branch[];
  numberingFormat: NumberingFormat | null;
  onClose: () => void;
  onSaved: (branch: Branch, created: boolean) => void;
}

interface Values {
  name: string;
  code: string;
  prefix: string;
  timezone: string;
  street1: string;
  street2: string;
  city: string;
  zip: string;
  countryCode: string;
}

const COMMON_ZONES = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Muscat",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "Australia/Sydney",
  "UTC",
];

export function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

function zoneOffset(zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return part === "GMT" ? "GMT+0" : part ?? "";
  } catch {
    return "";
  }
}

/** An example document number for a branch prefix, matching the org's numbering format. */
export function sampleNumber(prefix: string, type: string, format: NumberingFormat | null) {
  const p = `${prefix || "XXX"}-${type}-`;
  switch (format) {
    case "sequential":
      return `${p}00001`;
    case "numeric_random":
      return `${p}48213`;
    case "date_random":
      return `${p}${String(new Date().getFullYear()).slice(-2)}-48213`;
    case "numeric_8":
      return "48213907";
    default:
      return `${p}K7Q2M`;
  }
}

function fromBranch(branch: Branch | null): Values {
  return {
    name: branch?.name ?? "",
    code: branch?.code ?? "",
    prefix: branch?.documentPrefix ?? "",
    timezone: branch?.timezone || "Asia/Dubai",
    street1: branch?.street1 ?? "",
    street2: branch?.street2 ?? "",
    city: branch?.city ?? "",
    zip: branch?.zip ?? "",
    countryCode: branch?.countryCode ?? "",
  };
}

export function BranchFormModal({ open, branch, branches, numberingFormat, onClose, onSaved }: BranchFormModalProps) {
  const isEdit = Boolean(branch);
  const [values, setValues] = useState<Values>(fromBranch(branch));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(fromBranch(branch));
    setTouched(false);
    setError(null);
  }, [open, branch]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  const timezoneOptions = useMemo(() => {
    let all: string[] = [];
    try {
      all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      all = [];
    }
    const label = (z: string) => `${z.replace(/_/g, " ")} (${zoneOffset(z)})`;
    const common = COMMON_ZONES.map((z) => ({ label: label(z), value: z }));
    const rest = all.filter((z) => !COMMON_ZONES.includes(z)).map((z) => ({ label: label(z), value: z }));
    const current = values.timezone && !COMMON_ZONES.includes(values.timezone) && !all.includes(values.timezone)
      ? [{ label: values.timezone, value: values.timezone }]
      : [];
    return [
      { title: "Common", options: [...current, ...common] },
      ...(rest.length ? [{ title: "All time zones", options: rest }] : []),
    ];
  }, [values.timezone]);

  const code = normalizeCode(values.code);
  const prefix = normalizeCode(values.prefix || code);
  const others = branches.filter((b) => b.id !== branch?.id);
  const errors = {
    name: !values.name.trim() ? "Enter a branch name" : undefined,
    code:
      code.length < 2
        ? "Use at least 2 letters or numbers"
        : others.some((b) => b.code === code)
          ? `${code} is already used by ${others.find((b) => b.code === code)?.name}`
          : undefined,
    prefix:
      prefix.length < 2
        ? "Use at least 2 letters or numbers"
        : others.some((b) => b.documentPrefix === prefix)
          ? `${others.find((b) => b.documentPrefix === prefix)?.name} already uses this prefix — their document numbers would look the same`
          : undefined,
    countryCode:
      values.countryCode && !/^[A-Za-z]{2}$/.test(values.countryCode) ? "Use the 2-letter code, e.g. AE" : undefined,
  };
  // A shared prefix is allowed by the API but confusing; treat it as a warning only.
  const blocking = Boolean(errors.name || errors.code || (prefix.length < 2 ? errors.prefix : undefined) || errors.countryCode);
  const prefixChanged = isEdit && branch && prefix !== branch.documentPrefix;

  async function save() {
    setTouched(true);
    if (blocking || saving) return;
    setSaving(true);
    setError(null);
    const body = {
      name: values.name.trim(),
      code,
      documentPrefix: prefix,
      timezone: values.timezone,
      street1: values.street1.trim(),
      street2: values.street2.trim(),
      city: values.city.trim(),
      zip: values.zip.trim(),
      countryCode: values.countryCode.trim().toUpperCase(),
    };
    try {
      const saved = branch ? await updateBranch(branch.id, body) : await createBranch(body);
      onSaved(saved, !branch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the branch");
    } finally {
      setSaving(false);
    }
  }

  const show = (key: keyof typeof errors) => (touched || values[key === "prefix" ? "prefix" : key] ? errors[key] : undefined);

  return (
    <Modal
      open={open}
      onClose={() => (saving ? undefined : onClose())}
      size="large"
      title={isEdit ? `Edit ${branch?.name}` : "Add branch"}
      primaryAction={{ content: isEdit ? "Save changes" : "Create branch", loading: saving, onAction: () => void save() }}
      secondaryActions={[{ content: "Cancel", disabled: saving, onAction: onClose }]}
    >
      <Modal.Section>
        <Form onSubmit={() => void save()}>
          <div className="brs-form">
            {error ? (
              <div className="brs-form__full">
                <Banner tone="critical" onDismiss={() => setError(null)}>
                  {error}
                </Banner>
              </div>
            ) : null}

            <div className="brs-form__main">
              <section className="brs-form__group">
                <h3>Branch</h3>
                <TextField
                  autoComplete="off"
                  label="Branch name"
                  placeholder="e.g. Dubai Operations"
                  value={values.name}
                  onChange={(v) => set("name", v)}
                  error={touched ? errors.name : undefined}
                  autoFocus={!isEdit}
                />
                <div className="brs-form__pair">
                  <TextField
                    autoComplete="off"
                    label="Branch code"
                    placeholder="DXB"
                    helpText="Short ID shown in the branch switcher."
                    value={values.code}
                    onChange={(v) => {
                      const next = normalizeCode(v);
                      // Keep the prefix in step with the code until someone changes it by hand.
                      if (!values.prefix || values.prefix === normalizeCode(values.code)) set("prefix", next);
                      set("code", next);
                    }}
                    error={show("code")}
                  />
                  <TextField
                    autoComplete="off"
                    label="Document prefix"
                    placeholder={code || "DXB"}
                    helpText="Starts every quotation, invoice and order number."
                    value={values.prefix}
                    onChange={(v) => set("prefix", normalizeCode(v))}
                    error={prefix.length < 2 ? show("prefix") : undefined}
                  />
                </div>
                <Select
                  label="Time zone"
                  helpText="Used for this branch's dates, reminders and reports."
                  options={timezoneOptions}
                  value={values.timezone}
                  onChange={(v) => set("timezone", v)}
                />
              </section>

              <section className="brs-form__group">
                <h3>
                  Address <small>optional</small>
                </h3>
                <TextField
                  autoComplete="address-line1"
                  label="Street"
                  value={values.street1}
                  onChange={(v) => set("street1", v)}
                />
                <TextField
                  autoComplete="address-line2"
                  label="Building, floor, unit"
                  labelHidden
                  placeholder="Building, floor, unit"
                  value={values.street2}
                  onChange={(v) => set("street2", v)}
                />
                <div className="brs-form__triple">
                  <TextField autoComplete="address-level2" label="City" value={values.city} onChange={(v) => set("city", v)} />
                  <TextField autoComplete="postal-code" label="Postal code" value={values.zip} onChange={(v) => set("zip", v)} />
                  <TextField
                    autoComplete="country"
                    label="Country code"
                    placeholder="AE"
                    maxLength={2}
                    value={values.countryCode}
                    onChange={(v) => set("countryCode", v.toUpperCase())}
                    error={show("countryCode")}
                  />
                </div>
              </section>
            </div>

            <aside className="brs-form__side">
              <span className="brs-form__label">New documents will look like</span>
              <ul className="brs-form__samples">
                {[
                  ["Quotation", "Q"],
                  ["Invoice", "INV"],
                  ["Delivery note", "DEL"],
                  ["Purchase order", "PO"],
                ].map(([label, type]) => (
                  <li key={type}>
                    <small>{label}</small>
                    <code>{sampleNumber(prefix, type, numberingFormat)}</code>
                  </li>
                ))}
              </ul>
              {prefix.length >= 2 && errors.prefix ? <p className="brs-form__warn">{errors.prefix}</p> : null}
              {prefixChanged ? (
                <p className="brs-form__warn">
                  Only new documents use the new prefix. Existing numbers like {branch?.documentPrefix}-INV-… stay as
                  they are.
                </p>
              ) : null}
              <p className="brs-form__note">
                {isEdit
                  ? "Stock, sales and accounting records stay with this branch."
                  : "Owners and admins get access straight away. Assign other people under Users & roles."}
              </p>
            </aside>
          </div>
        </Form>
      </Modal.Section>
    </Modal>
  );
}
