"use client";

import type { ReactNode } from "react";
import {
  BlockStack,
  Card,
  Checkbox,
  FormLayout,
  Icon,
  ProgressBar,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  EmailIcon,
  GlobeIcon,
  HashtagIcon,
  IdentityCardIcon,
  LocationIcon,
  MobileIcon,
  OrganizationIcon,
  PersonIcon,
  PhoneIcon,
} from "@shopify/polaris-icons";
import {
  countryHasStates,
  getCountryOptions,
  getStateOptions,
  type CustomerFormValues,
} from "@frog1/shared";
import type { Customer } from "@/types/customer";
import { cn } from "@/lib/utils";
import { CustomerAvatarUpload } from "./customer-avatar-upload";
import { countryName, titleCase } from "./customer-format";

export function customerToFormValues(customer: Customer): CustomerFormValues {
  return {
    accountType: customer.accountType,
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    mobile: customer.mobile ?? "",
    website: customer.website ?? "",
    taxId: customer.taxId ?? "",
    reference: customer.reference ?? "",
    jobTitle: customer.jobTitle ?? "",
    street1: customer.street1 ?? "",
    street2: customer.street2 ?? "",
    city: customer.city ?? "",
    zip: customer.zip ?? "",
    countryCode: customer.countryCode ?? "",
    stateCode: customer.stateCode ?? "",
    memberSince: customer.memberSince ?? customer.createdAt.slice(0, 10),
    isLocal: customer.isLocal ?? false,
  };
}

interface CustomerFormProps {
  values: CustomerFormValues;
  onChange: (values: CustomerFormValues) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  customerId?: string;
  avatarPath?: string | null;
  pendingAvatar?: File | null;
  onPendingAvatarChange?: (file: File | null) => void;
  onAvatarUploaded?: (avatarPath: string) => void;
}

const countryOptions = [{ label: "Select country", value: "" }, ...getCountryOptions()];

function FieldIcon({ source }: { source: typeof EmailIcon }) {
  return <Icon source={source} tone="subdued" />;
}

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="cform-section">
        <div className="cform-section__head">
          <span className="cform-step">{step}</span>
          <div>
            <Text as="h2" variant="headingMd">{title}</Text>
            <Text as="p" tone="subdued" variant="bodySm">{description}</Text>
          </div>
        </div>
        {children}
      </div>
    </Card>
  );
}

function TypeOption({
  icon,
  title,
  description,
  selected,
  disabled,
  onSelect,
}: {
  icon: typeof EmailIcon;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn("cform-type", selected && "is-selected")}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="cform-type__icon">
        <Icon source={icon} />
      </span>
      <span className="cform-type__copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="cform-type__check" aria-hidden>
        {selected ? <Icon source={CheckCircleIcon} /> : null}
      </span>
    </button>
  );
}

export function CustomerForm({
  values,
  onChange,
  errors = {},
  disabled,
  customerId,
  avatarPath,
  pendingAvatar,
  onPendingAvatarChange,
  onAvatarUploaded,
}: CustomerFormProps) {
  const isCompany = values.accountType === "company";
  const stateOptions = [
    { label: "Select state / province", value: "" },
    ...getStateOptions(values.countryCode),
  ];

  function update<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  const checklist = [
    { label: "Name", done: Boolean(values.name.trim()) },
    { label: "Email", done: Boolean(values.email.trim()) },
    { label: "Phone number", done: Boolean(values.phone.trim() || values.mobile.trim()) },
    { label: "Address", done: Boolean(values.street1.trim() && values.city.trim()) },
    { label: "Country", done: Boolean(values.countryCode) },
    { label: "Tax ID", done: Boolean(values.taxId.trim()) },
  ];
  const completeness = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);
  const previewLocation = [values.city.trim() ? titleCase(values.city.trim()) : null, countryName(values.countryCode)]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="cform-layout">
      <div className="cform-main">
        <Section step={1} title="Account type" description="Is this customer a company or a person?">
          <div className="cform-types" role="radiogroup" aria-label="Account type">
            <TypeOption
              icon={OrganizationIcon}
              title="Company"
              description="Contractors, offshore firms and other businesses"
              selected={isCompany}
              disabled={disabled}
              onSelect={() => update("accountType", "company")}
            />
            <TypeOption
              icon={PersonIcon}
              title="Individual"
              description="Master divers, private contractors and buyers"
              selected={!isCompany}
              disabled={disabled}
              onSelect={() => update("accountType", "individual")}
            />
          </div>
        </Section>

        <Section
          step={2}
          title="Contact details"
          description="How you reach this customer. Only the name is required."
        >
          <FormLayout>
            <FormLayout.Group>
              <TextField
                autoComplete={isCompany ? "organization" : "name"}
                disabled={disabled}
                error={errors.name}
                label={isCompany ? "Company name" : "Full name"}
                placeholder={isCompany ? "Subsea Engineering Ltd" : "Frank Reynolds"}
                requiredIndicator
                prefix={<FieldIcon source={isCompany ? OrganizationIcon : PersonIcon} />}
                value={values.name}
                onChange={(value) => update("name", value)}
              />
              <TextField
                autoComplete="organization-title"
                disabled={disabled}
                error={errors.jobTitle}
                label={isCompany ? "Main contact's job title" : "Job title"}
                placeholder="Procurement director"
                value={values.jobTitle}
                onChange={(value) => update("jobTitle", value)}
              />
            </FormLayout.Group>
            <TextField
              autoComplete="email"
              disabled={disabled}
              error={errors.email}
              label="Email"
              placeholder="billing@company.com"
              type="email"
              prefix={<FieldIcon source={EmailIcon} />}
              value={values.email}
              onChange={(value) => update("email", value)}
            />
            <FormLayout.Group>
              <TextField
                autoComplete="tel"
                disabled={disabled}
                error={errors.phone}
                label="Office phone"
                placeholder="+971 4 234 5678"
                type="tel"
                prefix={<FieldIcon source={PhoneIcon} />}
                value={values.phone}
                onChange={(value) => update("phone", value)}
              />
              <TextField
                autoComplete="tel"
                disabled={disabled}
                error={errors.mobile}
                label="Mobile"
                placeholder="+971 50 987 6543"
                type="tel"
                prefix={<FieldIcon source={MobileIcon} />}
                value={values.mobile}
                onChange={(value) => update("mobile", value)}
              />
            </FormLayout.Group>
            <TextField
              autoComplete="url"
              disabled={disabled}
              error={errors.website}
              label="Website"
              placeholder="company.com"
              prefix={<FieldIcon source={GlobeIcon} />}
              value={values.website}
              onChange={(value) => update("website", value)}
            />
          </FormLayout>
        </Section>

        <Section step={3} title="Address" description="Used for billing and shipping equipment.">
          <FormLayout>
            <TextField
              autoComplete="address-line1"
              disabled={disabled}
              error={errors.street1}
              label="Street address"
              placeholder="42 Offshore Tech Way"
              prefix={<FieldIcon source={LocationIcon} />}
              value={values.street1}
              onChange={(value) => update("street1", value)}
            />
            <TextField
              autoComplete="address-line2"
              disabled={disabled}
              error={errors.street2}
              label="Apartment, suite or building"
              placeholder="Suite 800 (optional)"
              value={values.street2}
              onChange={(value) => update("street2", value)}
            />
            <FormLayout.Group condensed>
              <TextField
                autoComplete="address-level2"
                disabled={disabled}
                error={errors.city}
                label="City"
                placeholder="Dubai"
                value={values.city}
                onChange={(value) => update("city", value)}
              />
              <TextField
                autoComplete="postal-code"
                disabled={disabled}
                error={errors.zip}
                label="Postal code"
                placeholder="00000"
                value={values.zip}
                onChange={(value) => update("zip", value)}
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <Select
                disabled={disabled}
                error={errors.countryCode}
                label="Country"
                options={countryOptions}
                value={values.countryCode}
                onChange={(value) => onChange({ ...values, countryCode: value, stateCode: "" })}
              />
              {countryHasStates(values.countryCode) ? (
                <Select
                  disabled={disabled}
                  error={errors.stateCode}
                  label="State / province"
                  options={stateOptions}
                  value={values.stateCode}
                  onChange={(value) => update("stateCode", value)}
                />
              ) : null}
            </FormLayout.Group>
          </FormLayout>
        </Section>

        <Section step={4} title="Billing & tax" description="Shown on quotations and invoices.">
          <FormLayout>
            <FormLayout.Group>
              <TextField
                autoComplete="off"
                disabled={disabled}
                error={errors.taxId}
                label="Tax ID / VAT number"
                placeholder="TX-99201"
                prefix={<FieldIcon source={IdentityCardIcon} />}
                value={values.taxId}
                onChange={(value) => update("taxId", value)}
              />
              <TextField
                autoComplete="off"
                disabled={disabled}
                error={errors.reference}
                label="Internal reference"
                placeholder="REF-2026-C01"
                prefix={<FieldIcon source={HashtagIcon} />}
                value={values.reference}
                onChange={(value) => update("reference", value)}
              />
            </FormLayout.Group>
            <div className="cform-toggle">
              <Checkbox
                checked={values.isLocal}
                disabled={disabled}
                label="Local customer"
                helpText="Uses your local price rule instead of the non-local one when pricing adjustments are turned on."
                onChange={(checked) => update("isLocal", checked)}
              />
            </div>
          </FormLayout>
        </Section>
      </div>

      {/* Live preview */}
      <aside className="cform-side">
        <div className="cform-preview">
          <div className="cform-preview__head">
            <CustomerAvatarUpload
              avatarPath={avatarPath}
              customerId={customerId}
              disabled={disabled}
              name={values.name}
              pendingFile={pendingAvatar}
              onAvatarUploaded={onAvatarUploaded}
              onPendingFileChange={onPendingAvatarChange}
            />
            <div className="cform-preview__identity">
              <strong className={values.name.trim() ? undefined : "is-placeholder"}>
                {values.name.trim() ? titleCase(values.name.trim()) : isCompany ? "Company name" : "Customer name"}
              </strong>
              <small>{values.jobTitle.trim() || (isCompany ? "Company account" : "Individual client")}</small>
              <span className="cdir-type on-dark">{isCompany ? "Company" : "Individual"}</span>
            </div>
          </div>

          <ul className="cform-preview__lines">
            <li>
              <Icon source={EmailIcon} />
              <span className={values.email.trim() ? undefined : "is-placeholder"}>{values.email.trim() || "No email yet"}</span>
            </li>
            <li>
              <Icon source={PhoneIcon} />
              <span className={values.phone.trim() || values.mobile.trim() ? undefined : "is-placeholder"}>
                {values.phone.trim() || values.mobile.trim() || "No phone yet"}
              </span>
            </li>
            <li>
              <Icon source={LocationIcon} />
              <span className={previewLocation ? undefined : "is-placeholder"}>{previewLocation || "No location yet"}</span>
            </li>
          </ul>
        </div>

        <Card>
          <BlockStack gap="300">
            <div className="cform-progress-head">
              <Text as="h2" variant="headingSm">Profile completeness</Text>
              <Text as="span" variant="bodySm" fontWeight="semibold">{completeness}%</Text>
            </div>
            <ProgressBar progress={completeness} size="small" tone={completeness === 100 ? "success" : "primary"} />
            <ul className="cform-checklist">
              {checklist.map((item) => (
                <li key={item.label} className={item.done ? "is-done" : undefined}>
                  <span className="cform-checklist__dot" aria-hidden />
                  {item.label}
                </li>
              ))}
            </ul>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Customer since</Text>
            <TextField
              autoComplete="off"
              disabled={disabled}
              error={errors.memberSince}
              label="Customer since"
              labelHidden
              type="date"
              value={values.memberSince}
              onChange={(value) => update("memberSince", value)}
              helpText="Shown as an anniversary on the calendar each year. Defaults to today."
            />
          </BlockStack>
        </Card>
      </aside>
    </div>
  );
}
