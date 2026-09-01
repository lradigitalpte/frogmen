"use client";

import {
  Badge,
  Banner,
  Button,
  ButtonGroup,
  Card,
  Filters,
  FormLayout,
  Layout,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  DesktopIcon,
  EmailIcon,
  MobileIcon,
  PlusIcon,
  SendIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  createEmailTemplate,
  getEmailTemplates,
  type EmailTemplate,
} from "@/lib/email-marketing-api";
import {
  renderMarketingEmailHtml,
  SYSTEM_PRESET_TEMPLATES,
  type EmailDesignConfig,
} from "@frog1/shared";

export function TemplatesListPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Preview Modal
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | typeof SYSTEM_PRESET_TEMPLATES[0] | null>(null);
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  // Create Template Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState<any>("custom");
  const [newTemplateSubject, setNewTemplateSubject] = useState("");
  const [newTemplateHtml, setNewTemplateHtml] = useState("<p>Hello {{first_name}},</p><p>Write your message here...</p>");
  const [creating, setCreating] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getEmailTemplates(search);
      setTemplates(res);
    } catch (err: any) {
      setError(err.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateSubject.trim() || !newTemplateHtml.trim()) {
      setError("Please provide template name, subject, and HTML content.");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      await createEmailTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDescription.trim() || undefined,
        category: newTemplateCategory,
        subject: newTemplateSubject.trim(),
        bodyHtml: newTemplateHtml.trim(),
        isSystemPreset: false,
      });
      setSuccessBanner(`Template "${newTemplateName}" created successfully.`);
      setCreateModalOpen(false);
      setNewTemplateName("");
      setNewTemplateDescription("");
      setNewTemplateSubject("");
      fetchTemplates();
    } catch (err: any) {
      setError(err.message || "Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  // Preview render
  const previewHtml = useMemo(() => {
    if (!previewTemplate) return "";

    const design: EmailDesignConfig = {
      primaryColor: (previewTemplate.designConfig as any)?.primaryColor || "#047857",
      backgroundColor: previewTheme === "dark" ? "#0b1311" : "#f4f7f5",
      darkBackgroundColor: "#0b1311",
      cardBackgroundColor: previewTheme === "dark" ? "#13211c" : "#ffffff",
      darkCardBackgroundColor: "#13211c",
      textColor: previewTheme === "dark" ? "#e2e8f0" : "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: previewTheme === "dark" ? "#ffffff" : "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: true,
      brandName: "Frogmen Technologies",
      headerStyle: (previewTemplate.designConfig as any)?.headerStyle || "banner",
      ctaLabel: (previewTemplate.designConfig as any)?.ctaLabel || undefined,
      ctaUrl: (previewTemplate.designConfig as any)?.ctaUrl || undefined,
      ctaStyle: (previewTemplate.designConfig as any)?.ctaStyle || "rounded",
      footerText: (previewTemplate.designConfig as any)?.footerText || undefined,
      companyAddress: "Frogmen Technologies Pte Ltd",
      showUnsubscribe: true,
    };

    const rendered = renderMarketingEmailHtml({
      subject: previewTemplate.subject,
      previewText: previewTemplate.previewText || undefined,
      bodyHtml: previewTemplate.bodyHtml,
      design,
      mergeData: {
        name: "Alex Morgan",
        firstName: "Alex",
        company: "Acme Offshore Marine",
        jobTitle: "Operations Director",
        email: "alex.morgan@acmemarine.com",
        unsubscribeUrl: "#",
      },
      forceTheme: previewTheme,
    });

    return rendered.html;
  }, [previewTemplate, previewTheme]);

  const filteredPresets = SYSTEM_PRESET_TEMPLATES.filter((p) => {
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.subject.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppPage
      title="Email Templates"
      subtitle="Engineered HTML email templates with responsive styling and automatic light/dark mode support."
      backAction={{
        content: "Campaigns",
        onAction: () => router.push("/dashboard/marketing/campaigns"),
      }}
      primaryAction={{
        content: "Create Custom Template",
        icon: PlusIcon,
        onAction: () => setCreateModalOpen(true),
      }}
    >
      <Layout>
        {successBanner && (
          <Layout.Section>
            <Banner
              title={successBanner}
              tone="success"
              onDismiss={() => setSuccessBanner(null)}
            />
          </Layout.Section>
        )}

        {error && (
          <Layout.Section>
            <Banner title="Error" tone="critical" onDismiss={() => setError(null)}>
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
              <div style={{ flex: 1, minWidth: "260px" }}>
                <Filters
                  queryValue={search}
                  filters={[]}
                  onQueryChange={setSearch}
                  onQueryClear={() => setSearch("")}
                  onClearAll={() => {
                    setSearch("");
                    setCategoryFilter("");
                  }}
                />
              </div>

              <div style={{ minWidth: "180px" }}>
                <Select
                  label="Category"
                  labelHidden
                  options={[
                    { label: "All Categories", value: "" },
                    { label: "Announcements", value: "announcement" },
                    { label: "Promotions & Offers", value: "promotion" },
                    { label: "Newsletters", value: "newsletter" },
                    { label: "Onboarding", value: "onboarding" },
                    { label: "Outreach", value: "outreach" },
                  ]}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                />
              </div>
            </div>

            {/* Built-in Presets */}
            <div style={{ marginBottom: "28px" }}>
              <Text variant="headingMd" as="h3">
                System Presets ({filteredPresets.length})
              </Text>
              <p style={{ color: "#64748b", fontSize: "13px", marginTop: "2px", marginBottom: "16px" }}>
                Production-ready email templates tested across major email clients.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPresets.map((preset) => (
                  <div
                    key={preset.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "16px",
                      background: "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <Text variant="headingSm" as="h4">
                          {preset.name}
                        </Text>
                        <Badge tone="info">{preset.category}</Badge>
                      </div>
                      <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.4", marginBottom: "12px" }}>
                        {preset.description}
                      </p>
                      <div style={{ fontSize: "12px", color: "#334155", background: "#f8fafc", padding: "8px 10px", borderRadius: "6px", marginBottom: "12px" }}>
                        <strong>Subject:</strong> {preset.subject}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                      <Button
                        size="slim"
                        icon={ViewIcon}
                        onClick={() => setPreviewTemplate(preset)}
                      >
                        Preview
                      </Button>
                      <Button
                        size="slim"
                        variant="primary"
                        icon={SendIcon}
                        onClick={() =>
                          router.push("/dashboard/marketing/campaigns/new")
                        }
                      >
                        Use in Campaign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Saved Templates */}
            {templates.filter((t) => !t.isSystemPreset).length > 0 && (
              <div>
                <Text variant="headingMd" as="h3">
                  Custom Saved Templates
                </Text>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" style={{ marginTop: "16px" }}>
                  {templates
                    .filter((t) => !t.isSystemPreset)
                    .map((custom) => (
                      <div
                        key={custom.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "16px",
                          background: "#ffffff",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <Text variant="headingSm" as="h4">
                              {custom.name}
                            </Text>
                            <Badge tone="success">{custom.category}</Badge>
                          </div>
                          {custom.description && (
                            <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.4", marginBottom: "12px" }}>
                              {custom.description}
                            </p>
                          )}
                          <div style={{ fontSize: "12px", color: "#334155", background: "#f8fafc", padding: "8px 10px", borderRadius: "6px", marginBottom: "12px" }}>
                            <strong>Subject:</strong> {custom.subject}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "8px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                          <Button
                            size="slim"
                            icon={ViewIcon}
                            onClick={() => setPreviewTemplate(custom)}
                          >
                            Preview
                          </Button>
                          <Button
                            size="slim"
                            variant="primary"
                            icon={SendIcon}
                            onClick={() =>
                              router.push("/dashboard/marketing/campaigns/new")
                            }
                          >
                            Use in Campaign
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Preview Modal */}
      <Modal
        open={Boolean(previewTemplate)}
        onClose={() => setPreviewTemplate(null)}
        title={`Template Preview: ${previewTemplate?.name || ""}`}
        primaryAction={{
          content: "Use in New Campaign",
          onAction: () => {
            setPreviewTemplate(null);
            router.push("/dashboard/marketing/campaigns/new");
          },
        }}
        secondaryActions={[
          {
            content: "Close",
            onAction: () => setPreviewTemplate(null),
          },
        ]}
      >
        <Modal.Section>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <ButtonGroup variant="segmented">
                  <Button
                    pressed={previewTheme === "light"}
                    onClick={() => setPreviewTheme("light")}
                  >
                    Light Mode
                  </Button>
                  <Button
                    pressed={previewTheme === "dark"}
                    onClick={() => setPreviewTheme("dark")}
                  >
                    Dark Mode
                  </Button>
                </ButtonGroup>
              </div>

              <ButtonGroup variant="segmented">
                <Button
                  icon={DesktopIcon}
                  pressed={previewDevice === "desktop"}
                  onClick={() => setPreviewDevice("desktop")}
                />
                <Button
                  icon={MobileIcon}
                  pressed={previewDevice === "mobile"}
                  onClick={() => setPreviewDevice("mobile")}
                />
              </ButtonGroup>
            </div>

            <div
              style={{
                background: previewTheme === "dark" ? "#090e17" : "#e2e8f0",
                padding: "24px",
                borderRadius: "14px",
                display: "flex",
                justifyContent: "center",
                border: previewTheme === "dark" ? "1px solid #1e293b" : "1px solid #cbd5e1",
                transition: "all 0.2s ease-in-out",
              }}
            >
              <div
                style={{
                  width: previewDevice === "mobile" ? "360px" : "100%",
                  maxWidth: "640px",
                }}
              >
                <iframe
                  title="Template Preview"
                  srcDoc={previewHtml}
                  style={{
                    width: "100%",
                    minHeight: "500px",
                    border: "none",
                    borderRadius: "10px",
                    boxShadow: previewTheme === "dark" ? "0 10px 30px rgba(0,0,0,0.6)" : "0 6px 20px rgba(15,23,42,0.12)",
                  }}
                />
              </div>
            </div>
          </div>
        </Modal.Section>
      </Modal>

      {/* Create Custom Template Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Custom Email Template"
        primaryAction={{
          content: "Save Template",
          loading: creating,
          onAction: handleCreateTemplate,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: creating,
            onAction: () => setCreateModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Template Name"
              value={newTemplateName}
              onChange={setNewTemplateName}
              autoComplete="off"
              placeholder="e.g. Monthly Maintenance Reminder"
            />
            <TextField
              label="Description (Optional)"
              value={newTemplateDescription}
              onChange={setNewTemplateDescription}
              autoComplete="off"
            />
            <Select
              label="Category"
              options={[
                { label: "Announcement", value: "announcement" },
                { label: "Promotion / Offer", value: "promotion" },
                { label: "Newsletter", value: "newsletter" },
                { label: "Onboarding", value: "onboarding" },
                { label: "Outreach", value: "outreach" },
                { label: "Custom", value: "custom" },
              ]}
              value={newTemplateCategory}
              onChange={(val) => setNewTemplateCategory(val as any)}
            />
            <TextField
              label="Default Subject Line"
              value={newTemplateSubject}
              onChange={setNewTemplateSubject}
              autoComplete="off"
              placeholder="e.g. Maintenance update for {{company}}"
            />
            <TextField
              label="Email Body HTML"
              value={newTemplateHtml}
              onChange={setNewTemplateHtml}
              multiline={6}
              autoComplete="off"
              helpText="Supports merge variables like {{first_name}}, {{company}}, etc."
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
