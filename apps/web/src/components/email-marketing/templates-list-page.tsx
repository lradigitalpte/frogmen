"use client";

import {
  ActionList,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  FormLayout,
  Icon,
  InlineStack,
  Modal,
  Popover,
  Select,
  SkeletonBodyText,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { DesktopIcon, MenuHorizontalIcon, MobileIcon, PlusIcon, SearchIcon } from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { cn } from "@/lib/utils";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  getEmailTemplates,
  type EmailTemplate,
} from "@/lib/email-marketing-api";
import { renderMarketingEmailHtml, SYSTEM_PRESET_TEMPLATES, type EmailDesignConfig } from "@frog1/shared";

type Category = EmailTemplate["category"];

const CATEGORY_TABS: Array<{ id: "" | Category; label: string }> = [
  { id: "", label: "All" },
  { id: "announcement", label: "Announcements" },
  { id: "promotion", label: "Offers" },
  { id: "newsletter", label: "Newsletters" },
  { id: "onboarding", label: "Welcome" },
  { id: "outreach", label: "Outreach" },
  { id: "custom", label: "Letters" },
];

const CATEGORY_LABEL: Record<string, string> = {
  announcement: "Announcement",
  promotion: "Offer",
  newsletter: "Newsletter",
  onboarding: "Welcome",
  outreach: "Outreach",
  custom: "Letter",
};

const SAMPLE = {
  name: "Alex Morgan",
  firstName: "Alex",
  company: "Acme Offshore Marine",
  jobTitle: "Operations Director",
  email: "alex.morgan@acmemarine.com",
  unsubscribeUrl: "#",
};

const TAG_LABELS: Record<string, string> = {
  first_name: "First name",
  name: "Full name",
  company: "Company",
  job_title: "Job title",
  email: "Email",
};

const BLANK_BODY = "<p>Hello {{first_name}},</p>\n\n<p>Write your message here.</p>\n\n<p>Best regards,<br />The Frogmen team</p>";

/** A template from either the built-in set or the organisation's saved ones. */
interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: Category;
  subject: string;
  previewText?: string;
  bodyHtml: string;
  designConfig?: Partial<EmailDesignConfig> | null;
  builtIn: boolean;
}

function renderTemplate(template: TemplateItem, theme: "light" | "dark" = "light") {
  const d = template.designConfig ?? {};
  return renderMarketingEmailHtml({
    subject: template.subject,
    previewText: template.previewText,
    bodyHtml: template.bodyHtml,
    design: {
      ...d,
      primaryColor: d.primaryColor || "#047857",
      backgroundColor: theme === "dark" ? "#090e17" : "#f4f7f5",
      cardBackgroundColor: theme === "dark" ? "#111827" : "#ffffff",
      textColor: theme === "dark" ? "#e2e8f0" : "#334155",
      headingColor: theme === "dark" ? "#ffffff" : "#0f172a",
      brandName: d.brandName || "Frogmen Technologies",
      showUnsubscribe: true,
    },
    mergeData: SAMPLE,
    forceTheme: theme,
  }).html;
}

/** Subject line with {{tags}} shown as pills. */
function SubjectLine({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*\w+\s*\}\})/g);
  return (
    <span className="etl-subject">
      {parts.map((part, index) => {
        const match = part.match(/^\{\{\s*(\w+)\s*\}\}$/);
        return match ? (
          <span className="etl-subject__tag" key={index}>
            {TAG_LABELS[match[1]] ?? match[1]}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        );
      })}
    </span>
  );
}

function Thumbnail({ html, color }: { html: string; color: string }) {
  return (
    <span className="etl-thumb" style={{ ["--tpl-color" as string]: color }}>
      <iframe aria-hidden sandbox="allow-same-origin" srcDoc={html} tabIndex={-1} title="" />
    </span>
  );
}

export function TemplatesListPage() {
  const router = useRouter();
  const [saved, setSaved] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; templateId?: string } | null>(null);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(0);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [preview, setPreview] = useState<TemplateItem | null>(null);
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("custom");
  const [newDescription, setNewDescription] = useState("");
  const [newBase, setNewBase] = useState("blank");
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TemplateItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setSaved(await getEmailTemplates());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const builtIn: TemplateItem[] = useMemo(
    () =>
      SYSTEM_PRESET_TEMPLATES.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category as Category,
        subject: p.subject,
        previewText: p.previewText,
        bodyHtml: p.bodyHtml,
        designConfig: p.designConfig,
        builtIn: true,
      })),
    [],
  );

  const yours: TemplateItem[] = useMemo(
    () =>
      saved.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description || "",
        category: t.category,
        subject: t.subject,
        previewText: t.previewText || undefined,
        bodyHtml: t.bodyHtml,
        designConfig: t.designConfig,
        builtIn: false,
      })),
    [saved],
  );

  const category = CATEGORY_TABS[tab].id;
  const matches = useCallback(
    (t: TemplateItem) => {
      if (category && t.category !== category) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [t.name, t.description, t.subject].some((v) => v.toLowerCase().includes(q));
    },
    [category, search],
  );

  const visibleYours = yours.filter(matches);
  const visibleBuiltIn = builtIn.filter(matches);

  // Thumbnails are rendered once per template list.
  const thumbs = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of [...builtIn, ...yours]) map.set(t.id, renderTemplate(t));
    return map;
  }, [builtIn, yours]);

  const previewHtml = useMemo(() => (preview ? renderTemplate(preview, previewTheme) : ""), [preview, previewTheme]);

  function openInCampaign(id: string) {
    router.push(`/dashboard/marketing/campaigns/new?template=${encodeURIComponent(id)}`);
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setError("Give the template a name.");
      return;
    }
    const base = [...builtIn, ...yours].find((t) => t.id === newBase);
    try {
      setCreating(true);
      setError(null);
      const created = await createEmailTemplate({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        category: newCategory,
        subject: base?.subject || "A message for {{company}}",
        previewText: base?.previewText || undefined,
        bodyHtml: base?.bodyHtml || BLANK_BODY,
        designConfig: (base?.designConfig as EmailDesignConfig | undefined) || undefined,
        isSystemPreset: false,
      });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      setNewBase("blank");
      setNotice({ text: `"${created.name}" saved to your templates.`, templateId: created.id });
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteEmailTemplate(deleteTarget.id);
      setNotice({ text: `"${deleteTarget.name}" deleted.` });
      setDeleteTarget(null);
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setDeleting(false);
    }
  }

  function renderCard(t: TemplateItem) {
    const color = t.designConfig?.primaryColor || "#047857";
    return (
      <article className="etl-card" key={t.id} style={{ ["--tpl-color" as string]: color }}>
        <div className="etl-card__media">
          <Thumbnail color={color} html={thumbs.get(t.id) ?? ""} />
          <div className="etl-card__hover">
            <Button variant="primary" onClick={() => openInCampaign(t.id)}>
              Use template
            </Button>
            <Button onClick={() => setPreview(t)}>Preview</Button>
          </div>
        </div>
        <div className="etl-card__body">
          <div className="etl-card__top">
            <span className="etl-card__cat">{CATEGORY_LABEL[t.category] ?? t.category}</span>
            {!t.builtIn ? (
              <Popover
                active={openMenu === t.id}
                activator={
                  <Button
                    accessibilityLabel={`More actions for ${t.name}`}
                    icon={MenuHorizontalIcon}
                    size="slim"
                    variant="tertiary"
                    onClick={() => setOpenMenu((current) => (current === t.id ? null : t.id))}
                  />
                }
                preferredAlignment="right"
                onClose={() => setOpenMenu(null)}
              >
                <ActionList
                  actionRole="menuitem"
                  onActionAnyItem={() => setOpenMenu(null)}
                  items={[
                    { content: "Use in a campaign", onAction: () => openInCampaign(t.id) },
                    { content: "Preview", onAction: () => setPreview(t) },
                    { content: "Delete", destructive: true, onAction: () => setDeleteTarget(t) },
                  ]}
                />
              </Popover>
            ) : null}
          </div>
          <button className="etl-card__title" type="button" onClick={() => setPreview(t)}>
            {t.name}
          </button>
          {t.description ? <p className="etl-card__desc">{t.description}</p> : null}
          <div className="etl-card__subject">
            <span>Subject</span>
            <SubjectLine text={t.subject} />
          </div>
        </div>
      </article>
    );
  }

  const nothing = !loading && visibleYours.length === 0 && visibleBuiltIn.length === 0;

  return (
    <AppPage
      backAction={{ content: "Campaigns", url: "/dashboard/marketing/campaigns" }}
      primaryAction={{ content: "New template", icon: PlusIcon, onAction: () => setCreateOpen(true) }}
      subtitle="Ready-made designs for your campaigns. Every template works on phones and in dark-mode inboxes."
      title="Email templates"
    >
      <BlockStack gap="500">
        {notice ? (
          <Banner
            action={notice.templateId ? { content: "Use it in a campaign", onAction: () => openInCampaign(notice.templateId!) } : undefined}
            tone="success"
            onDismiss={() => setNotice(null)}
          >
            {notice.text}
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <div className="etl-bar">
          <Tabs
            selected={tab}
            tabs={CATEGORY_TABS.map((c) => ({ id: c.id || "all", content: c.label }))}
            onSelect={setTab}
          />
          <div className="etl-bar__search">
            <TextField
              autoComplete="off"
              clearButton
              label="Search templates"
              labelHidden
              placeholder="Search templates"
              prefix={<Icon source={SearchIcon} />}
              value={search}
              onChange={setSearch}
              onClearButtonClick={() => setSearch("")}
            />
          </div>
        </div>

        {loading ? <SkeletonBodyText lines={6} /> : null}

        {visibleYours.length ? (
          <section className="etl-section">
            <header>
              <Text as="h2" variant="headingMd">
                Your templates
              </Text>
              <Text as="span" tone="subdued" variant="bodySm">
                {visibleYours.length} saved
              </Text>
            </header>
            <div className="etl-grid">{visibleYours.map(renderCard)}</div>
          </section>
        ) : null}

        {visibleBuiltIn.length ? (
          <section className="etl-section">
            <header>
              <Text as="h2" variant="headingMd">
                Built-in templates
              </Text>
              <Text as="span" tone="subdued" variant="bodySm">
                Tested in Gmail, Outlook and Apple Mail
              </Text>
            </header>
            <div className="etl-grid">
              {!search && !category && !visibleYours.length ? (
                <button className="etl-card etl-card--new" type="button" onClick={() => setCreateOpen(true)}>
                  <span className="etl-card__plus">
                    <Icon source={PlusIcon} />
                  </span>
                  <strong>Make your own</strong>
                  <small>Start from scratch or copy one of these</small>
                </button>
              ) : null}
              {visibleBuiltIn.map(renderCard)}
            </div>
          </section>
        ) : null}

        {nothing ? (
          <div className="etl-none">
            <Text as="p" fontWeight="semibold">
              No templates match
            </Text>
            <Button
              onClick={() => {
                setSearch("");
                setTab(0);
              }}
            >
              Show all templates
            </Button>
          </div>
        ) : null}
      </BlockStack>

      {/* Preview */}
      <Modal
        open={Boolean(preview)}
        primaryAction={{ content: "Use this template", onAction: () => preview && openInCampaign(preview.id) }}
        secondaryActions={[{ content: "Close", onAction: () => setPreview(null) }]}
        size="large"
        title={preview?.name ?? ""}
        onClose={() => setPreview(null)}
      >
        <Modal.Section>
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <span className="etl-modal-subject">
              <Text as="span" tone="subdued" variant="bodySm">
                Subject
              </Text>
              {preview ? <SubjectLine text={preview.subject} /> : null}
            </span>
            <InlineStack gap="200">
              <ButtonGroup variant="segmented">
                <Button
                  accessibilityLabel="Desktop"
                  icon={DesktopIcon}
                  pressed={previewDevice === "desktop"}
                  onClick={() => setPreviewDevice("desktop")}
                />
                <Button
                  accessibilityLabel="Phone"
                  icon={MobileIcon}
                  pressed={previewDevice === "mobile"}
                  onClick={() => setPreviewDevice("mobile")}
                />
              </ButtonGroup>
              <ButtonGroup variant="segmented">
                <Button pressed={previewTheme === "light"} onClick={() => setPreviewTheme("light")}>
                  Light
                </Button>
                <Button pressed={previewTheme === "dark"} onClick={() => setPreviewTheme("dark")}>
                  Dark
                </Button>
              </ButtonGroup>
            </InlineStack>
          </InlineStack>
        </Modal.Section>
        <div className={cn("eb-exact", previewTheme === "dark" && "is-dark")}>
          <iframe className={previewDevice === "mobile" ? "is-mobile" : undefined} sandbox="allow-same-origin" srcDoc={previewHtml} title="Template preview" />
        </div>
      </Modal>

      {/* New template */}
      <Modal
        open={createOpen}
        primaryAction={{ content: "Create template", loading: creating, onAction: () => void handleCreate() }}
        secondaryActions={[{ content: "Cancel", disabled: creating, onAction: () => setCreateOpen(false) }]}
        title="New template"
        onClose={() => setCreateOpen(false)}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              autoComplete="off"
              autoFocus
              label="Name"
              placeholder="e.g. Monthly maintenance reminder"
              value={newName}
              onChange={setNewName}
            />
            <FormLayout.Group>
              <Select
                label="Type"
                options={CATEGORY_TABS.filter((c) => c.id).map((c) => ({ label: CATEGORY_LABEL[c.id], value: c.id }))}
                value={newCategory}
                onChange={(value) => setNewCategory(value as Category)}
              />
              <Select
                helpText="Copies its design and text so you can change them."
                label="Start from"
                options={[
                  { label: "Blank email", value: "blank" },
                  ...builtIn.map((t) => ({ label: t.name, value: t.id })),
                  ...yours.map((t) => ({ label: `${t.name} (yours)`, value: t.id })),
                ]}
                value={newBase}
                onChange={setNewBase}
              />
            </FormLayout.Group>
            <TextField
              autoComplete="off"
              label="Description"
              placeholder="When to use it (optional)"
              value={newDescription}
              onChange={setNewDescription}
            />
            <Text as="p" tone="subdued" variant="bodySm">
              Tip: you can also save any campaign you&apos;re writing as a template from the campaign editor.
            </Text>
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Delete */}
      <Modal
        open={Boolean(deleteTarget)}
        primaryAction={{ content: "Delete template", destructive: true, loading: deleting, onAction: () => void handleDelete() }}
        secondaryActions={[{ content: "Cancel", disabled: deleting, onAction: () => setDeleteTarget(null) }]}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        onClose={() => setDeleteTarget(null)}
      >
        <Modal.Section>
          <Text as="p">Campaigns already made from it are not affected.</Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
