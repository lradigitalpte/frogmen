"use client";

import type { ReactNode } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Card,
  Checkbox,
  FormLayout,
  InlineGrid,
  InlineStack,
  Layout,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  countryHasStates,
  getCountryOptions,
  getStateOptions,
  type CustomerFormValues,
} from "@frog1/shared";
import type { Customer } from "@/types/customer";
import { CustomerAvatarUpload } from "./customer-avatar-upload";

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

function AccountTypeOption({
  title,
  badge,
  badgeTone,
  description,
  selected,
  onSelect,
  disabled,
}: {
  title: string;
  badge: string;
  badgeTone: "info" | "success" | undefined;
  description: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`frogmen-account-type-option${selected ? " selected" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
          <Text as="span" variant="headingSm" fontWeight="semibold">
            {title}
          </Text>
          <Badge tone={selected ? badgeTone : undefined}>{badge}</Badge>
        </InlineStack>
        <Text as="p" tone="subdued" variant="bodySm">
          {description}
        </Text>
      </BlockStack>
    </button>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {title}
          </Text>
          {description ? (
            <Text as="p" tone="subdued">
              {description}
            </Text>
          ) : null}
        </BlockStack>
        {children}
      </BlockStack>
    </Card>
  );
}

const countryOptions = [
  { label: "Select country", value: "" },
  ...getCountryOptions(),
];

const paymentTermsOptions = [
  { label: "Net 30 Days (Standard)", value: "net_30" },
  { label: "Net 15 Days", value: "net_15" },
  { label: "Net 60 Days", value: "net_60" },
  { label: "Immediate Payment (COD)", value: "cod" },
];

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
  const stateOptions = [
    { label: "Select state / province", value: "" },
    ...getStateOptions(values.countryCode),
  ];

  function update<K extends keyof CustomerFormValues>(
    key: K,
    value: CustomerFormValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  return (
    <Layout>
      <Layout.Section>
        <BlockStack gap="400">
          {/* Account Entity Type Selector */}
          <FormSection
            description="Choose whether this account is a corporate company or an individual client."
            title="Customer Account Type"
          >
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
              <AccountTypeOption
                badge="B2B Account"
                badgeTone="info"
                description="For commercial enterprises, marine contractors, and offshore engineering firms."
                disabled={disabled}
                selected={values.accountType === "company"}
                title="Corporate Company"
                onSelect={() => update("accountType", "company")}
              />
              <AccountTypeOption
                badge="Individual"
                badgeTone="success"
                description="For master divers, private contractors, and individual buyers."
                disabled={disabled}
                selected={values.accountType === "individual"}
                title="Individual Client"
                onSelect={() => update("accountType", "individual")}
              />
            </InlineGrid>
          </FormSection>

          {/* Primary Contact Details */}
          <FormSection
            description="Primary contact information and communication channels."
            title="Primary Contact Details"
          >
            <FormLayout>
              <TextField
                autoComplete="name"
                disabled={disabled}
                error={errors.name}
                label={values.accountType === "company" ? "Company / Account Name" : "Full Name"}
                placeholder={values.accountType === "company" ? "e.g. Subsea Engineering Ltd" : "e.g. Frank Reynolds"}
                requiredIndicator
                value={values.name}
                onChange={(value) => update("name", value)}
              />

              <FormLayout.Group>
                <TextField
                  autoComplete="email"
                  disabled={disabled}
                  error={errors.email}
                  label="Email Address"
                  placeholder="e.g. billing@company.com"
                  type="email"
                  value={values.email}
                  onChange={(value) => update("email", value)}
                />
                <TextField
                  autoComplete="tel"
                  disabled={disabled}
                  error={errors.phone}
                  label="Office Phone"
                  placeholder="e.g. +1 (555) 234-5678"
                  value={values.phone}
                  onChange={(value) => update("phone", value)}
                />
              </FormLayout.Group>

              <FormLayout.Group>
                <TextField
                  autoComplete="tel"
                  disabled={disabled}
                  error={errors.mobile}
                  label="Mobile Direct"
                  placeholder="e.g. +1 (555) 987-6543"
                  value={values.mobile}
                  onChange={(value) => update("mobile", value)}
                />
                <TextField
                  autoComplete="off"
                  disabled={disabled}
                  error={errors.website}
                  label="Company Website"
                  placeholder="e.g. https://company.com"
                  value={values.website}
                  onChange={(value) => update("website", value)}
                />
              </FormLayout.Group>
            </FormLayout>
          </FormSection>

          {/* Financial & Credit Terms */}
          <FormSection
            description="Configure credit limit, payment terms, and tax identifiers."
            title="Financial & Credit Terms"
          >
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  autoComplete="off"
                  disabled={disabled}
                  error={errors.taxId}
                  label="Tax ID / VAT Registration"
                  placeholder="e.g. TX-99201"
                  value={values.taxId}
                  onChange={(value) => update("taxId", value)}
                />
                <Select
                  disabled={disabled}
                  label="Payment Terms"
                  options={paymentTermsOptions}
                  value="net_30"
                  onChange={() => {}}
                />
              </FormLayout.Group>

              <Checkbox
                checked={values.isLocal}
                disabled={disabled}
                helpText="This classification selects the organization’s local or non-local price rule when document pricing adjustments are enabled."
                label="Local customer pricing"
                onChange={(checked) => update("isLocal", checked)}
              />

              <FormLayout.Group>
                <TextField
                  autoComplete="off"
                  disabled={disabled}
                  error={errors.reference}
                  label="Internal Reference Code"
                  placeholder="e.g. REF-2026-C01"
                  value={values.reference}
                  onChange={(value) => update("reference", value)}
                />
                <TextField
                  autoComplete="off"
                  disabled={disabled}
                  error={errors.jobTitle}
                  label="Primary Contact Job Title"
                  placeholder="e.g. Procurement Director"
                  value={values.jobTitle}
                  onChange={(value) => update("jobTitle", value)}
                />
              </FormLayout.Group>
            </FormLayout>
          </FormSection>

          {/* Billing & Shipping Address */}
          <FormSection
            description="Primary billing and equipment shipping address details."
            title="Address Details"
          >
            <FormLayout>
              <TextField
                autoComplete="street-address"
                disabled={disabled}
                error={errors.street1}
                label="Street Address Line 1"
                placeholder="e.g. 42 Offshore Tech Way"
                value={values.street1}
                onChange={(value) => update("street1", value)}
              />
              <TextField
                autoComplete="address-line2"
                disabled={disabled}
                error={errors.street2}
                label="Suite, Building, Floor (Optional)"
                placeholder="e.g. Suite 800"
                value={values.street2}
                onChange={(value) => update("street2", value)}
              />
              <FormLayout.Group>
                <TextField
                  autoComplete="address-level2"
                  disabled={disabled}
                  error={errors.city}
                  label="City"
                  placeholder="e.g. Houston"
                  value={values.city}
                  onChange={(value) => update("city", value)}
                />
                <TextField
                  autoComplete="postal-code"
                  disabled={disabled}
                  error={errors.zip}
                  label="ZIP / Postal Code"
                  placeholder="e.g. 77002"
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
                  onChange={(value) =>
                    onChange({ ...values, countryCode: value, stateCode: "" })
                  }
                />
                {countryHasStates(values.countryCode) ? (
                  <Select
                    disabled={disabled}
                    error={errors.stateCode}
                    label="State / Province"
                    options={stateOptions}
                    value={values.stateCode}
                    onChange={(value) => update("stateCode", value)}
                  />
                ) : null}
              </FormLayout.Group>
            </FormLayout>
          </FormSection>
        </BlockStack>
      </Layout.Section>

      {/* Sidebar Cards */}
      <Layout.Section variant="oneThird">
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Account Logo / Photo
                </Text>
                <Text as="p" tone="subdued">
                  Add a company logo or contact photo. Shown in customer lists and invoices.
                </Text>
              </BlockStack>
              <CustomerAvatarUpload
                avatarPath={avatarPath}
                customerId={customerId}
                disabled={disabled}
                name={values.name}
                pendingFile={pendingAvatar}
                onAvatarUploaded={onAvatarUploaded}
                onPendingFileChange={onPendingAvatarChange}
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Account Summary
              </Text>
              <InlineGrid columns={2} gap="300">
                <Box>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Type
                  </Text>
                  <Box paddingBlockStart="100">
                    <Badge tone={values.accountType === "company" ? "info" : "success"}>
                      {values.accountType === "company" ? "Company" : "Individual"}
                    </Badge>
                  </Box>
                </Box>
                <Box>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Status
                  </Text>
                  <Box paddingBlockStart="100">
                    <Badge tone="success">Active</Badge>
                  </Box>
                </Box>
              </InlineGrid>
            </BlockStack>
          </Card>
        </BlockStack>
      </Layout.Section>
    </Layout>
  );
}
