"use client";

import {
  Badge,
  Banner,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  FormLayout,
  Icon,
  IndexTable,
  InlineStack,
  Layout,
  Modal,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CheckIcon,
  DeleteIcon,
  DesktopIcon,
  EditIcon,
  EmailIcon,
  MobileIcon,
  PersonIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  createEmailCampaign,
  getAudiencePreview,
  getEmailCampaign,
  getEmailTemplates,
  sendEmailCampaign,
  testSendEmailCampaign,
  updateEmailCampaign,
  type AudiencePreviewResponse,
  type EmailCampaign,
  type EmailTemplate,
} from "@/lib/email-marketing-api";
import {
  buildMarketingEmailBodyHtml,
  parseMarketingEmailBodyHtml,
  renderMarketingEmailHtml,
  SYSTEM_PRESET_TEMPLATES,
  type EmailDesignConfig,
  type FeatureHighlightCard,
  type StructuredEmailContent,
  type TargetAudienceFilter,
} from "@frog1/shared";

interface CampaignFormPageProps {
  campaignId?: string;
}

export function CampaignFormPage({ campaignId }: CampaignFormPageProps) {
  const router = useRouter();
  const isEditing = Boolean(campaignId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Form State: Campaign Info
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [fromName, setFromName] = useState("Frogmen Technologies");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [templateId, setTemplateId] = useState<string>("");

  // Editor mode & content states
  const [editorMode, setEditorMode] = useState<"visual" | "text" | "html">("visual");
  const [bodyHtml, setBodyHtml] = useState(SYSTEM_PRESET_TEMPLATES[0].bodyHtml);
  const [bodyText, setBodyText] = useState("");
  const [structuredContent, setStructuredContent] = useState<StructuredEmailContent>(() =>
    parseMarketingEmailBodyHtml(SYSTEM_PRESET_TEMPLATES[0].bodyHtml),
  );

  // Design config states
  const [primaryColor, setPrimaryColor] = useState("#047857");
  const [brandName, setBrandName] = useState("Frogmen Technologies");
  const [headerStyle, setHeaderStyle] = useState<"banner" | "minimal" | "centered">("banner");
  const [ctaLabel, setCtaLabel] = useState("Discover More");
  const [ctaUrl, setCtaUrl] = useState("https://frogmen.tech");
  const [ctaStyle, setCtaStyle] = useState<"solid" | "outline" | "rounded">("rounded");
  const [footerText, setFooterText] = useState("Empowering subsea engineering and offshore marine technology.");
  const [companyAddress, setCompanyAddress] = useState("Frogmen Technologies Pte Ltd • Singapore");
  const [showLogo, setShowLogo] = useState(true);

  // Form State: Audience Filters
  const [audienceType, setAudienceType] = useState<"all" | "contacts" | "leads" | "segment">("all");
  const [contactAccountTypes, setContactAccountTypes] = useState<string[]>(["company", "individual"]);
  const [contactIsActiveOnly, setContactIsActiveOnly] = useState(true);
  const [leadStages, setLeadStages] = useState<string[]>(["new", "contacted", "qualified", "proposal"]);
  const [leadPriorities, setLeadPriorities] = useState<string[]>(["hot", "warm", "cold"]);
  const [excludeUnsubscribed, setExcludeUnsubscribed] = useState(true);
  const [excludedEmails, setExcludedEmails] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientTypeFilter, setRecipientTypeFilter] = useState<"all" | "contact" | "lead">("all");

  // Audience Preview & Calculation
  const [audienceStats, setAudienceStats] = useState<AudiencePreviewResponse | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [previewAudienceModalOpen, setPreviewAudienceModalOpen] = useState(false);

  // Live Email Preview Mode
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  // Test Send Modal & State
  const [testEmailModalOpen, setTestEmailModalOpen] = useState(false);
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [testSendLoading, setTestSendLoading] = useState(false);
  const [testSendResult, setTestSendResult] = useState<string | null>(null);

  // Send Confirmation Modal
  const [sendConfirmModalOpen, setSendConfirmModalOpen] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  // Load existing campaign data if editing
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [templatesRes, campaignRes] = await Promise.all([
          getEmailTemplates().catch(() => []),
          campaignId ? getEmailCampaign(campaignId) : Promise.resolve(null),
        ]);

        setTemplates(templatesRes);

        if (campaignRes) {
          setName(campaignRes.name);
          setSubject(campaignRes.subject);
          setPreviewText(campaignRes.previewText || "");
          setFromName(campaignRes.fromName || "Frogmen Technologies");
          setFromEmail(campaignRes.fromEmail || "");
          setReplyTo(campaignRes.replyTo || "");
          setTemplateId(campaignRes.templateId || "");
          setBodyHtml(campaignRes.bodyHtml);
          setStructuredContent(parseMarketingEmailBodyHtml(campaignRes.bodyHtml));
          setBodyText(campaignRes.bodyText || "");
          setAudienceType((campaignRes.targetAudienceType as any) || "all");

          const design = campaignRes.designConfig;
          if (design) {
            if (design.primaryColor) setPrimaryColor(design.primaryColor);
            if (design.brandName) setBrandName(design.brandName);
            if (design.headerStyle) setHeaderStyle(design.headerStyle);
            if (design.ctaLabel) setCtaLabel(design.ctaLabel);
            if (design.ctaUrl) setCtaUrl(design.ctaUrl);
            if (design.ctaStyle) setCtaStyle(design.ctaStyle);
            if (design.footerText) setFooterText(design.footerText);
            if (design.companyAddress) setCompanyAddress(design.companyAddress);
            if (design.showLogo !== undefined) setShowLogo(design.showLogo);
          }

          const filter = campaignRes.audienceFilter;
          if (filter) {
            if (filter.contactAccountTypes) setContactAccountTypes(filter.contactAccountTypes);
            if (filter.contactIsActiveOnly !== undefined) setContactIsActiveOnly(filter.contactIsActiveOnly);
            if (filter.leadStages) setLeadStages(filter.leadStages);
            if (filter.leadPriorities) setLeadPriorities(filter.leadPriorities);
            if (filter.excludedEmails) setExcludedEmails(filter.excludedEmails);
            if (filter.excludeUnsubscribed !== undefined) setExcludeUnsubscribed(filter.excludeUnsubscribed);
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [campaignId]);

  // Recalculate audience preview when targeting filters change
  const currentAudienceFilter: TargetAudienceFilter = useMemo(
    () => ({
      audienceType,
      contactAccountTypes: contactAccountTypes.length ? (contactAccountTypes as any) : undefined,
      contactIsActiveOnly,
      leadStages: leadStages.length ? leadStages : undefined,
      leadPriorities: leadPriorities.length ? leadPriorities : undefined,
      excludedEmails: excludedEmails.length ? excludedEmails : undefined,
      excludeUnsubscribed,
    }),
    [audienceType, contactAccountTypes, contactIsActiveOnly, leadStages, leadPriorities, excludedEmails, excludeUnsubscribed],
  );

  const refreshAudience = useCallback(async () => {
    try {
      setAudienceLoading(true);
      const res = await getAudiencePreview({
        audienceType,
        contactAccountTypes: contactAccountTypes.length ? (contactAccountTypes as any) : undefined,
        contactIsActiveOnly,
        leadStages: leadStages.length ? leadStages : undefined,
        leadPriorities: leadPriorities.length ? leadPriorities : undefined,
        excludeUnsubscribed,
        excludedEmails: excludedEmails.length ? excludedEmails : undefined,
      });
      setAudienceStats(res);
    } catch {
      // preview error ignored
    } finally {
      setAudienceLoading(false);
    }
  }, [audienceType, contactAccountTypes, contactIsActiveOnly, leadStages, leadPriorities, excludeUnsubscribed, excludedEmails]);

  useEffect(() => {
    refreshAudience();
  }, [refreshAudience]);

  // Recipient individual selection and search
  const allRecipients = audienceStats?.sampleRecipients || [];

  const filteredRecipients = useMemo(() => {
    return allRecipients.filter((r) => {
      if (recipientTypeFilter !== "all" && r.recipientType !== recipientTypeFilter) {
        return false;
      }
      if (recipientSearch.trim()) {
        const q = recipientSearch.toLowerCase().trim();
        const matchName = (r.name || "").toLowerCase().includes(q);
        const matchEmail = (r.email || "").toLowerCase().includes(q);
        const matchCompany = (r.company || "").toLowerCase().includes(q);
        const matchJob = (r.jobTitle || "").toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchCompany && !matchJob) return false;
      }
      return true;
    });
  }, [allRecipients, recipientTypeFilter, recipientSearch]);

  const selectedCount = useMemo(() => {
    return allRecipients.filter(
      (r) => !excludedEmails.includes(r.email.toLowerCase().trim()),
    ).length;
  }, [allRecipients, excludedEmails]);

  const toggleRecipient = (email: string) => {
    const normalized = email.toLowerCase().trim();
    setExcludedEmails((prev) =>
      prev.includes(normalized) ? prev.filter((e) => e !== normalized) : [...prev, normalized],
    );
  };

  const selectAllFiltered = () => {
    const filteredNormalized = new Set(
      filteredRecipients.map((r) => r.email.toLowerCase().trim()),
    );
    setExcludedEmails((prev) => prev.filter((e) => !filteredNormalized.has(e)));
  };

  const deselectAllFiltered = () => {
    const newExcluded = new Set(excludedEmails);
    for (const r of filteredRecipients) {
      newExcluded.add(r.email.toLowerCase().trim());
    }
    setExcludedEmails(Array.from(newExcluded));
  };

  // Synchronize Structured Content to HTML
  const handleStructuredChange = (updated: Partial<StructuredEmailContent>) => {
    setStructuredContent((prev) => {
      const next = { ...prev, ...updated };
      const generatedHtml = buildMarketingEmailBodyHtml(next);
      setBodyHtml(generatedHtml);
      return next;
    });
  };

  // Add / Update / Remove Feature Cards
  const handleAddFeatureCard = () => {
    const newCards = [
      ...(structuredContent.featureCards || []),
      { badge: "NEW CAPABILITY", title: "Feature Title", description: "Describe the benefit to the recipient..." },
    ];
    handleStructuredChange({ featureCards: newCards });
  };

  const handleUpdateFeatureCard = (index: number, updated: Partial<FeatureHighlightCard>) => {
    const currentCards = [...(structuredContent.featureCards || [])];
    if (currentCards[index]) {
      currentCards[index] = { ...currentCards[index], ...updated };
      handleStructuredChange({ featureCards: currentCards });
    }
  };

  const handleDeleteFeatureCard = (index: number) => {
    const newCards = (structuredContent.featureCards || []).filter((_, i) => i !== index);
    handleStructuredChange({ featureCards: newCards });
  };

  // Switch Editor Modes cleanly
  const handleEditorModeChange = (mode: "visual" | "text" | "html") => {
    if (mode === "visual") {
      setStructuredContent(parseMarketingEmailBodyHtml(bodyHtml));
    }
    setEditorMode(mode);
  };

  // Load preset template
  const applyPresetTemplate = (preset: (typeof SYSTEM_PRESET_TEMPLATES)[0]) => {
    setSubject(preset.subject);
    setPreviewText(preset.previewText);
    setBodyHtml(preset.bodyHtml);
    setStructuredContent(parseMarketingEmailBodyHtml(preset.bodyHtml));
    setPrimaryColor(preset.designConfig.primaryColor || "#047857");
    setHeaderStyle(preset.designConfig.headerStyle || "banner");
    setCtaLabel(preset.designConfig.ctaLabel || "");
    setCtaUrl(preset.designConfig.ctaUrl || "");
    setCtaStyle(preset.designConfig.ctaStyle || "rounded");
    if (preset.designConfig.footerText) setFooterText(preset.designConfig.footerText);
    setSuccessBanner(`Applied template "${preset.name}". You can now customize the text below.`);
  };

  // Insert merge variable tag
  const insertVariableTag = (tag: string) => {
    if (editorMode === "visual") {
      handleStructuredChange({
        introParagraphs: `${structuredContent.introParagraphs || ""} {{${tag}}}`,
      });
    } else {
      setBodyHtml((prev) => `${prev} {{${tag}}}`);
    }
  };

  // Generate live preview HTML
  const currentDesignConfig: EmailDesignConfig = useMemo(
    () => ({
      primaryColor,
      backgroundColor: previewTheme === "dark" ? "#090e17" : "#f4f7f5",
      darkBackgroundColor: "#090e17",
      cardBackgroundColor: previewTheme === "dark" ? "#111827" : "#ffffff",
      darkCardBackgroundColor: "#111827",
      textColor: previewTheme === "dark" ? "#e2e8f0" : "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: previewTheme === "dark" ? "#ffffff" : "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo,
      brandName,
      headerStyle,
      ctaLabel: ctaLabel || undefined,
      ctaUrl: ctaUrl || undefined,
      ctaStyle,
      footerText,
      companyAddress,
      showUnsubscribe: true,
    }),
    [
      primaryColor,
      previewTheme,
      showLogo,
      brandName,
      headerStyle,
      ctaLabel,
      ctaUrl,
      ctaStyle,
      footerText,
      companyAddress,
    ],
  );

  const livePreviewHtml = useMemo(() => {
    const sampleRecipient = {
      name: "Alex Morgan",
      firstName: "Alex",
      company: "Acme Offshore Marine",
      jobTitle: "Operations Director",
      email: "alex.morgan@acmemarine.com",
      unsubscribeUrl: "#",
    };

    const rendered = renderMarketingEmailHtml({
      subject: subject || "Your Campaign Subject Line",
      previewText: previewText || undefined,
      bodyHtml,
      bodyText: bodyText || undefined,
      design: currentDesignConfig,
      mergeData: sampleRecipient,
      forceTheme: previewTheme,
    });

    return rendered.html;
  }, [subject, previewText, bodyHtml, bodyText, currentDesignConfig, previewTheme]);

  // Save / Submit Campaign
  const handleSave = async (andSend = false) => {
    if (!name.trim()) {
      setError("Campaign name is required");
      return;
    }
    if (!subject.trim()) {
      setError("Subject line is required");
      return;
    }
    if (!bodyHtml.trim()) {
      setError("Email body content is required");
      return;
    }

    try {
      if (andSend) {
        setSending(true);
      } else {
        setSaving(true);
      }
      setError(null);

      const payload = {
        name: name.trim(),
        subject: subject.trim(),
        previewText: previewText.trim() || undefined,
        fromName: fromName.trim() || undefined,
        fromEmail: fromEmail.trim() || undefined,
        replyTo: replyTo.trim() || undefined,
        templateId: templateId || undefined,
        bodyHtml: bodyHtml.trim(),
        bodyText: bodyText.trim() || undefined,
        designConfig: currentDesignConfig,
        targetAudienceType: audienceType,
        audienceFilter: currentAudienceFilter,
      };

      let savedCampaign: EmailCampaign;
      if (isEditing && campaignId) {
        savedCampaign = await updateEmailCampaign(campaignId, payload);
      } else {
        savedCampaign = await createEmailCampaign(payload);
      }

      if (andSend) {
        await sendEmailCampaign(savedCampaign.id);
        setSendConfirmModalOpen(false);
        router.push(`/dashboard/marketing/campaigns/${savedCampaign.id}?sent=true`);
      } else {
        setSuccessBanner(`Campaign "${savedCampaign.name}" saved as draft.`);
        if (!isEditing) {
          router.push(`/dashboard/marketing/campaigns/${savedCampaign.id}/edit`);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to save campaign");
    } finally {
      setSaving(false);
      setSending(false);
    }
  };

  // Test Email Send
  const handleTestSend = async () => {
    if (!testRecipientEmail.trim() || !testRecipientEmail.includes("@")) {
      setTestSendResult("Error: Please enter a valid recipient email address.");
      return;
    }

    try {
      setTestSendLoading(true);
      setTestSendResult(null);

      let targetId = campaignId;
      if (!targetId) {
        // Create draft first
        const draft = await createEmailCampaign({
          name: name.trim() || "Test Send Draft",
          subject: subject.trim() || "Test Send Preview",
          previewText: previewText.trim() || undefined,
          fromName: fromName.trim() || undefined,
          fromEmail: fromEmail.trim() || undefined,
          replyTo: replyTo.trim() || undefined,
          bodyHtml: bodyHtml.trim(),
          designConfig: currentDesignConfig,
          targetAudienceType: audienceType,
          audienceFilter: currentAudienceFilter,
        });
        targetId = draft.id;
      }

      const res = await testSendEmailCampaign({
        recipientEmail: testRecipientEmail.trim(),
        subject: subject.trim() || "Test Send Preview",
        previewText: previewText.trim() || undefined,
        bodyHtml: bodyHtml.trim(),
        designConfig: currentDesignConfig,
        sampleData: {
          name: "Test Partner",
          firstName: "Partner",
          company: "Acme Offshore",
        },
      });

      setTestSendResult(
        `Test email dispatched to ${testRecipientEmail} (Mode: ${res.mode}${res.resendId ? `, Resend ID: ${res.resendId}` : ""})`,
      );
    } catch (err: any) {
      setTestSendResult(`Error: ${err.message || "Failed to send test email"}`);
    } finally {
      setTestSendLoading(false);
    }
  };

  const tabs = [
    { id: "info", content: "1. Campaign Details" },
    { id: "content", content: "2. Content & Design" },
    { id: "audience", content: "3. Audience Targeting" },
    { id: "preview", content: "4. Review & Dispatch" },
  ];

  return (
    <AppPage
      title={isEditing ? `Edit Campaign: ${name || "Untitled"}` : "Create Email Campaign"}
      subtitle="Design responsive marketing broadcasts, select contacts/leads, and dispatch via Resend."
      backAction={{
        content: "Campaigns",
        onAction: () => router.push("/dashboard/marketing/campaigns"),
      }}
      primaryAction={{
        content: saving ? "Saving..." : "Save Draft",
        loading: saving,
        onAction: () => handleSave(false),
      }}
      secondaryActions={[
        {
          content: "Send Test Preview",
          icon: EmailIcon,
          onAction: () => setTestEmailModalOpen(true),
        },
        {
          content: "Dispatch Campaign",
          icon: SendIcon,
          onAction: () => setSendConfirmModalOpen(true),
        },
      ]}
    >
      <Layout>
        {successBanner && (
          <Layout.Section>
            <Banner title={successBanner} tone="success" onDismiss={() => setSuccessBanner(null)} />
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
          <Card padding="0">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <div style={{ padding: "24px" }}>
                {/* TAB 1: CAMPAIGN DETAILS */}
                {selectedTab === 0 && (
                  <FormLayout>
                    <TextField
                      label="Campaign Internal Name"
                      value={name}
                      onChange={setName}
                      autoComplete="off"
                      placeholder="e.g. Q4 Subsea ROV Inspection Promotion"
                      helpText="Used internally to organize and track reports."
                    />

                    <TextField
                      label="Email Subject Line"
                      value={subject}
                      onChange={setSubject}
                      autoComplete="off"
                      placeholder="e.g. Introducing our newest capabilities for {{company}}"
                      helpText="Supports merge tags like {{company}}, {{first_name}}, etc."
                    />

                    <TextField
                      label="Preview Text / Preheader (Optional)"
                      value={previewText}
                      onChange={setPreviewText}
                      autoComplete="off"
                      placeholder="e.g. Discover what's new and see how it streamlines your operations."
                      helpText="Snippet displayed next to the subject line in recipient inboxes."
                    />

                    <FormLayout.Group>
                      <TextField
                        label="From Name"
                        value={fromName}
                        onChange={setFromName}
                        autoComplete="off"
                        placeholder="e.g. Frogmen Commercial Team"
                      />
                      <TextField
                        label="From Email"
                        value={fromEmail}
                        onChange={setFromEmail}
                        autoComplete="off"
                        placeholder="e.g. updates@frogmen.app (defaults to system sender)"
                      />
                    </FormLayout.Group>

                    <TextField
                      label="Reply-To Email (Optional)"
                      value={replyTo}
                      onChange={setReplyTo}
                      autoComplete="off"
                      placeholder="e.g. sales@frogmen.app"
                    />

                    <div style={{ marginTop: "16px" }}>
                      <Button variant="primary" onClick={() => setSelectedTab(1)}>
                        Next: Content & Design &rarr;
                      </Button>
                    </div>
                  </FormLayout>
                )}

                {/* TAB 2: CONTENT & TEMPLATE */}
                {selectedTab === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    {/* Preset Templates Carousel */}
                    <div>
                      <Text variant="headingMd" as="h3">
                        Choose a Starting Template
                      </Text>
                      <p style={{ color: "#64748b", fontSize: "13px", marginTop: "2px", marginBottom: "12px" }}>
                        Pick a professional layout. All templates include rich dark mode and responsive styling.
                      </p>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {SYSTEM_PRESET_TEMPLATES.map((preset) => (
                          <div
                            key={preset.id}
                            style={{
                              border: "1px solid #e2e8f0",
                              borderRadius: "10px",
                              padding: "14px",
                              background: "#ffffff",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              cursor: "pointer",
                              transition: "border-color 0.2s, box-shadow 0.2s",
                            }}
                            className="hover:border-emerald-500 hover:shadow-sm"
                            onClick={() => applyPresetTemplate(preset)}
                          >
                            <div>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "6px",
                                }}
                              >
                                <Text variant="bodyMd" fontWeight="bold" as="span">
                                  {preset.name}
                                </Text>
                                <Badge tone="info">{preset.category}</Badge>
                              </div>
                              <p style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.4" }}>
                                {preset.description}
                              </p>
                            </div>
                            <div style={{ marginTop: "12px" }}>
                              <Button size="slim">Use Preset</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Editor Mode Switcher & Merge Tags */}
                    <div style={{ background: "#f8fafc", padding: "16px 20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                        <div>
                          <Text variant="bodySm" fontWeight="bold" as="span">
                            Content Editor Mode:
                          </Text>
                          <div style={{ marginTop: "6px" }}>
                            <ButtonGroup variant="segmented">
                              <Button
                                pressed={editorMode === "visual"}
                                onClick={() => handleEditorModeChange("visual")}
                              >
                                📝 Visual Content Editor
                              </Button>
                              <Button
                                pressed={editorMode === "text"}
                                onClick={() => handleEditorModeChange("text")}
                              >
                                📄 Plain Paragraphs
                              </Button>
                              <Button
                                pressed={editorMode === "html"}
                                onClick={() => handleEditorModeChange("html")}
                              >
                                💻 Raw HTML Code
                              </Button>
                            </ButtonGroup>
                          </div>
                        </div>

                        <div>
                          <Text variant="bodySm" fontWeight="bold" as="span">
                            Insert Merge Tags:
                          </Text>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                            {[
                              { tag: "first_name", label: "First Name" },
                              { tag: "name", label: "Full Name" },
                              { tag: "company", label: "Company" },
                              { tag: "email", label: "Email" },
                              { tag: "job_title", label: "Job Title" },
                            ].map((item) => (
                              <Button key={item.tag} size="micro" onClick={() => insertVariableTag(item.tag)}>
                                {`{{${item.tag}}}`}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* MODE 1: VISUAL CONTENT EDITOR */}
                    {editorMode === "visual" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                        <TextField
                          label="Greeting / Salutation"
                          value={structuredContent.greeting || ""}
                          onChange={(val) => handleStructuredChange({ greeting: val })}
                          autoComplete="off"
                          placeholder="e.g. Hello {{first_name}},"
                          helpText="Opening line of the email."
                        />

                        <TextField
                          label="Main Message Paragraphs"
                          value={structuredContent.introParagraphs || ""}
                          onChange={(val) => handleStructuredChange({ introParagraphs: val })}
                          multiline={5}
                          autoComplete="off"
                          placeholder="Write your email body paragraphs here. Blank lines will create separate paragraphs automatically without needing any HTML."
                        />

                        {/* Feature / Highlight Cards Builder */}
                        <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "18px", background: "#fcfdfd" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                            <div>
                              <Text variant="headingSm" as="h4">
                                Highlight & Feature Cards
                              </Text>
                              <p style={{ fontSize: "12px", color: "#64748b" }}>
                                Highlight sections with badges and titles (looks great in both Light and Dark mode).
                              </p>
                            </div>
                            <Button size="slim" icon={PlusIcon} onClick={handleAddFeatureCard}>
                              Add Highlight Card
                            </Button>
                          </div>

                          {(!structuredContent.featureCards || structuredContent.featureCards.length === 0) ? (
                            <div style={{ padding: "20px", textAlign: "center", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#64748b", fontSize: "13px" }}>
                              No highlight cards added. Click "Add Highlight Card" to insert feature callouts.
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                              {structuredContent.featureCards.map((card, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    border: "1px solid #cbd5e1",
                                    borderRadius: "10px",
                                    padding: "14px",
                                    background: "#ffffff",
                                    position: "relative",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                                    <Text variant="bodySm" fontWeight="bold" as="span">
                                      Card #{idx + 1}
                                    </Text>
                                    <Button
                                      size="micro"
                                      tone="critical"
                                      variant="plain"
                                      icon={DeleteIcon}
                                      onClick={() => handleDeleteFeatureCard(idx)}
                                    >
                                      Remove
                                    </Button>
                                  </div>

                                  <FormLayout.Group>
                                    <TextField
                                      label="Badge Tag (Optional)"
                                      value={card.badge || ""}
                                      onChange={(val) => handleUpdateFeatureCard(idx, { badge: val })}
                                      autoComplete="off"
                                      placeholder="e.g. NEW FEATURE, 15% OFF, INTEGRATION"
                                    />
                                    <TextField
                                      label="Card Title"
                                      value={card.title || ""}
                                      onChange={(val) => handleUpdateFeatureCard(idx, { title: val })}
                                      autoComplete="off"
                                      placeholder="e.g. Real-Time Operational Intelligence"
                                    />
                                  </FormLayout.Group>

                                  <div style={{ marginTop: "10px" }}>
                                    <TextField
                                      label="Card Description"
                                      value={card.description || ""}
                                      onChange={(val) => handleUpdateFeatureCard(idx, { description: val })}
                                      multiline={2}
                                      autoComplete="off"
                                      placeholder="Explain the feature or special offer..."
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <FormLayout.Group>
                          <TextField
                            label="Closing Remarks (Optional)"
                            value={structuredContent.closingParagraphs || ""}
                            onChange={(val) => handleStructuredChange({ closingParagraphs: val })}
                            multiline={2}
                            autoComplete="off"
                            placeholder="e.g. Click below to experience the latest version or reply with questions."
                          />
                          <TextField
                            label="Sign-Off (Optional)"
                            value={structuredContent.signOff || ""}
                            onChange={(val) => handleStructuredChange({ signOff: val })}
                            multiline={2}
                            autoComplete="off"
                            placeholder="e.g. Best regards,\nFrogmen Commercial Team"
                          />
                        </FormLayout.Group>
                      </div>
                    )}

                    {/* MODE 2: PLAIN PARAGRAPHS MODE */}
                    {editorMode === "text" && (
                      <TextField
                        label="Email Plain Paragraphs"
                        value={structuredContent.introParagraphs || ""}
                        onChange={(val) => handleStructuredChange({ introParagraphs: val })}
                        multiline={12}
                        autoComplete="off"
                        helpText="Type normal text. Double line breaks create beautiful HTML paragraphs automatically."
                        placeholder="Write your email here..."
                      />
                    )}

                    {/* MODE 3: RAW HTML CODE */}
                    {editorMode === "html" && (
                      <TextField
                        label="Raw Email HTML Markup"
                        value={bodyHtml}
                        onChange={setBodyHtml}
                        multiline={14}
                        autoComplete="off"
                        helpText="Full access to HTML markup. Use <p>, <h3>, <ul>, <li>, and <div class='feature-card'> for custom elements."
                      />
                    )}

                    {/* Header & CTA Customization */}
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
                      <Text variant="headingSm" as="h4">
                        Header, CTA Button & Footer
                      </Text>

                      <div style={{ marginTop: "12px" }}>
                        <FormLayout>
                          <FormLayout.Group>
                            <Select
                              label="Header Style"
                              options={[
                                { label: "Colored Banner Header", value: "banner" },
                                { label: "Centered Logo & Title", value: "centered" },
                                { label: "Minimal Top Bar", value: "minimal" },
                              ]}
                              value={headerStyle}
                              onChange={(val) => setHeaderStyle(val as any)}
                            />
                            <TextField
                              label="Primary Brand Color"
                              value={primaryColor}
                              onChange={setPrimaryColor}
                              autoComplete="off"
                              placeholder="#047857"
                            />
                          </FormLayout.Group>

                          <FormLayout.Group>
                            <TextField
                              label="CTA Button Label"
                              value={ctaLabel}
                              onChange={setCtaLabel}
                              autoComplete="off"
                              placeholder="e.g. Explore Capabilities"
                            />
                            <TextField
                              label="CTA Button URL"
                              value={ctaUrl}
                              onChange={setCtaUrl}
                              autoComplete="off"
                              placeholder="https://frogmen.app"
                            />
                          </FormLayout.Group>

                          <FormLayout.Group>
                            <TextField
                              label="Footer Note / Disclaimer"
                              value={footerText}
                              onChange={setFooterText}
                              autoComplete="off"
                            />
                            <TextField
                              label="Company Address"
                              value={companyAddress}
                              onChange={setCompanyAddress}
                              autoComplete="off"
                            />
                          </FormLayout.Group>
                        </FormLayout>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                      <Button onClick={() => setSelectedTab(0)}>&larr; Back</Button>
                      <Button variant="primary" onClick={() => setSelectedTab(2)}>
                        Next: Target Audience &rarr;
                      </Button>
                    </div>
                  </div>
                )}

                {/* TAB 3: AUDIENCE TARGETING */}
                {selectedTab === 2 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <Text variant="headingMd" as="h3">
                      Select Target Audience
                    </Text>
                    <p style={{ color: "#64748b", fontSize: "13px" }}>
                      Broadcast to registered Contacts (Customers) and CRM Leads separately or together. Duplicate emails and unsubscribed addresses are filtered out automatically.
                    </p>

                    <div style={{ maxWidth: "340px" }}>
                      <Select
                        label="Audience Type"
                        options={[
                          { label: "All Contacts & Leads", value: "all" },
                          { label: "Contacts Only (Customers)", value: "contacts" },
                          { label: "Leads Only", value: "leads" },
                          { label: "Custom Segment Filters", value: "segment" },
                        ]}
                        value={audienceType}
                        onChange={(val) => setAudienceType(val as any)}
                      />
                    </div>

                    {/* Contacts Filter Section */}
                    {(audienceType === "all" || audienceType === "contacts" || audienceType === "segment") && (
                      <div style={{ background: "#f8fafc", padding: "16px 20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                        <Text variant="bodyMd" fontWeight="bold" as="h4">
                          Contacts Criteria
                        </Text>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", marginTop: "10px" }}>
                          <Checkbox
                            label="Active Contacts Only"
                            checked={contactIsActiveOnly}
                            onChange={setContactIsActiveOnly}
                          />
                          <Checkbox
                            label="Include Companies"
                            checked={contactAccountTypes.includes("company")}
                            onChange={(checked) =>
                              setContactAccountTypes((prev) =>
                                checked ? [...prev, "company"] : prev.filter((t) => t !== "company"),
                              )
                            }
                          />
                          <Checkbox
                            label="Include Individuals"
                            checked={contactAccountTypes.includes("individual")}
                            onChange={(checked) =>
                              setContactAccountTypes((prev) =>
                                checked ? [...prev, "individual"] : prev.filter((t) => t !== "individual"),
                              )
                            }
                          />
                        </div>
                      </div>
                    )}

                    {/* Leads Filter Section */}
                    {(audienceType === "all" || audienceType === "leads" || audienceType === "segment") && (
                      <div style={{ background: "#f8fafc", padding: "16px 20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                        <Text variant="bodyMd" fontWeight="bold" as="h4">
                          Leads Criteria
                        </Text>

                        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          <Text variant="bodySm" as="span">Lead Stages:</Text>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                            {["new", "contacted", "qualified", "proposal", "negotiation"].map((st) => (
                              <Checkbox
                                key={st}
                                label={st.charAt(0).toUpperCase() + st.slice(1)}
                                checked={leadStages.includes(st)}
                                onChange={(checked) =>
                                  setLeadStages((prev) =>
                                    checked ? [...prev, st] : prev.filter((s) => s !== st),
                                  )
                                }
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Audience Summary Box */}
                    <div style={{ background: "#ecfdf5", padding: "16px 20px", borderRadius: "10px", border: "1px solid #a7f3d0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <Text variant="headingSm" as="h4">
                            Audience Calculation
                          </Text>
                          <p style={{ fontSize: "13px", color: "#065f46", marginTop: "2px" }}>
                            {audienceLoading
                              ? "Calculating audience size..."
                              : `${selectedCount} of ${audienceStats?.totalCount || 0} eligible recipients selected (${audienceStats?.contactCount || 0} contacts, ${audienceStats?.leadCount || 0} leads)`}
                          </p>
                        </div>
                        <Button size="slim" onClick={refreshAudience} loading={audienceLoading}>
                          Refresh Calculation
                        </Button>
                      </div>
                    </div>

                    {/* In-Page Interactive Recipient Selector Table */}
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", background: "#f8fafc" }}>
                        <div>
                          <Text variant="headingSm" as="h4">
                            {`Review & Select Recipients (${selectedCount} of ${allRecipients.length} Selected)`}
                          </Text>
                          <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                            Uncheck any specific contact or lead you wish to exclude from this campaign broadcast.
                          </p>
                        </div>

                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <Button size="slim" onClick={selectAllFiltered} disabled={allRecipients.length === 0}>
                            Select All
                          </Button>
                          <Button size="slim" onClick={deselectAllFiltered} disabled={allRecipients.length === 0}>
                            Deselect All
                          </Button>
                          <Button
                            size="slim"
                            icon={ViewIcon}
                            onClick={() => setPreviewAudienceModalOpen(true)}
                            disabled={allRecipients.length === 0}
                          >
                            Expand Full Modal
                          </Button>
                        </div>
                      </div>

                      {/* Search & Filter Bar */}
                      <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", background: "#ffffff" }}>
                        <div style={{ flex: "1", minWidth: "220px" }}>
                          <TextField
                            label="Search recipients"
                            labelHidden
                            prefix={<Icon source={SearchIcon} />}
                            value={recipientSearch}
                            onChange={setRecipientSearch}
                            placeholder="Search by name, email, company or title…"
                            autoComplete="off"
                            clearButton
                            onClearButtonClick={() => setRecipientSearch("")}
                          />
                        </div>

                        <ButtonGroup variant="segmented">
                          <Button
                            size="slim"
                            pressed={recipientTypeFilter === "all"}
                            onClick={() => setRecipientTypeFilter("all")}
                          >
                            {`All (${allRecipients.length})`}
                          </Button>
                          <Button
                            size="slim"
                            pressed={recipientTypeFilter === "contact"}
                            onClick={() => setRecipientTypeFilter("contact")}
                          >
                            {`Contacts (${allRecipients.filter((r) => r.recipientType === "contact").length})`}
                          </Button>
                          <Button
                            size="slim"
                            pressed={recipientTypeFilter === "lead"}
                            onClick={() => setRecipientTypeFilter("lead")}
                          >
                            {`Leads (${allRecipients.filter((r) => r.recipientType === "lead").length})`}
                          </Button>
                        </ButtonGroup>
                      </div>

                      {/* Recipients Table */}
                      <div style={{ maxHeight: "420px", overflowY: "auto" }}>
                        {filteredRecipients.length === 0 ? (
                          <div style={{ padding: "36px 20px", textAlign: "center", color: "#64748b" }}>
                            <p>{allRecipients.length === 0 ? "No matching contacts or leads found for the selected criteria." : "No recipients match your search query."}</p>
                          </div>
                        ) : (
                          <IndexTable
                            resourceName={{ singular: "recipient", plural: "recipients" }}
                            itemCount={filteredRecipients.length}
                            headings={[
                              { title: "Select" },
                              { title: "Name & Title" },
                              { title: "Email Address" },
                              { title: "Company" },
                              { title: "Type" },
                              { title: "Delivery Status" },
                            ]}
                            selectable={false}
                          >
                            {filteredRecipients.map((r, i) => {
                              const isExcluded = excludedEmails.includes(r.email.toLowerCase().trim());
                              const isSelected = !isExcluded;

                              return (
                                <IndexTable.Row id={String(i)} key={r.email} position={i}>
                                  <IndexTable.Cell>
                                    <Checkbox
                                      label=""
                                      labelHidden
                                      checked={isSelected}
                                      onChange={() => toggleRecipient(r.email)}
                                    />
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <div style={{ opacity: isSelected ? 1 : 0.45 }}>
                                      <Text variant="bodyMd" fontWeight="bold" as="span">
                                        {r.name}
                                      </Text>
                                      {r.jobTitle && (
                                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                                          {r.jobTitle}
                                        </div>
                                      )}
                                    </div>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <span style={{ opacity: isSelected ? 1 : 0.45, fontFamily: "monospace", fontSize: "13px" }}>
                                      {r.email}
                                    </span>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <span style={{ opacity: isSelected ? 1 : 0.45 }}>
                                      {r.company || "—"}
                                    </span>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <Badge tone={r.recipientType === "contact" ? "info" : "attention"}>
                                      {r.recipientType === "contact" ? "Contact" : "Lead"}
                                    </Badge>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <Badge tone={isSelected ? "success" : "critical"}>
                                      {isSelected ? "Included" : "Excluded"}
                                    </Badge>
                                  </IndexTable.Cell>
                                </IndexTable.Row>
                              );
                            })}
                          </IndexTable>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                      <Button onClick={() => setSelectedTab(1)}>&larr; Back</Button>
                      <Button variant="primary" onClick={() => setSelectedTab(3)}>
                        Next: Preview & Test &rarr;
                      </Button>
                    </div>
                  </div>
                )}

                {/* TAB 4: LIVE PREVIEW & TEST */}
                {selectedTab === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                      <Text variant="headingMd" as="h3">
                        Email Shell Preview
                      </Text>

                      <div style={{ display: "flex", gap: "10px" }}>
                        {/* Light / Dark Mode Switch */}
                        <ButtonGroup variant="segmented">
                          <Button
                            pressed={previewTheme === "light"}
                            onClick={() => setPreviewTheme("light")}
                          >
                            ☀️ Light Mode
                          </Button>
                          <Button
                            pressed={previewTheme === "dark"}
                            onClick={() => setPreviewTheme("dark")}
                          >
                            🌙 Dark Mode
                          </Button>
                        </ButtonGroup>

                        {/* Desktop / Mobile Switch */}
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
                    </div>

                    {/* Preview Box Container with Dynamic Dark/Light Shell */}
                    <div
                      style={{
                        background: previewTheme === "dark" ? "#090e17" : "#e2e8f0",
                        padding: "28px",
                        borderRadius: "16px",
                        display: "flex",
                        justifyContent: "center",
                        minHeight: "480px",
                        transition: "all 0.25s ease-in-out",
                        border: previewTheme === "dark" ? "1px solid #1e293b" : "1px solid #cbd5e1",
                      }}
                    >
                      <div
                        style={{
                          width: previewDevice === "mobile" ? "375px" : "100%",
                          maxWidth: "680px",
                          transition: "width 0.2s",
                        }}
                      >
                        <iframe
                          title="Live Email Preview"
                          srcDoc={livePreviewHtml}
                          style={{
                            width: "100%",
                            minHeight: "540px",
                            border: "none",
                            borderRadius: "12px",
                            boxShadow: previewTheme === "dark" ? "0 10px 30px rgba(0,0,0,0.6)" : "0 6px 24px rgba(15,23,42,0.12)",
                          }}
                        />
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                      <Button onClick={() => setSelectedTab(2)}>&larr; Back to Audience</Button>

                      <div style={{ display: "flex", gap: "10px" }}>
                        <Button icon={EmailIcon} onClick={() => setTestEmailModalOpen(true)}>
                          Send Test Email
                        </Button>
                        <Button variant="primary" icon={SendIcon} onClick={() => setSendConfirmModalOpen(true)}>
                          Dispatch Campaign Now
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Audience List Preview Modal */}
      <Modal
        size="large"
        open={previewAudienceModalOpen}
        onClose={() => setPreviewAudienceModalOpen(false)}
        title={`Audience Members (${selectedCount} of ${allRecipients.length} Selected)`}
        primaryAction={{
          content: "Done",
          onAction: () => setPreviewAudienceModalOpen(false),
        }}
      >
        <Modal.Section>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ flex: "1", minWidth: "220px" }}>
                <TextField
                  label="Search recipients"
                  labelHidden
                  prefix={<Icon source={SearchIcon} />}
                  value={recipientSearch}
                  onChange={setRecipientSearch}
                  placeholder="Search by name, email, company or title…"
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setRecipientSearch("")}
                />
              </div>

              <ButtonGroup variant="segmented">
                <Button size="slim" onClick={selectAllFiltered} disabled={allRecipients.length === 0}>
                  Select All
                </Button>
                <Button size="slim" onClick={deselectAllFiltered} disabled={allRecipients.length === 0}>
                  Deselect All
                </Button>
              </ButtonGroup>
            </div>

            <div style={{ maxHeight: "480px", overflowY: "auto" }}>
              <IndexTable
                resourceName={{ singular: "recipient", plural: "recipients" }}
                itemCount={filteredRecipients.length}
                headings={[
                  { title: "Select" },
                  { title: "Name & Title" },
                  { title: "Email Address" },
                  { title: "Company" },
                  { title: "Type" },
                  { title: "Delivery Status" },
                ]}
                selectable={false}
              >
                {filteredRecipients.map((r, i) => {
                  const isExcluded = excludedEmails.includes(r.email.toLowerCase().trim());
                  const isSelected = !isExcluded;

                  return (
                    <IndexTable.Row id={String(i)} key={r.email} position={i}>
                      <IndexTable.Cell>
                        <Checkbox
                          label=""
                          labelHidden
                          checked={isSelected}
                          onChange={() => toggleRecipient(r.email)}
                        />
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <div style={{ opacity: isSelected ? 1 : 0.45 }}>
                          <Text variant="bodyMd" fontWeight="bold" as="span">
                            {r.name}
                          </Text>
                          {r.jobTitle && (
                            <div style={{ fontSize: "12px", color: "#64748b" }}>
                              {r.jobTitle}
                            </div>
                          )}
                        </div>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <span style={{ opacity: isSelected ? 1 : 0.45, fontFamily: "monospace", fontSize: "13px" }}>
                          {r.email}
                        </span>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <span style={{ opacity: isSelected ? 1 : 0.45 }}>
                          {r.company || "—"}
                        </span>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={r.recipientType === "contact" ? "info" : "attention"}>
                          {r.recipientType === "contact" ? "Contact" : "Lead"}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={isSelected ? "success" : "critical"}>
                          {isSelected ? "Included" : "Excluded"}
                        </Badge>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </div>
          </div>
        </Modal.Section>
      </Modal>

      {/* Test Email Modal */}
      <Modal
        open={testEmailModalOpen}
        onClose={() => {
          setTestEmailModalOpen(false);
          setTestSendResult(null);
        }}
        title="Send Test Email Preview"
        primaryAction={{
          content: "Send Test Email",
          loading: testSendLoading,
          onAction: handleTestSend,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: testSendLoading,
            onAction: () => {
              setTestEmailModalOpen(false);
              setTestSendResult(null);
            },
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <p>
              Send an instant preview of this email with sample merge data to any inbox before launching the campaign.
            </p>

            <TextField
              label="Recipient Email Address"
              value={testRecipientEmail}
              onChange={setTestRecipientEmail}
              autoComplete="email"
              type="email"
              placeholder="e.g. yourname@domain.com"
            />

            {testSendResult && (
              <Banner
                title={testSendResult.startsWith("Error") ? "Test Send Failed" : "Success"}
                tone={testSendResult.startsWith("Error") ? "critical" : "success"}
              >
                <p>{testSendResult}</p>
              </Banner>
            )}
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Final Send Confirmation Modal */}
      <Modal
        open={sendConfirmModalOpen}
        onClose={() => setSendConfirmModalOpen(false)}
        title="Dispatch Campaign"
        primaryAction={{
          content: "Launch Campaign via Resend",
          loading: sending,
          onAction: () => handleSave(true),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: sending,
            onAction: () => setSendConfirmModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p>
              You are about to dispatch <strong>"{name || subject}"</strong> to{" "}
              <strong>{selectedCount} selected recipients</strong> (out of {audienceStats?.totalCount || 0} calculated).
            </p>
            <Banner tone="info">
              <p>
                Each recipient will receive a personalized email with unique tracking for opens and clicks.
              </p>
            </Banner>
          </div>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
