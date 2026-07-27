"use client";

import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  getCompanySettings,
  updateCompanySettings,
  uploadCompanyLogo,
} from "@/lib/settings-api";
import { listWarehouses } from "@/lib/warehouses-api";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Divider,
  DropZone,
  FormLayout,
  InlineGrid,
  InlineStack,
  Select,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  Building2,
  CircleCheck,
  ImageUp,
  Landmark,
  MapPin,
  Phone,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function CompanySettingsPage() {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [baseCurrencyId, setBaseCurrencyId] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [tagline, setTagline] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [taxId, setTaxId] = useState("");
  const [defaultWarehouseId, setDefaultWarehouseId] = useState("");
  const [warehouseOptions, setWarehouseOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const company = await getCompanySettings();
      const warehouses = await listWarehouses({ perPage: 100 });

      setWarehouseOptions(
        warehouses.data.map((warehouse) => ({
          label: `${warehouse.code}   ${warehouse.name}`,
          value: warehouse.id,
        })),
      );

      setName(company.name);
      setBaseCurrencyId(company.baseCurrencyId ?? "");
      setDefaultWarehouseId(company.defaultWarehouseId ?? "");
      setLogoUrl(company.logoUrl);
      setTagline(company.companyProfile.tagline);
      setAddress(company.companyProfile.address);
      setCity(company.companyProfile.city);
      setCountry(company.companyProfile.country);
      setPhone(company.companyProfile.phone);
      setEmail(company.companyProfile.email);
      setWebsite(company.companyProfile.website);
      setTaxId(company.companyProfile.taxId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load company settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!name.trim()) {
      showError("Company name is required.");
      return;
    }

    if (!baseCurrencyId) {
      showError("Set a base currency under Settings → Currencies first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await updateCompanySettings({
        name: name.trim(),
        baseCurrencyId,
        defaultWarehouseId: defaultWarehouseId || null,
        companyProfile: {
          tagline,
          address,
          city,
          country,
          phone,
          email,
          website,
          taxId,
        },
      });
      setLogoUrl(result.logoUrl);
      showSuccess("Company settings saved.");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to save company settings",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;

    setUploadingLogo(true);
    try {
      const result = await uploadCompanyLogo(file);
      setLogoUrl(result.logoUrl);
      showSuccess("Company logo updated.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  const completedProfileFields = [
    name,
    tagline,
    address,
    city,
    country,
    phone,
    email,
    website,
    taxId,
    logoUrl ?? "",
  ].filter((value) => value.trim()).length;
  const profileCompletion = completedProfileFields * 10;
  const companyInitials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "CO";

  if (loading) {
    return (
      <AppPage
        subtitle="Manage the business identity shown across your workspace and documents."
        title="Company profile"
      >
        <div className="company-settings__loading">
          <InlineStack align="center" blockAlign="center" gap="200">
            <Spinner size="small" />
            <Text as="p" tone="subdued">
              Loading company settings…
            </Text>
          </InlineStack>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      subtitle="Manage the business identity shown across your workspace and documents."
      title="Company profile"
      primaryAction={{
        content: "Save changes",
        loading: saving,
        onAction: handleSave,
      }}
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        ) : null}

        <section className="company-settings__hero">
          <div className="company-settings__hero-brand">
            <div className="company-settings__hero-logo">
              {logoUrl ? (
                <img alt={`${name} logo`} src={logoUrl} />
              ) : (
                <span>{companyInitials}</span>
              )}
            </div>
            <div className="company-settings__hero-copy">
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="h2" variant="headingLg">
                  {name || "Your company"}
                </Text>
                <Badge tone="success">Active organization</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                {tagline ||
                  "Add a tagline to give your documents a stronger identity."}
              </Text>
            </div>
          </div>

          <div className="company-settings__completion">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodySm" fontWeight="semibold">
                Profile completeness
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {profileCompletion}%
              </Text>
            </InlineStack>
            <div
              aria-label={`Company profile ${profileCompletion}% complete`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={profileCompletion}
              className="company-settings__progress"
              role="progressbar"
            >
              <span style={{ width: `${profileCompletion}%` }} />
            </div>
            <Text as="p" tone="subdued" variant="bodySm">
              Complete your profile so quotations, invoices, and reports look
              consistent.
            </Text>
          </div>
        </section>

        <InlineGrid
          columns={{ xs: 1, lg: ["twoThirds", "oneThird"] }}
          gap="500"
        >
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="500">
                <div className="company-settings__section-heading">
                  <div className="company-settings__section-icon">
                    <Building2 aria-hidden size={19} />
                  </div>
                  <div>
                    <Text as="h2" variant="headingMd">
                      Business identity
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      The legal and public-facing details used on business
                      documents.
                    </Text>
                  </div>
                </div>

                <FormLayout>
                  <TextField
                    autoComplete="organization"
                    label="Company name"
                    value={name}
                    onChange={setName}
                  />
                  <TextField
                    autoComplete="off"
                    helpText="A short description shown beneath your company name."
                    label="Tagline"
                    placeholder="e.g. Marine engineering, delivered with confidence"
                    value={tagline}
                    onChange={setTagline}
                  />
                  <TextField
                    autoComplete="off"
                    label="Tax / registration ID"
                    placeholder="Company registration or tax number"
                    value={taxId}
                    onChange={setTaxId}
                  />
                </FormLayout>

                <Divider />

                <div className="company-settings__subheading">
                  <MapPin aria-hidden size={17} />
                  <Text as="h3" variant="headingSm">
                    Registered address
                  </Text>
                </div>
                <FormLayout>
                  <TextField
                    autoComplete="street-address"
                    label="Street address"
                    multiline={2}
                    placeholder="Building, street, district"
                    value={address}
                    onChange={setAddress}
                  />
                  <FormLayout.Group>
                    <TextField
                      autoComplete="address-level2"
                      label="City"
                      value={city}
                      onChange={setCity}
                    />
                    <TextField
                      autoComplete="country-name"
                      label="Country"
                      value={country}
                      onChange={setCountry}
                    />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="500">
                <div className="company-settings__section-heading">
                  <div className="company-settings__section-icon">
                    <Phone aria-hidden size={19} />
                  </div>
                  <div>
                    <Text as="h2" variant="headingMd">
                      Contact details
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Customer-facing details printed on quotations and invoices.
                    </Text>
                  </div>
                </div>
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      autoComplete="tel"
                      label="Phone"
                      placeholder="+971 00 000 0000"
                      value={phone}
                      onChange={setPhone}
                    />
                    <TextField
                      autoComplete="email"
                      label="Email"
                      placeholder="accounts@company.com"
                      type="email"
                      value={email}
                      onChange={setEmail}
                    />
                  </FormLayout.Group>
                  <TextField
                    autoComplete="url"
                    label="Website"
                    placeholder="https://www.company.com"
                    type="url"
                    value={website}
                    onChange={setWebsite}
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </BlockStack>

          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <div className="company-settings__section-heading">
                  <div className="company-settings__section-icon">
                    <ImageUp aria-hidden size={19} />
                  </div>
                  <div>
                    <Text as="h2" variant="headingMd">
                      Company logo
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Used on PDFs and customer documents.
                    </Text>
                  </div>
                </div>

                <div className="company-settings__logo-preview">
                  {logoUrl ? (
                    <img
                      alt={`${name} logo`}
                      className="company-settings__logo-image"
                      src={logoUrl}
                    />
                  ) : (
                    <div className="company-settings__logo-fallback">
                      <span>{companyInitials}</span>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Logo preview
                      </Text>
                    </div>
                  )}
                </div>

                <DropZone
                  accept="image/png,image/jpeg,image/webp"
                  allowMultiple={false}
                  disabled={uploadingLogo}
                  type="image"
                  onDrop={(_files, acceptedFiles) => {
                    void handleLogoUpload(acceptedFiles[0]);
                  }}
                >
                  {uploadingLogo ? (
                    <div className="company-settings__uploading">
                      <InlineStack
                        align="center"
                        blockAlign="center"
                        gap="200"
                      >
                        <Spinner size="small" />
                        <Text as="span" tone="subdued">
                          Uploading logo…
                        </Text>
                      </InlineStack>
                    </div>
                  ) : (
                    <DropZone.FileUpload
                      actionHint="PNG, JPG, or WebP · Maximum 5 MB"
                      actionTitle={logoUrl ? "Replace logo" : "Upload logo"}
                    />
                  )}
                </DropZone>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <div className="company-settings__section-heading">
                  <div className="company-settings__section-icon">
                    <Warehouse aria-hidden size={19} />
                  </div>
                  <div>
                    <Text as="h2" variant="headingMd">
                      Fulfillment
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Set the fallback location for bulk-stock sales.
                    </Text>
                  </div>
                </div>
                <Select
                  helpText="Used only when a sales order line has no warehouse selected."
                  label="Default warehouse"
                  onChange={setDefaultWarehouseId}
                  options={[
                    { label: "No default warehouse", value: "" },
                    ...warehouseOptions,
                  ]}
                  value={defaultWarehouseId}
                />
              </BlockStack>
            </Card>

            <div className="company-settings__currency-card">
              <div className="company-settings__currency-icon">
                <Landmark aria-hidden size={19} />
              </div>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingSm">
                    Currency settings
                  </Text>
                  {baseCurrencyId ? (
                    <Badge tone="success">Configured</Badge>
                  ) : (
                    <Badge tone="attention">Action required</Badge>
                  )}
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  Catalog pricing, reporting currency, and exchange rates are
                  managed separately.
                </Text>
                <Link
                  className="company-settings__text-link"
                  href="/dashboard/settings/currencies"
                >
                  Manage currencies →
                </Link>
              </BlockStack>
            </div>
          </BlockStack>
        </InlineGrid>

        <div className="company-settings__save-bar">
          <div className="company-settings__save-message">
            <CircleCheck aria-hidden size={18} />
            <div>
              <Text as="p" fontWeight="semibold">
                Keep your company details current
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Saved changes apply to future quotations, invoices, and reports.
              </Text>
            </div>
          </div>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </BlockStack>
    </AppPage>
  );
}
