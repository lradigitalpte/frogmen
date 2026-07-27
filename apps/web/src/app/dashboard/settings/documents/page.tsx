"use client";

import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  getCompanySettings,
  getDocumentTemplates,
  updateDocumentTemplates,
} from "@/lib/settings-api";
import {
  DEFAULT_DOCUMENT_TEMPLATES,
  type DocumentTemplateSettings,
} from "@frog1/shared";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  InlineGrid,
  InlineStack,
  Modal,
  Spinner,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";

const tabs = [
  { id: "identity", content: "Document setup" },
  { id: "payment", content: "Payment details" },
  { id: "terms", content: "Terms & notes" },
  { id: "email", content: "Email defaults" },
];

const documentStyles = [
  {
    id: "official_blue" as const,
    name: "Official Blue",
    description: "Structured blue tables based on your supplied Tax Invoice.",
  },
  {
    id: "modern_navy" as const,
    name: "Modern Navy",
    description: "Contemporary navy and teal with stronger summary blocks.",
  },
  {
    id: "clean_minimal" as const,
    name: "Clean Minimal",
    description: "Simple monochrome layout for formal, low-ink documents.",
  },
];

export default function DocumentTemplatesSettingsPage() {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyTagline, setCompanyTagline] = useState("");
  const [templates, setTemplates] =
    useState<Required<DocumentTemplateSettings>>(DEFAULT_DOCUMENT_TEMPLATES);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [company, documentTemplates] = await Promise.all([
        getCompanySettings(),
        getDocumentTemplates(),
      ]);
      setCompanyName(company.name);
      setCompanyLogoUrl(company.logoUrl);
      setCompanyTagline(company.companyProfile.tagline);
      setTemplates(documentTemplates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateTemplate<K extends keyof DocumentTemplateSettings>(
    key: K,
    value: Required<DocumentTemplateSettings>[K],
  ) {
    setTemplates((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await updateDocumentTemplates(templates);
      setTemplates(result);
      showSuccess("Invoice and document settings saved.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppPage subtitle="Invoice identity, payment details, terms, and email defaults." title="Invoice & document setup">
        <InlineStack align="center" blockAlign="center" gap="200">
          <Spinner size="small" />
          <Text as="p" tone="subdued">Loading document settings…</Text>
        </InlineStack>
      </AppPage>
    );
  }

  return (
    <AppPage
      subtitle="Configure the information shown on quotations, tax invoices, PDFs, and document emails."
      title="Invoice & document setup"
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <p>{error}</p>
          </Banner>
        ) : null}

        <InlineGrid columns={{ xs: 1, lg: 2 }} gap="500">
          <div className="document-settings-hero">
            <span className="document-settings-hero__eyebrow">Official documents</span>
            <h2>One source for every customer-facing document</h2>
            <p>
              Company identity and logo come from Company setup. Payment details,
              legal terms, and email wording are controlled here.
            </p>
            <div className="document-settings-hero__status">
              <span>Invoice title</span>
              <strong>{templates.invoiceTitle || "Tax Invoice"}</strong>
            </div>
          </div>

          <div className={`official-invoice-preview document-style--${templates.documentStyle}`}>
            <div className="official-invoice-preview__topline" />
            <div className="official-invoice-preview__header">
              <div className="official-invoice-preview__brand">
                {companyLogoUrl ? (
                  <img src={companyLogoUrl} alt={`${companyName} logo`} />
                ) : (
                  <div>{companyName.charAt(0).toUpperCase() || "C"}</div>
                )}
                <span>{companyName || "Your company"}</span>
              </div>
              <div>
                <h3>{templates.invoiceTitle || "Tax Invoice"}</h3>
                <small>INV/2026/0001</small>
              </div>
            </div>
            <div className="official-invoice-preview__meta">
              <span>Invoice date</span><b>26/07/2026</b>
              <span>Amount due</span><b>AED 40,740.00</b>
              <span>Payment due</span><b>{templates.invoiceValidityDays} days</b>
            </div>
            <div className="official-invoice-preview__bars"><i /><i /><i /></div>
            <small>{companyTagline || templates.footerText}</small>
          </div>
        </InlineGrid>

        <Card>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            <div className="document-settings-tab">
              {selectedTab === 0 ? (
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Document identity</Text>
                    <Text as="p" tone="subdued">
                      Titles and display controls used by generated documents.
                    </Text>
                  </BlockStack>
                  <Banner tone="info">
                    <p>
                      The logo, legal company name, address, TRN, phone, email, and
                      website come from <strong>Company setup</strong>.
                    </p>
                  </Banner>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <div>
                        <Text as="h3" variant="headingSm">Default document style</Text>
                        <Text as="p" tone="subdued">Used by invoices, quotations, purchase orders, and receipts.</Text>
                      </div>
                      <Button onClick={() => setPreviewOpen(true)}>Preview full document</Button>
                    </InlineStack>
                    <div className="document-style-picker">
                      {documentStyles.map((style) => {
                        const selected = templates.documentStyle === style.id;
                        return (
                          <button
                            type="button"
                            key={style.id}
                            className={`document-style-card document-style-card--${style.id}${selected ? " is-selected" : ""}`}
                            onClick={() => updateTemplate("documentStyle", style.id)}
                          >
                            <span className="document-style-card__sample">
                              <i /><i /><i />
                            </span>
                            <strong>{style.name}</strong>
                            <small>{style.description}</small>
                            <b>{selected ? "Selected" : "Choose style"}</b>
                          </button>
                        );
                      })}
                    </div>
                  </BlockStack>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        autoComplete="off"
                        label="Quotation title"
                        value={templates.quotationTitle}
                        onChange={(value) => updateTemplate("quotationTitle", value)}
                      />
                      <TextField
                        autoComplete="off"
                        label="Invoice title"
                        value={templates.invoiceTitle}
                        onChange={(value) => updateTemplate("invoiceTitle", value)}
                        helpText='Use “Tax Invoice” for the supplied official layout.'
                      />
                    </FormLayout.Group>
                    <TextField
                      autoComplete="off"
                      label="Default payment due / validity"
                      type="number"
                      suffix="days"
                      value={String(templates.invoiceValidityDays)}
                      onChange={(value) =>
                        updateTemplate("invoiceValidityDays", Number(value) || 0)
                      }
                    />
                    <InlineStack gap="500" wrap>
                      <Checkbox
                        checked={templates.showTaxBreakdown}
                        label="Show VAT breakdown"
                        onChange={(value) => updateTemplate("showTaxBreakdown", value)}
                      />
                      <Checkbox
                        checked={templates.showBillingAddress}
                        label="Show billing address"
                        onChange={(value) => updateTemplate("showBillingAddress", value)}
                      />
                    </InlineStack>
                  </FormLayout>
                </BlockStack>
              ) : null}

              {selectedTab === 1 ? (
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Payment details</Text>
                    <Text as="p" tone="subdued">
                      Bank information printed in the payment panel of documents.
                    </Text>
                  </BlockStack>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField autoComplete="off" label="Account holder / beneficiary" value={templates.bankAccountName} onChange={(value) => updateTemplate("bankAccountName", value)} />
                      <TextField autoComplete="off" label="Bank name" value={templates.bankName} onChange={(value) => updateTemplate("bankName", value)} />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField autoComplete="off" label="Account number" value={templates.bankAccount} onChange={(value) => updateTemplate("bankAccount", value)} />
                      <TextField autoComplete="off" label="IBAN" value={templates.bankIban} onChange={(value) => updateTemplate("bankIban", value)} />
                    </FormLayout.Group>
                    <TextField autoComplete="off" label="SWIFT / BIC code" value={templates.bankSwiftCode} onChange={(value) => updateTemplate("bankSwiftCode", value)} />
                    <TextField autoComplete="off" label="Payment instructions" multiline={3} value={templates.paymentInstructions} onChange={(value) => updateTemplate("paymentInstructions", value)} helpText="Example: Use the invoice number as the payment reference." />
                  </FormLayout>
                </BlockStack>
              ) : null}

              {selectedTab === 2 ? (
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Default terms and notes</Text>
                    <Text as="p" tone="subdued">Reusable wording placed on new customer documents.</Text>
                  </BlockStack>
                  <FormLayout>
                    <TextField autoComplete="off" label="Payment terms" multiline={3} value={templates.defaultPaymentTerms} onChange={(value) => updateTemplate("defaultPaymentTerms", value)} placeholder="e.g. 100% upon order" />
                    <TextField autoComplete="off" label="Delivery terms" multiline={3} value={templates.defaultDeliveryTerms} onChange={(value) => updateTemplate("defaultDeliveryTerms", value)} placeholder="e.g. Delivery within 14 working days" />
                    <TextField autoComplete="off" label="Warranty notes" multiline={3} value={templates.defaultWarrantyNotes} onChange={(value) => updateTemplate("defaultWarrantyNotes", value)} placeholder="e.g. 6 months battery warranty" />
                    <TextField autoComplete="off" label="Terms and conditions" multiline={5} value={templates.termsAndConditions} onChange={(value) => updateTemplate("termsAndConditions", value)} />
                    <TextField autoComplete="off" label="Footer text" value={templates.footerText} onChange={(value) => updateTemplate("footerText", value)} />
                  </FormLayout>
                </BlockStack>
              ) : null}

              {selectedTab === 3 ? (
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Email defaults</Text>
                    <Text as="p" tone="subdued">Default message used when sending a quotation or invoice.</Text>
                  </BlockStack>
                  <Banner tone="info">
                    <p>Available placeholders: {"{{number}}"}, {"{{customerName}}"}, {"{{companyName}}"}, {"{{total}}"}</p>
                  </Banner>
                  <FormLayout>
                    <TextField autoComplete="off" label="Email subject" value={templates.emailSubject} onChange={(value) => updateTemplate("emailSubject", value)} />
                    <TextField autoComplete="off" label="Email intro body" multiline={8} value={templates.emailBodyIntro} onChange={(value) => updateTemplate("emailBodyIntro", value)} />
                  </FormLayout>
                </BlockStack>
              ) : null}
            </div>
          </Tabs>
        </Card>

        <InlineStack align="end">
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Save invoice & document setup
          </Button>
        </InlineStack>

        <Modal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`${documentStyles.find((style) => style.id === templates.documentStyle)?.name ?? "Document"} preview`}
          primaryAction={{ content: "Use this style", onAction: () => setPreviewOpen(false) }}
          secondaryActions={[{ content: "Close", onAction: () => setPreviewOpen(false) }]}
        >
          <Modal.Section>
            <div className={`document-full-preview document-style--${templates.documentStyle}`}>
              <div className="document-full-preview__rule" />
              <header>
                <div className="document-full-preview__brand">
                  {companyLogoUrl ? <img src={companyLogoUrl} alt="" /> : <span>{companyName.charAt(0) || "C"}</span>}
                  <div><strong>{companyName || "Your company"}</strong><small>{companyTagline}</small></div>
                </div>
                <div><h2>{templates.invoiceTitle}</h2><b>INV/2026/0001</b></div>
              </header>
              <section className="document-full-preview__meta">
                <div><span>Tax Inv No.</span><b>INV/2026/0001</b><span>Date</span><b>26/07/2026</b></div>
                <div><span>Amount due</span><b>AED 40,740.00</b><span>Due</span><b>{templates.invoiceValidityDays} days</b></div>
              </section>
              <section className="document-full-preview__addresses">
                <div><strong>Tax Invoice To</strong><p>Dubai Electricity and Water Authority<br />Dubai, United Arab Emirates</p></div>
                <div><strong>Billing Address</strong><p>Dubai Electricity and Water Authority<br />Dubai, United Arab Emirates</p></div>
              </section>
              <table>
                <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
                <tbody>
                  <tr><td>Chasing Cable 400m</td><td>1.00</td><td>AED 4,300.00</td><td>AED 4,300.00</td></tr>
                  <tr><td>ROV Equipment Battery</td><td>2.00</td><td>AED 14,200.00</td><td>AED 28,400.00</td></tr>
                </tbody>
              </table>
              <section className="document-full-preview__bottom">
                <div><strong>Notes</strong><p>{templates.defaultPaymentTerms}<br />{templates.defaultWarrantyNotes || "Warranty terms appear here"}<br />{templates.defaultDeliveryTerms || "Delivery terms appear here"}</p></div>
                <div><p><span>Subtotal</span><b>AED 38,800.00</b></p><p><span>VAT 5%</span><b>AED 1,940.00</b></p><p className="total"><span>Total Amount</span><b>AED 40,740.00</b></p></div>
              </section>
              <section className="document-full-preview__bank">
                <strong>Payment Details</strong>
                <p>{templates.bankAccountName || companyName}<br />{templates.bankName || "Bank name"}<br />{templates.bankIban || "IBAN"}</p>
              </section>
            </div>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </AppPage>
  );
}
