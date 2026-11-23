"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  FormLayout,
  Icon,
  IndexTable,
  InlineStack,
  Modal,
  SkeletonBodyText,
  Text,
  TextField,
  type IconSource,
} from "@shopify/polaris";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ButtonIcon,
  CheckIcon,
  CodeIcon,
  DeleteIcon,
  DesktopIcon,
  EmailIcon,
  MobileIcon,
  PaintBrushFlatIcon,
  PersonIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  StarIcon,
  TextBlockIcon,
  TextIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppPage } from "@/components/layout/page";
import { LEAD_STAGES, stageMeta } from "@/components/leads/lead-ui";
import { cn } from "@/lib/utils";
import {
  createEmailCampaign,
  createEmailTemplate,
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

type AudienceType = "all" | "contacts" | "leads";
type HeaderStyle = "banner" | "minimal" | "centered";
type CtaStyle = "solid" | "outline" | "rounded";
type TextKey = "greeting" | "introParagraphs" | "closingParagraphs" | "signOff";
/** What the inspector on the right is showing. */
type Selection =
  | "audience"
  | "sender"
  | "subject"
  | "design"
  | "greeting"
  | "message"
  | "button"
  | "closing"
  | "signoff"
  | "footer"
  | "html"
  | `card-${number}`;

const TEST_EMAIL_KEY = "frogmen-campaign-test-email";
const DEFAULT_FROM_NAME = "Frogmen Technologies";

const AUDIENCE_OPTIONS: Array<{ value: AudienceType; title: string; text: string }> = [
  { value: "all", title: "Customers & leads", text: "Everyone with an email address" },
  { value: "contacts", title: "Customers only", text: "People and companies you've sold to" },
  { value: "leads", title: "Leads only", text: "Prospects in your pipeline" },
];

const PRIORITIES = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

const MERGE_TAGS = [
  { tag: "first_name", label: "First name" },
  { tag: "name", label: "Full name" },
  { tag: "company", label: "Company" },
  { tag: "job_title", label: "Job title" },
];

const TAG_LABELS: Record<string, string> = Object.fromEntries(MERGE_TAGS.map((t) => [t.tag, t.label]));

const BRAND_COLORS = ["#047857", "#1f3d35", "#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0f172a"];

const CATEGORY_LABELS: Record<string, string> = {
  announcement: "Announcement",
  promotion: "Offer",
  newsletter: "Newsletter",
  onboarding: "Welcome",
  outreach: "Outreach",
  custom: "Letter",
};

const SAMPLE_RECIPIENT = {
  name: "Alex Morgan",
  firstName: "Alex",
  company: "Acme Offshore Marine",
  jobTitle: "Operations Director",
  email: "alex.morgan@acmemarine.com",
  unsubscribeUrl: "#",
};

const BLANK_CONTENT: StructuredEmailContent = {
  greeting: "Hello {{first_name}},",
  introParagraphs: "",
  featureCards: [],
  closingParagraphs: "",
  signOff: "Best regards,\nThe Frogmen team",
};

const SELECTION_TITLES: Record<string, { title: string; icon: IconSource; hint?: string }> = {
  audience: { title: "Audience", icon: PersonIcon, hint: "Who receives this email" },
  sender: { title: "Sender", icon: EmailIcon, hint: "Who it comes from" },
  subject: { title: "Subject & preview", icon: TextIcon, hint: "What people see in their inbox" },
  design: { title: "Header & colours", icon: PaintBrushFlatIcon, hint: "Applies to the whole email" },
  greeting: { title: "Greeting", icon: TextIcon },
  message: { title: "Message", icon: TextBlockIcon, hint: "Leave a blank line between paragraphs" },
  button: { title: "Button", icon: ButtonIcon, hint: "The main thing you want people to do" },
  closing: { title: "Closing line", icon: TextBlockIcon },
  signoff: { title: "Sign-off", icon: TextIcon },
  footer: { title: "Footer", icon: TextBlockIcon, hint: "An unsubscribe link is always added" },
  html: { title: "HTML", icon: CodeIcon, hint: "For advanced edits" },
};

function isPresetId(id: string) {
  return id.startsWith("preset-");
}

function fillTags(text: string) {
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, SAMPLE_RECIPIENT.firstName)
    .replace(/\{\{\s*name\s*\}\}/g, SAMPLE_RECIPIENT.name)
    .replace(/\{\{\s*company\s*\}\}/g, SAMPLE_RECIPIENT.company)
    .replace(/\{\{\s*job_title\s*\}\}/g, SAMPLE_RECIPIENT.jobTitle);
}

/** Show {{tags}} as small pills on the canvas so it's clear they get filled in. */
function Tagged({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*\w+\s*\}\})/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\{\{\s*(\w+)\s*\}\}$/);
        if (match) {
          return (
            <span className="eb-tag" key={index}>
              {TAG_LABELS[match[1]] ?? match[1]}
            </span>
          );
        }
        return (
          <Fragment key={index}>
            {part.split("\n").map((line, i, all) => (
              <Fragment key={i}>
                {line}
                {i < all.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function paragraphs(text: string | undefined) {
  return (text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** A clickable region of the email canvas. */
function Block({
  id,
  label,
  selected,
  empty,
  onSelect,
  children,
  className,
}: {
  id: Selection;
  label: string;
  selected: Selection;
  empty?: string;
  onSelect: (id: Selection) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("eb-block", selected === id && "is-selected", empty && "is-empty", className)}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(id);
        }
      }}
    >
      <span className="eb-block__label">{label}</span>
      {empty ? <span className="eb-block__empty">+ {empty}</span> : children}
    </div>
  );
}

function NavItem({
  icon,
  label,
  detail,
  active,
  done,
  onClick,
}: {
  icon: IconSource;
  label: string;
  detail?: string;
  active: boolean;
  done?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={cn("eb-nav__item", active && "is-active")} type="button" onClick={onClick}>
      <span className="eb-nav__icon">
        <Icon source={icon} />
      </span>
      <span className="eb-nav__text">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {done !== undefined ? (
        <span className={cn("eb-nav__check", done && "is-done")}>{done ? <Icon source={CheckIcon} /> : null}</span>
      ) : null}
    </button>
  );
}

export function CampaignFormPage({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const isEditing = Boolean(campaignId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<EmailCampaign["status"]>("draft");
  const [selected, setSelected] = useState<Selection>("audience");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  // Campaign info
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [fromName, setFromName] = useState(DEFAULT_FROM_NAME);
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [templateId, setTemplateId] = useState<string>(isEditing ? "" : SYSTEM_PRESET_TEMPLATES[0].id);

  // Content
  const [htmlMode, setHtmlMode] = useState(false);
  const [bodyHtml, setBodyHtml] = useState(SYSTEM_PRESET_TEMPLATES[0].bodyHtml);
  const [bodyText, setBodyText] = useState("");
  const [content, setContent] = useState<StructuredEmailContent>(() =>
    parseMarketingEmailBodyHtml(SYSTEM_PRESET_TEMPLATES[0].bodyHtml),
  );

  // Design
  const [primaryColor, setPrimaryColor] = useState("#047857");
  const [brandName, setBrandName] = useState(DEFAULT_FROM_NAME);
  const [headerStyle, setHeaderStyle] = useState<HeaderStyle>("banner");
  const [ctaLabel, setCtaLabel] = useState("Discover More");
  const [ctaUrl, setCtaUrl] = useState("https://frogmen.tech");
  const [ctaStyle, setCtaStyle] = useState<CtaStyle>("rounded");
  const [footerText, setFooterText] = useState("Empowering subsea engineering and offshore marine technology.");
  const [companyAddress, setCompanyAddress] = useState("Frogmen Technologies Pte Ltd • Singapore");
  const [showLogo, setShowLogo] = useState(true);

  // Audience
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [contactAccountTypes, setContactAccountTypes] = useState<string[]>(["company", "individual"]);
  const [contactIsActiveOnly, setContactIsActiveOnly] = useState(true);
  const [leadStages, setLeadStages] = useState<string[]>(["new", "contacted", "qualified", "proposal"]);
  const [leadPriorities, setLeadPriorities] = useState<string[]>(["hot", "warm", "cold"]);
  const [excludeUnsubscribed, setExcludeUnsubscribed] = useState(true);
  const [excludedEmails, setExcludedEmails] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [audienceStats, setAudienceStats] = useState<AudiencePreviewResponse | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // Modals
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplSaving, setTplSaving] = useState(false);
  const [tplResult, setTplResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  // ── Content helpers ─────────────────────────────────────────
  const updateContent = useCallback((updated: Partial<StructuredEmailContent>) => {
    setContent((prev) => {
      const next = { ...prev, ...updated };
      setBodyHtml(buildMarketingEmailBodyHtml(next));
      return next;
    });
  }, []);

  const applyTemplate = useCallback(
    (id: string, list: EmailTemplate[] = templates, keepSubject = true) => {
      if (id === "blank") {
        setTemplateId("");
        setContent(BLANK_CONTENT);
        setBodyHtml(buildMarketingEmailBodyHtml(BLANK_CONTENT));
        setHtmlMode(false);
        setTemplatesOpen(false);
        setSelected("message");
        return;
      }
      const preset = SYSTEM_PRESET_TEMPLATES.find((p) => p.id === id);
      const saved = list.find((t) => t.id === id);
      const source = preset ?? saved;
      if (!source) return;

      setTemplateId(id);
      setSubject((current) => (keepSubject && current.trim() ? current : source.subject));
      if (preset) setPreviewText((current) => (keepSubject && current.trim() ? current : preset.previewText));
      setBodyHtml(source.bodyHtml);
      setContent(parseMarketingEmailBodyHtml(source.bodyHtml));
      setHtmlMode(false);

      const design = source.designConfig;
      if (design) {
        setPrimaryColor(design.primaryColor || "#047857");
        setHeaderStyle(design.headerStyle || "banner");
        setCtaLabel(design.ctaLabel || "");
        setCtaUrl(design.ctaUrl || "");
        setCtaStyle(design.ctaStyle || "rounded");
        if (design.brandName) setBrandName(design.brandName);
        if (design.footerText) setFooterText(design.footerText);
      }
      setTemplatesOpen(false);
      setSelected("message");
    },
    [templates],
  );

  useEffect(() => {
    try {
      setTestEmail(window.localStorage.getItem(TEST_EMAIL_KEY) ?? "");
    } catch {
      // Ignore storage failures.
    }
  }, []);

  // Load templates + the campaign being edited
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [templatesRes, campaign] = await Promise.all([
          getEmailTemplates().catch(() => [] as EmailTemplate[]),
          campaignId ? getEmailCampaign(campaignId) : Promise.resolve(null),
        ]);
        setTemplates(templatesRes);

        if (!campaign) {
          // New campaign: honour ?template= from the list page, otherwise ask.
          const requested = new URLSearchParams(window.location.search).get("template");
          if (requested) applyTemplate(requested, templatesRes, false);
          else setTemplatesOpen(true);
          return;
        }

        setStatus(campaign.status);
        setName(campaign.name);
        setSubject(campaign.subject);
        setPreviewText(campaign.previewText || "");
        setFromName(campaign.fromName || DEFAULT_FROM_NAME);
        setFromEmail(campaign.fromEmail || "");
        setReplyTo(campaign.replyTo || "");
        setTemplateId(campaign.templateId || "");
        setBodyHtml(campaign.bodyHtml);
        setContent(parseMarketingEmailBodyHtml(campaign.bodyHtml));
        setBodyText(campaign.bodyText || "");
        const type = campaign.targetAudienceType;
        setAudienceType(type === "contacts" || type === "leads" ? type : "all");

        const design = campaign.designConfig;
        if (design) {
          if (design.primaryColor) setPrimaryColor(design.primaryColor);
          if (design.brandName) setBrandName(design.brandName);
          if (design.headerStyle) setHeaderStyle(design.headerStyle);
          if (design.ctaLabel !== undefined) setCtaLabel(design.ctaLabel || "");
          if (design.ctaUrl !== undefined) setCtaUrl(design.ctaUrl || "");
          if (design.ctaStyle) setCtaStyle(design.ctaStyle);
          if (design.footerText) setFooterText(design.footerText);
          if (design.companyAddress) setCompanyAddress(design.companyAddress);
          if (design.showLogo !== undefined) setShowLogo(design.showLogo);
        }

        const filter = campaign.audienceFilter;
        if (filter) {
          if (filter.contactAccountTypes) setContactAccountTypes(filter.contactAccountTypes);
          if (filter.contactIsActiveOnly !== undefined) setContactIsActiveOnly(filter.contactIsActiveOnly);
          if (filter.leadStages) setLeadStages(filter.leadStages);
          if (filter.leadPriorities) setLeadPriorities(filter.leadPriorities);
          if (filter.excludedEmails) setExcludedEmails(filter.excludedEmails);
          if (filter.excludeUnsubscribed !== undefined) setExcludeUnsubscribed(filter.excludeUnsubscribed);
        }
        setSelected("message");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
    // applyTemplate is only needed for the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // ── Audience ────────────────────────────────────────────────
  const audienceFilter: TargetAudienceFilter = useMemo(
    () => ({
      audienceType,
      contactAccountTypes: contactAccountTypes.length
        ? (contactAccountTypes as TargetAudienceFilter["contactAccountTypes"])
        : undefined,
      contactIsActiveOnly,
      leadStages: leadStages.length ? leadStages : undefined,
      leadPriorities: leadPriorities.length ? leadPriorities : undefined,
      excludedEmails: excludedEmails.length ? excludedEmails : undefined,
      excludeUnsubscribed,
    }),
    [audienceType, contactAccountTypes, contactIsActiveOnly, leadStages, leadPriorities, excludedEmails, excludeUnsubscribed],
  );

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        setAudienceLoading(true);
        const res = await getAudiencePreview(audienceFilter);
        if (!cancelled) setAudienceStats(res);
      } catch {
        // Keep the last count.
      } finally {
        if (!cancelled) setAudienceLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [audienceFilter]);

  const candidates = audienceStats?.sampleRecipients ?? [];
  const excludedSet = useMemo(() => new Set(excludedEmails), [excludedEmails]);
  const recipientCount =
    audienceStats?.activeCount ??
    candidates.filter((r) => !excludedSet.has(r.email.toLowerCase().trim())).length;
  const removedCount = candidates.filter((r) => excludedSet.has(r.email.toLowerCase().trim())).length;

  const visibleRecipients = useMemo(() => {
    const q = recipientSearch.toLowerCase().trim();
    if (!q) return candidates;
    return candidates.filter((r) =>
      [r.name, r.email, r.company, r.jobTitle].some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [candidates, recipientSearch]);

  function toggleRecipient(email: string) {
    const normalized = email.toLowerCase().trim();
    setExcludedEmails((prev) =>
      prev.includes(normalized) ? prev.filter((e) => e !== normalized) : [...prev, normalized],
    );
  }

  function setVisibleIncluded(include: boolean) {
    const visible = new Set(visibleRecipients.map((r) => r.email.toLowerCase().trim()));
    setExcludedEmails((prev) =>
      include ? prev.filter((e) => !visible.has(e)) : Array.from(new Set([...prev, ...visible])),
    );
  }

  function toggleIn(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  // ── Blocks ──────────────────────────────────────────────────
  const cards = content.featureCards || [];

  function updateCard(index: number, updated: Partial<FeatureHighlightCard>) {
    const next = [...cards];
    if (!next[index]) return;
    next[index] = { ...next[index], ...updated };
    updateContent({ featureCards: next });
  }

  function addCard() {
    updateContent({ featureCards: [...cards, { badge: "", title: "New highlight", description: "" }] });
    setSelected(`card-${cards.length}`);
  }

  function moveCard(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= cards.length) return;
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    updateContent({ featureCards: next });
    setSelected(`card-${target}`);
  }

  function removeCard(index: number) {
    updateContent({ featureCards: cards.filter((_, i) => i !== index) });
    setSelected("message");
  }

  function insertTag(tag: string) {
    const token = `{{${tag}}}`;
    const join = (value: string | undefined) => {
      const current = value || "";
      return `${current}${current && !/\s$/.test(current) ? " " : ""}${token}`;
    };
    const keyFor: Partial<Record<Selection, TextKey>> = {
      greeting: "greeting",
      message: "introParagraphs",
      closing: "closingParagraphs",
      signoff: "signOff",
    };
    if (selected === "subject") {
      setSubject((prev) => join(prev));
      return;
    }
    const key = keyFor[selected];
    if (key) updateContent({ [key]: join(content[key]) });
  }

  // ── Design + preview ────────────────────────────────────────
  const designFor = useCallback(
    (theme: "light" | "dark"): EmailDesignConfig => ({
      primaryColor,
      backgroundColor: theme === "dark" ? "#090e17" : "#f4f7f5",
      darkBackgroundColor: "#090e17",
      cardBackgroundColor: theme === "dark" ? "#111827" : "#ffffff",
      darkCardBackgroundColor: "#111827",
      textColor: theme === "dark" ? "#e2e8f0" : "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: theme === "dark" ? "#ffffff" : "#0f172a",
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
    [primaryColor, showLogo, brandName, headerStyle, ctaLabel, ctaUrl, ctaStyle, footerText, companyAddress],
  );

  const renderedHtml = useMemo(
    () =>
      previewOpen || htmlMode
        ? renderMarketingEmailHtml({
            subject: subject || "Your subject line",
            previewText: previewText || undefined,
            bodyHtml,
            bodyText: bodyText || undefined,
            design: designFor(previewOpen ? previewTheme : "light"),
            mergeData: SAMPLE_RECIPIENT,
            forceTheme: previewOpen ? previewTheme : "light",
          }).html
        : "",
    [previewOpen, htmlMode, previewTheme, subject, previewText, bodyHtml, bodyText, designFor],
  );

  // ── Readiness ───────────────────────────────────────────────
  const hasContent = Boolean(bodyHtml.replace(/<[^>]*>/g, "").trim());
  const ready = recipientCount > 0 && Boolean(fromName.trim()) && Boolean(subject.trim()) && hasContent;
  const editable = status === "draft" || status === "scheduled" || status === "failed";
  const missing = [
    recipientCount > 0 ? null : "an audience",
    subject.trim() ? null : "a subject line",
    hasContent ? null : "some content",
  ].filter(Boolean) as string[];

  // ── Save / test / send ──────────────────────────────────────
  function buildPayload() {
    return {
      name: name.trim() || subject.trim() || "Untitled campaign",
      subject: subject.trim(),
      previewText: previewText.trim() || undefined,
      fromName: fromName.trim() || undefined,
      fromEmail: fromEmail.trim() || undefined,
      replyTo: replyTo.trim() || undefined,
      templateId: templateId && !isPresetId(templateId) ? templateId : undefined,
      bodyHtml: bodyHtml.trim(),
      bodyText: bodyText.trim() || undefined,
      designConfig: designFor("light"),
      targetAudienceType: audienceType,
      audienceFilter,
    };
  }

  async function handleSave(andSend = false) {
    if (!subject.trim()) {
      setError("Add a subject line before saving.");
      setSelected("subject");
      return;
    }
    if (!hasContent) {
      setError("The email has no content yet.");
      setSelected("message");
      return;
    }
    try {
      if (andSend) setSending(true);
      else setSaving(true);
      setError(null);

      const payload = buildPayload();
      const saved =
        isEditing && campaignId ? await updateEmailCampaign(campaignId, payload) : await createEmailCampaign(payload);

      if (andSend) {
        await sendEmailCampaign(saved.id);
        setReviewOpen(false);
        router.push(`/dashboard/marketing/campaigns/${saved.id}?sent=true`);
        return;
      }
      if (!name.trim()) setName(saved.name);
      setNotice("Draft saved.");
      if (!isEditing) router.push(`/dashboard/marketing/campaigns/${saved.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
      setReviewOpen(false);
    } finally {
      setSaving(false);
      setSending(false);
    }
  }

  async function handleSaveTemplate() {
    try {
      setTplSaving(true);
      setTplResult(null);
      const created = await createEmailTemplate({
        name: tplName.trim(),
        category: "custom",
        subject: subject.trim() || "A message for {{company}}",
        previewText: previewText.trim() || undefined,
        bodyHtml: bodyHtml.trim(),
        designConfig: designFor("light"),
        isSystemPreset: false,
      });
      setTemplates((prev) => [created, ...prev]);
      setTplResult({ ok: true, text: `Saved. "${created.name}" is now in your templates.` });
    } catch (err) {
      setTplResult({ ok: false, text: err instanceof Error ? err.message : "Failed to save template" });
    } finally {
      setTplSaving(false);
    }
  }

  async function handleTestSend() {
    const email = testEmail.trim();
    if (!email.includes("@")) {
      setTestResult({ ok: false, text: "Enter a valid email address." });
      return;
    }
    try {
      setTestSending(true);
      setTestResult(null);
      try {
        window.localStorage.setItem(TEST_EMAIL_KEY, email);
      } catch {
        // Ignore storage failures.
      }
      const res = await testSendEmailCampaign({
        recipientEmail: email,
        subject: subject.trim() || "Campaign preview",
        previewText: previewText.trim() || undefined,
        bodyHtml: bodyHtml.trim(),
        designConfig: designFor("light"),
        sampleData: { name: SAMPLE_RECIPIENT.name, firstName: SAMPLE_RECIPIENT.firstName, company: SAMPLE_RECIPIENT.company },
      });
      const delivered = res.mode === "resend" || res.mode === "smtp";
      setTestResult({
        ok: delivered,
        text: delivered
          ? `Test sent to ${email}. Check your inbox in a minute.`
          : res.mode === "log"
            ? "Email sending isn't set up on this server yet, so the test was only written to the server log."
            : "The mail server rejected the test. Check your email settings.",
      });
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof Error ? err.message : "Failed to send test email" });
    } finally {
      setTestSending(false);
    }
  }

  const audienceLabel = AUDIENCE_OPTIONS.find((o) => o.value === audienceType)?.title ?? "Customers & leads";
  const allTemplates = [
    ...SYSTEM_PRESET_TEMPLATES.map((p) => ({
      id: p.id,
      name: p.name,
      tag: CATEGORY_LABELS[p.category] ?? p.category,
      text: p.description,
      color: p.designConfig.primaryColor || "#047857",
      header: p.designConfig.headerStyle || "banner",
    })),
    ...templates.map((t) => ({
      id: t.id,
      name: t.name,
      tag: "Saved",
      text: t.subject,
      color: t.designConfig?.primaryColor || "#047857",
      header: t.designConfig?.headerStyle || "banner",
    })),
  ];
  const templateName = allTemplates.find((t) => t.id === templateId)?.name;

  // ── Inspector ───────────────────────────────────────────────
  const cardIndex = selected.startsWith("card-") ? Number(selected.slice(5)) : -1;
  const inspectorMeta =
    cardIndex >= 0
      ? { title: `Highlight ${cardIndex + 1}`, icon: StarIcon, hint: "Call out a feature, offer or case study" }
      : SELECTION_TITLES[selected];
  const tagTarget = ["subject", "greeting", "message", "closing", "signoff"].includes(selected);

  function renderInspector() {
    if (cardIndex >= 0) {
      const card = cards[cardIndex];
      if (!card) return null;
      return (
        <FormLayout>
          <TextField
            autoComplete="off"
            helpText="Small label above the title, e.g. NEW or 15% OFF."
            label="Label"
            value={card.badge || ""}
            onChange={(value) => updateCard(cardIndex, { badge: value })}
          />
          <TextField autoComplete="off" label="Title" value={card.title || ""} onChange={(value) => updateCard(cardIndex, { title: value })} />
          <TextField
            autoComplete="off"
            label="Text"
            multiline={4}
            value={card.description || ""}
            onChange={(value) => updateCard(cardIndex, { description: value })}
          />
          <InlineStack align="space-between">
            <ButtonGroup>
              <Button disabled={cardIndex === 0} icon={ArrowUpIcon} accessibilityLabel="Move up" onClick={() => moveCard(cardIndex, -1)} />
              <Button
                disabled={cardIndex === cards.length - 1}
                icon={ArrowDownIcon}
                accessibilityLabel="Move down"
                onClick={() => moveCard(cardIndex, 1)}
              />
            </ButtonGroup>
            <Button icon={DeleteIcon} tone="critical" variant="plain" onClick={() => removeCard(cardIndex)}>
              Remove highlight
            </Button>
          </InlineStack>
        </FormLayout>
      );
    }

    switch (selected) {
      case "audience":
        return (
          <BlockStack gap="400">
            <div className="eb-choices" role="radiogroup" aria-label="Audience">
              {AUDIENCE_OPTIONS.map((option) => (
                <button
                  aria-checked={audienceType === option.value}
                  className={cn("eb-choice", audienceType === option.value && "is-active")}
                  key={option.value}
                  role="radio"
                  type="button"
                  onClick={() => setAudienceType(option.value)}
                >
                  <span className="eb-choice__radio" />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.text}</small>
                  </span>
                </button>
              ))}
            </div>

            {audienceType !== "leads" ? (
              <BlockStack gap="200">
                <Text as="h4" variant="headingXs">
                  CUSTOMERS
                </Text>
                <div className="eb-pills">
                  {[
                    { value: "company", label: "Companies" },
                    { value: "individual", label: "Individuals" },
                  ].map((type) => (
                    <Button
                      key={type.value}
                      pressed={contactAccountTypes.includes(type.value)}
                      size="slim"
                      onClick={() => toggleIn(contactAccountTypes, type.value, setContactAccountTypes)}
                    >
                      {type.label}
                    </Button>
                  ))}
                </div>
                <Checkbox checked={contactIsActiveOnly} label="Active customers only" onChange={setContactIsActiveOnly} />
              </BlockStack>
            ) : null}

            {audienceType !== "contacts" ? (
              <BlockStack gap="200">
                <Text as="h4" variant="headingXs">
                  LEADS — STAGE
                </Text>
                <div className="eb-pills">
                  {LEAD_STAGES.map((stage) => (
                    <Button
                      key={stage}
                      pressed={leadStages.includes(stage)}
                      size="slim"
                      onClick={() => toggleIn(leadStages, stage, setLeadStages)}
                    >
                      {stageMeta[stage].label}
                    </Button>
                  ))}
                </div>
                <Text as="h4" variant="headingXs">
                  LEADS — PRIORITY
                </Text>
                <div className="eb-pills">
                  {PRIORITIES.map((priority) => (
                    <Button
                      key={priority.value}
                      pressed={leadPriorities.includes(priority.value)}
                      size="slim"
                      onClick={() => toggleIn(leadPriorities, priority.value, setLeadPriorities)}
                    >
                      {priority.label}
                    </Button>
                  ))}
                </div>
              </BlockStack>
            ) : null}

            <Checkbox
              checked={excludeUnsubscribed}
              helpText="Recommended."
              label="Skip people who unsubscribed"
              onChange={setExcludeUnsubscribed}
            />

            <div className={cn("eb-count", recipientCount === 0 && !audienceLoading && "is-empty")}>
              <strong>{audienceLoading ? "…" : recipientCount}</strong>
              <span>
                {recipientCount === 1 ? "person" : "people"}
                {audienceStats ? ` · ${audienceStats.contactCount} customers, ${audienceStats.leadCount} leads` : ""}
                {removedCount ? ` · ${removedCount} removed` : ""}
              </span>
              <Button disabled={candidates.length === 0} size="slim" onClick={() => setRecipientsOpen(true)}>
                See who
              </Button>
            </div>
          </BlockStack>
        );
      case "sender":
        return (
          <FormLayout>
            <TextField autoComplete="off" helpText="Use a name people recognise." label="Sender name" value={fromName} onChange={setFromName} />
            <TextField
              autoComplete="off"
              helpText="Leave blank to use the system sender."
              label="Sender email"
              placeholder="updates@yourcompany.com"
              type="email"
              value={fromEmail}
              onChange={setFromEmail}
            />
            <TextField
              autoComplete="off"
              helpText="Where replies go."
              label="Reply-to email"
              placeholder="sales@yourcompany.com"
              type="email"
              value={replyTo}
              onChange={setReplyTo}
            />
          </FormLayout>
        );
      case "subject":
        return (
          <FormLayout>
            <TextField
              autoComplete="off"
              autoFocus
              helpText={
                subject.length > 60
                  ? `${subject.length} characters — may get cut off on phones.`
                  : `${subject.length}/60 characters`
              }
              label="Subject line"
              multiline
              placeholder="e.g. New inspection slots for {{company}}"
              value={subject}
              onChange={setSubject}
            />
            <TextField
              autoComplete="off"
              helpText="The grey line shown after the subject."
              label="Preview text"
              multiline
              placeholder="e.g. Book before 30 November and save 15%."
              value={previewText}
              onChange={setPreviewText}
            />
          </FormLayout>
        );
      case "design":
        return (
          <FormLayout>
            <TextField autoComplete="off" label="Brand name" value={brandName} onChange={setBrandName} />
            <BlockStack gap="150">
              <Text as="span" variant="bodyMd">
                Header style
              </Text>
              <ButtonGroup variant="segmented" fullWidth>
                {(["banner", "centered", "minimal"] as HeaderStyle[]).map((style) => (
                  <Button key={style} pressed={headerStyle === style} size="slim" onClick={() => setHeaderStyle(style)}>
                    {style === "banner" ? "Banner" : style === "centered" ? "Centred" : "Minimal"}
                  </Button>
                ))}
              </ButtonGroup>
            </BlockStack>
            <BlockStack gap="150">
              <Text as="span" variant="bodyMd">
                Brand colour
              </Text>
              <div className="eb-swatches">
                {BRAND_COLORS.map((color) => (
                  <button
                    aria-label={`Use colour ${color}`}
                    aria-pressed={primaryColor.toLowerCase() === color}
                    className={cn("eb-swatch", primaryColor.toLowerCase() === color && "is-active")}
                    key={color}
                    style={{ background: color }}
                    type="button"
                    onClick={() => setPrimaryColor(color)}
                  />
                ))}
              </div>
              <TextField
                autoComplete="off"
                label="Custom colour"
                labelHidden
                prefix={<span className="eb-swatch is-mini" style={{ background: primaryColor }} />}
                value={primaryColor}
                onChange={setPrimaryColor}
              />
            </BlockStack>
            <Checkbox checked={showLogo} label="Show logo (when one is set)" onChange={setShowLogo} />
          </FormLayout>
        );
      case "greeting":
        return (
          <TextField
            autoComplete="off"
            autoFocus
            label="Greeting"
            labelHidden
            placeholder="Hello {{first_name}},"
            value={content.greeting || ""}
            onChange={(value) => updateContent({ greeting: value })}
          />
        );
      case "message":
        return (
          <TextField
            autoComplete="off"
            autoFocus
            label="Message"
            labelHidden
            multiline={10}
            placeholder="Write your message…"
            value={content.introParagraphs || ""}
            onChange={(value) => updateContent({ introParagraphs: value })}
          />
        );
      case "closing":
        return (
          <TextField
            autoComplete="off"
            autoFocus
            label="Closing line"
            labelHidden
            multiline={4}
            placeholder="Reply to this email if you have any questions."
            value={content.closingParagraphs || ""}
            onChange={(value) => updateContent({ closingParagraphs: value })}
          />
        );
      case "signoff":
        return (
          <TextField
            autoComplete="off"
            autoFocus
            label="Sign-off"
            labelHidden
            multiline={3}
            placeholder={"Best regards,\nThe Frogmen team"}
            value={content.signOff || ""}
            onChange={(value) => updateContent({ signOff: value })}
          />
        );
      case "button":
        return (
          <FormLayout>
            <TextField
              autoComplete="off"
              autoFocus
              helpText="Leave blank to hide the button."
              label="Button text"
              placeholder="Book an inspection"
              value={ctaLabel}
              onChange={setCtaLabel}
            />
            <TextField autoComplete="off" label="Link" placeholder="https://" type="url" value={ctaUrl} onChange={setCtaUrl} />
            <BlockStack gap="150">
              <Text as="span" variant="bodyMd">
                Shape
              </Text>
              <ButtonGroup variant="segmented" fullWidth>
                {(["rounded", "solid", "outline"] as CtaStyle[]).map((style) => (
                  <Button key={style} pressed={ctaStyle === style} size="slim" onClick={() => setCtaStyle(style)}>
                    {style === "rounded" ? "Rounded" : style === "solid" ? "Square" : "Outline"}
                  </Button>
                ))}
              </ButtonGroup>
            </BlockStack>
          </FormLayout>
        );
      case "footer":
        return (
          <FormLayout>
            <TextField autoComplete="off" label="Footer note" multiline={2} value={footerText} onChange={setFooterText} />
            <TextField autoComplete="off" label="Company address" value={companyAddress} onChange={setCompanyAddress} />
          </FormLayout>
        );
      case "html":
        return (
          <BlockStack gap="300">
            <TextField autoComplete="off" label="HTML" labelHidden monospaced multiline={18} value={bodyHtml} onChange={setBodyHtml} />
            <Button
              onClick={() => {
                setContent(parseMarketingEmailBodyHtml(bodyHtml));
                setHtmlMode(false);
                setSelected("message");
              }}
            >
              Back to the visual editor
            </Button>
          </BlockStack>
        );
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <AppPage backAction={{ content: "Campaigns", url: "/dashboard/marketing/campaigns" }} title="Campaign">
        <Card>
          <SkeletonBodyText lines={12} />
        </Card>
      </AppPage>
    );
  }

  const greeting = content.greeting?.trim();
  const intro = paragraphs(content.introParagraphs);
  const closing = paragraphs(content.closingParagraphs);
  const signOff = content.signOff?.trim();

  return (
    <AppPage
      backAction={{ content: "Campaigns", url: "/dashboard/marketing/campaigns" }}
      primaryAction={{
        content: "Review & send",
        icon: SendIcon,
        disabled: !ready || !editable,
        helpText: missing.length ? `Add ${missing.join(", ")} first` : undefined,
        onAction: () => setReviewOpen(true),
      }}
      secondaryActions={[
        { content: "Send test", icon: EmailIcon, onAction: () => setTestOpen(true) },
        { content: saving ? "Saving…" : "Save draft", disabled: saving || !editable, onAction: () => void handleSave(false) },
        {
          content: "Save as template",
          disabled: !hasContent,
          onAction: () => {
            setTplName(name.trim() || subject.trim() || "");
            setTplResult(null);
            setTplOpen(true);
          },
        },
      ]}
      title={name.trim() || (isEditing ? "Untitled campaign" : "New campaign")}
      titleMetadata={<Badge tone={status === "draft" ? undefined : "info"}>{status === "draft" ? "Draft" : status}</Badge>}
    >
      <div className="eb-banners">
        {notice ? (
          <Banner tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}
        {!editable ? <Banner tone="info">This campaign has already been sent, so it can no longer be changed.</Banner> : null}
      </div>

      <div className="eb">
        {/* ── Left: setup + outline ── */}
        <nav className="eb-nav" aria-label="Campaign outline">
          <div className="eb-nav__name">
            <TextField
              autoComplete="off"
              label="Campaign name"
              placeholder={subject.trim() || "e.g. November inspection offer"}
              value={name}
              onChange={setName}
            />
          </div>

          <span className="eb-nav__group">Setup</span>
          <NavItem
            active={selected === "audience"}
            detail={audienceLoading && !audienceStats ? "Counting…" : `${recipientCount} · ${audienceLabel}`}
            done={recipientCount > 0}
            icon={PersonIcon}
            label="Audience"
            onClick={() => setSelected("audience")}
          />
          <NavItem
            active={selected === "sender"}
            detail={fromName || "No sender"}
            done={Boolean(fromName.trim())}
            icon={EmailIcon}
            label="Sender"
            onClick={() => setSelected("sender")}
          />
          <NavItem
            active={selected === "subject"}
            detail={subject || "Not written yet"}
            done={Boolean(subject.trim())}
            icon={TextIcon}
            label="Subject"
            onClick={() => setSelected("subject")}
          />

          <span className="eb-nav__group">
            Email
            <Button size="micro" variant="plain" onClick={() => setTemplatesOpen(true)}>
              Templates
            </Button>
          </span>
          {htmlMode ? (
            <NavItem active={selected === "html"} detail="Custom HTML" icon={CodeIcon} label="HTML" onClick={() => setSelected("html")} />
          ) : (
            <>
              <NavItem active={selected === "design"} icon={PaintBrushFlatIcon} label="Header & colours" onClick={() => setSelected("design")} />
              <NavItem active={selected === "greeting"} icon={TextIcon} label="Greeting" onClick={() => setSelected("greeting")} />
              <NavItem active={selected === "message"} icon={TextBlockIcon} label="Message" onClick={() => setSelected("message")} />
              {cards.map((card, index) => (
                <NavItem
                  active={selected === `card-${index}`}
                  detail={card.title || card.badge || undefined}
                  icon={StarIcon}
                  key={index}
                  label={`Highlight ${index + 1}`}
                  onClick={() => setSelected(`card-${index}`)}
                />
              ))}
              <button className="eb-nav__add" type="button" onClick={addCard}>
                <Icon source={PlusIcon} />
                Add highlight
              </button>
              <NavItem active={selected === "closing"} icon={TextBlockIcon} label="Closing line" onClick={() => setSelected("closing")} />
              <NavItem active={selected === "signoff"} icon={TextIcon} label="Sign-off" onClick={() => setSelected("signoff")} />
              <NavItem active={selected === "button"} detail={ctaLabel || "Hidden"} icon={ButtonIcon} label="Button" onClick={() => setSelected("button")} />
              <NavItem active={selected === "footer"} icon={TextBlockIcon} label="Footer" onClick={() => setSelected("footer")} />
              <button
                className="eb-nav__add is-quiet"
                type="button"
                onClick={() => {
                  setHtmlMode(true);
                  setSelected("html");
                }}
              >
                <Icon source={CodeIcon} />
                Edit as HTML
              </button>
            </>
          )}
        </nav>

        {/* ── Middle: the email ── */}
        <div className="eb-canvas">
          <div className="eb-canvas__bar">
            <span className="eb-canvas__hint">
              {templateName ? `Template: ${templateName}` : "Click any part of the email to edit it"}
            </span>
            <InlineStack gap="200">
              <ButtonGroup variant="segmented">
                <Button
                  accessibilityLabel="Desktop width"
                  icon={DesktopIcon}
                  pressed={device === "desktop"}
                  size="slim"
                  onClick={() => setDevice("desktop")}
                />
                <Button
                  accessibilityLabel="Phone width"
                  icon={MobileIcon}
                  pressed={device === "mobile"}
                  size="slim"
                  onClick={() => setDevice("mobile")}
                />
              </ButtonGroup>
              <Button icon={ViewIcon} size="slim" onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
            </InlineStack>
          </div>

          <div className="eb-stage" onClick={() => setSelected("design")}>
            {/* Inbox row */}
            <div
              className={cn("eb-inbox", device === "mobile" && "is-mobile", selected === "subject" && "is-selected")}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                setSelected("subject");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") setSelected("subject");
              }}
            >
              <span className="eb-inbox__avatar" style={{ background: primaryColor }}>
                {(fromName || "F").charAt(0).toUpperCase()}
              </span>
              <span className="eb-inbox__text">
                <strong>{fromName || DEFAULT_FROM_NAME}</strong>
                <span>{subject ? fillTags(subject) : "Click to add a subject line"}</span>
                <small>{previewText ? fillTags(previewText) : "Add preview text…"}</small>
              </span>
              <span className="eb-inbox__time">now</span>
            </div>

            {!htmlMode ? (
              <div
                className={cn("eb-wordmark", device === "mobile" && "is-mobile")}
                style={{ ["--mail-color" as string]: primaryColor }}
              >
                <span>
                  <i />
                  {brandName || "Your brand"}
                </span>
                {headerStyle !== "minimal" ? <small>Today</small> : null}
              </div>
            ) : null}

            <div
              className={cn("eb-mail", device === "mobile" && "is-mobile")}
              style={{ ["--mail-color" as string]: primaryColor }}
            >
              {htmlMode ? (
                <iframe className="eb-mail__frame" sandbox="allow-same-origin" srcDoc={renderedHtml} title="Email" />
              ) : (
                <>
                  <Block
                    className={cn("eb-head", `is-${headerStyle}`)}
                    id="design"
                    label="Header"
                    selected={selected}
                    onSelect={setSelected}
                  >
                    {headerStyle === "minimal" ? (
                      <span className="eb-head__date">Today&apos;s date</span>
                    ) : (
                      <>
                        <span className="eb-head__title">{subject ? fillTags(subject) : "Your subject line"}</span>
                        {previewText ? <span className="eb-head__dek">{fillTags(previewText)}</span> : null}
                        {headerStyle === "centered" ? <span className="eb-head__rule" /> : null}
                      </>
                    )}
                  </Block>

                  <div className="eb-body">
                    <Block
                      empty={greeting ? undefined : "Add a greeting"}
                      id="greeting"
                      label="Greeting"
                      selected={selected}
                      onSelect={setSelected}
                    >
                      <p>
                        <Tagged text={greeting || ""} />
                      </p>
                    </Block>

                    <Block
                      empty={intro.length ? undefined : "Write your message"}
                      id="message"
                      label="Message"
                      selected={selected}
                      onSelect={setSelected}
                    >
                      {intro.map((p, i) => (
                        <p key={i}>
                          <Tagged text={p} />
                        </p>
                      ))}
                    </Block>

                    {cards.map((card, index) => (
                      <Block
                        className="eb-card"
                        id={`card-${index}`}
                        key={index}
                        label={`Highlight ${index + 1}`}
                        selected={selected}
                        onSelect={setSelected}
                      >
                        {card.badge ? <span className="eb-card__badge">{card.badge}</span> : null}
                        {card.title ? <h3>{card.title}</h3> : null}
                        {card.description ? (
                          <p>
                            <Tagged text={card.description} />
                          </p>
                        ) : null}
                        {!card.title && !card.description ? <p className="eb-muted">Empty highlight</p> : null}
                      </Block>
                    ))}


                    <Block
                      empty={closing.length ? undefined : "Add a closing line"}
                      id="closing"
                      label="Closing line"
                      selected={selected}
                      onSelect={setSelected}
                    >
                      {closing.map((p, i) => (
                        <p key={i}>
                          <Tagged text={p} />
                        </p>
                      ))}
                    </Block>

                    <Block
                      empty={signOff ? undefined : "Add a sign-off"}
                      id="signoff"
                      label="Sign-off"
                      selected={selected}
                      onSelect={setSelected}
                    >
                      <p>
                        <Tagged text={signOff || ""} />
                      </p>
                    </Block>

                    <Block
                      className="eb-cta-block"
                      empty={ctaLabel ? undefined : "Add a button"}
                      id="button"
                      label="Button"
                      selected={selected}
                      onSelect={setSelected}
                    >
                      <span className={cn("eb-cta", `is-${ctaStyle}`)}>{ctaLabel}</span>
                    </Block>
                  </div>
                </>
              )}
            </div>

            {!htmlMode ? (
              <Block
                className={cn("eb-foot", device === "mobile" && "is-mobile")}
                id="footer"
                label="Footer"
                selected={selected}
                onSelect={setSelected}
              >
                <p>{fillTags(footerText)}</p>
                <p>{companyAddress}</p>
                <p>
                  <u>Unsubscribe</u> · <u>Email preferences</u>
                </p>
              </Block>
            ) : null}
          </div>
        </div>

        {/* ── Right: inspector ── */}
        <aside className="eb-inspector">
          {inspectorMeta ? (
            <div className="eb-inspector__head">
              <span className="eb-inspector__icon">
                <Icon source={inspectorMeta.icon} />
              </span>
              <div>
                <h2>{inspectorMeta.title}</h2>
                {inspectorMeta.hint ? <small>{inspectorMeta.hint}</small> : null}
              </div>
            </div>
          ) : null}
          <div className="eb-inspector__body">{renderInspector()}</div>
          {tagTarget ? (
            <div className="eb-inspector__tags">
              <span>Personalise with</span>
              <div>
                {MERGE_TAGS.map((item) => (
                  <Button key={item.tag} size="micro" onClick={() => insertTag(item.tag)}>
                    {`+ ${item.label}`}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="eb-inspector__foot">
            {ready ? (
              <span className="eb-ready is-ok">
                <Icon source={CheckIcon} />
                Ready to send to {recipientCount} {recipientCount === 1 ? "person" : "people"}
              </span>
            ) : (
              <span className="eb-ready">Still needed: {missing.join(", ") || "a sender name"}</span>
            )}
          </div>
        </aside>
      </div>

      {/* Template picker */}
      <Modal
        open={templatesOpen}
        secondaryActions={[{ content: isEditing || templateId ? "Keep current design" : "Close", onAction: () => setTemplatesOpen(false) }]}
        size="large"
        title="Choose a starting point"
        onClose={() => setTemplatesOpen(false)}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              Everything stays editable. Picking a template replaces the email&apos;s content and design, but keeps your
              audience and any subject line you&apos;ve written.
            </Text>
            <div className="eb-gallery">
              <button className="eb-gallery__item is-blank" type="button" onClick={() => applyTemplate("blank")}>
                <span className="eb-gallery__thumb">
                  <Icon source={PlusIcon} />
                </span>
                <strong>Blank email</strong>
                <small>Just a greeting and sign-off</small>
              </button>
              {allTemplates.map((template) => (
                <button
                  className={cn("eb-gallery__item", templateId === template.id && "is-active")}
                  key={template.id}
                  style={{ ["--tpl-color" as string]: template.color }}
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                >
                  <span className={cn("eb-gallery__thumb", `is-${template.header}`)}>
                    <i />
                    <b />
                    <b />
                    <b />
                    <em />
                  </span>
                  <span className="eb-gallery__tag">{template.tag}</span>
                  <strong>{template.name}</strong>
                  <small>{template.text}</small>
                </button>
              ))}
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Recipients */}
      <Modal
        open={recipientsOpen}
        primaryAction={{ content: "Done", onAction: () => setRecipientsOpen(false) }}
        size="large"
        title={`${recipientCount} of ${candidates.length} people included`}
        onClose={() => setRecipientsOpen(false)}
      >
        <Modal.Section>
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <div className="eb-modal-search">
              <TextField
                autoComplete="off"
                clearButton
                label="Search recipients"
                labelHidden
                placeholder="Search name, email or company"
                prefix={<Icon source={SearchIcon} />}
                value={recipientSearch}
                onChange={setRecipientSearch}
                onClearButtonClick={() => setRecipientSearch("")}
              />
            </div>
            <ButtonGroup>
              <Button size="slim" onClick={() => setVisibleIncluded(true)}>
                Include all
              </Button>
              <Button size="slim" onClick={() => setVisibleIncluded(false)}>
                Remove all
              </Button>
            </ButtonGroup>
          </InlineStack>
        </Modal.Section>
        <IndexTable
          headings={[{ title: "" }, { title: "Name" }, { title: "Email" }, { title: "Company" }, { title: "Type" }]}
          itemCount={visibleRecipients.length}
          resourceName={{ singular: "recipient", plural: "recipients" }}
          selectable={false}
        >
          {visibleRecipients.map((r, i) => {
            const included = !excludedSet.has(r.email.toLowerCase().trim());
            return (
              <IndexTable.Row id={r.email} key={r.email} position={i} onClick={() => toggleRecipient(r.email)}>
                <IndexTable.Cell>
                  <div onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={included} label={`Include ${r.name}`} labelHidden onChange={() => toggleRecipient(r.email)} />
                  </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <span className={cn("eb-person", !included && "is-out")}>
                    <strong>{r.name}</strong>
                    {r.jobTitle ? <small>{r.jobTitle}</small> : null}
                  </span>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <span className={cn("eb-person", !included && "is-out")}>{r.email}</span>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <span className={cn("eb-person", !included && "is-out")}>{r.company || "—"}</span>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={r.recipientType === "contact" ? "info" : "attention"}>
                    {r.recipientType === "contact" ? "Customer" : r.recipientType === "lead" ? "Lead" : "Other"}
                  </Badge>
                </IndexTable.Cell>
              </IndexTable.Row>
            );
          })}
        </IndexTable>
      </Modal>

      {/* Exact preview */}
      <Modal open={previewOpen} size="large" title="Exactly as it will be sent" onClose={() => setPreviewOpen(false)}>
        <Modal.Section>
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <ButtonGroup variant="segmented">
              <Button icon={DesktopIcon} pressed={device === "desktop"} onClick={() => setDevice("desktop")}>
                Desktop
              </Button>
              <Button icon={MobileIcon} pressed={device === "mobile"} onClick={() => setDevice("mobile")}>
                Phone
              </Button>
            </ButtonGroup>
            <ButtonGroup variant="segmented">
              <Button pressed={previewTheme === "light"} onClick={() => setPreviewTheme("light")}>
                Light inbox
              </Button>
              <Button pressed={previewTheme === "dark"} onClick={() => setPreviewTheme("dark")}>
                Dark inbox
              </Button>
            </ButtonGroup>
          </InlineStack>
        </Modal.Section>
        <div className={cn("eb-exact", previewTheme === "dark" && "is-dark")}>
          <iframe className={device === "mobile" ? "is-mobile" : undefined} sandbox="allow-same-origin" srcDoc={renderedHtml} title="Exact email preview" />
        </div>
      </Modal>

      {/* Test send */}
      <Modal
        open={testOpen}
        primaryAction={{ content: "Send test", loading: testSending, onAction: () => void handleTestSend() }}
        secondaryActions={[
          {
            content: "Close",
            disabled: testSending,
            onAction: () => {
              setTestOpen(false);
              setTestResult(null);
            },
          },
        ]}
        title="Send yourself a test"
        onClose={() => {
          setTestOpen(false);
          setTestResult(null);
        }}
      >
        <Modal.Section>
          <FormLayout>
            <Text as="p" tone="subdued">
              We&apos;ll send the email as it looks now, filled in with sample data. Nothing goes to your audience.
            </Text>
            <TextField
              autoComplete="email"
              label="Send to"
              placeholder="you@yourcompany.com"
              type="email"
              value={testEmail}
              onChange={setTestEmail}
            />
            {testResult ? <Banner tone={testResult.ok ? "success" : "critical"}>{testResult.text}</Banner> : null}
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Save as template */}
      <Modal
        open={tplOpen}
        primaryAction={{
          content: "Save template",
          loading: tplSaving,
          disabled: !tplName.trim(),
          onAction: () => void handleSaveTemplate(),
        }}
        secondaryActions={[{ content: "Close", disabled: tplSaving, onAction: () => setTplOpen(false) }]}
        title="Save as template"
        onClose={() => setTplOpen(false)}
      >
        <Modal.Section>
          <FormLayout>
            <Text as="p" tone="subdued">
              Saves this email&apos;s design, text and subject so you can start future campaigns from it. The audience
              isn&apos;t included.
            </Text>
            <TextField autoComplete="off" autoFocus label="Template name" value={tplName} onChange={setTplName} />
            {tplResult ? <Banner tone={tplResult.ok ? "success" : "critical"}>{tplResult.text}</Banner> : null}
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Review & send */}
      <Modal
        open={reviewOpen}
        primaryAction={{
          content: `Send to ${recipientCount} ${recipientCount === 1 ? "person" : "people"}`,
          loading: sending,
          onAction: () => void handleSave(true),
        }}
        secondaryActions={[{ content: "Keep editing", disabled: sending, onAction: () => setReviewOpen(false) }]}
        title="Ready to send?"
        onClose={() => setReviewOpen(false)}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <dl className="eb-review">
              <div>
                <dt>To</dt>
                <dd>
                  {recipientCount} {recipientCount === 1 ? "person" : "people"} · {audienceLabel}
                </dd>
              </div>
              <div>
                <dt>From</dt>
                <dd>
                  {fromName}
                  {fromEmail ? ` <${fromEmail}>` : ""}
                </dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{subject}</dd>
              </div>
              {previewText ? (
                <div>
                  <dt>Preview</dt>
                  <dd>{previewText}</dd>
                </div>
              ) : null}
            </dl>
            <Banner tone="warning">
              Emails go out straight away and can&apos;t be recalled. Send yourself a test first if you haven&apos;t yet.
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
