"use client";

import {
  ActionList,
  Badge,
  Banner,
  BlockStack,
  Button,
  Icon,
  Modal,
  Pagination,
  Popover,
  Select,
  SkeletonBodyText,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { MenuHorizontalIcon, PlusIcon, SearchIcon, TextBlockIcon } from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  deleteEmailCampaign,
  getEmailCampaigns,
  sendEmailCampaign,
  type EmailCampaign,
  type ListCampaignsResponse,
} from "@/lib/email-marketing-api";
import { SYSTEM_PRESET_TEMPLATES } from "@frog1/shared";

type StatusFilter = "" | "draft" | "scheduled" | "sent" | "failed";

const STATUS_TABS: Array<{ id: StatusFilter; content: string }> = [
  { id: "", content: "All" },
  { id: "draft", content: "Drafts" },
  { id: "scheduled", content: "Scheduled" },
  { id: "sent", content: "Sent" },
  { id: "failed", content: "Failed" },
];

const STATUS_META: Record<
  EmailCampaign["status"],
  { label: string; tone?: "success" | "warning" | "attention" | "info" | "critical" }
> = {
  draft: { label: "Draft" },
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending…", tone: "attention" },
  sent: { label: "Sent", tone: "success" },
  partially_sent: { label: "Partly sent", tone: "warning" },
  failed: { label: "Failed", tone: "critical" },
  cancelled: { label: "Cancelled" },
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: "Customers & leads",
  segment: "Customers & leads",
  contacts: "Customers",
  leads: "Leads",
  custom: "Hand-picked",
};

const STARTERS = SYSTEM_PRESET_TEMPLATES.slice(0, 3);

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** Tiny drawing of the email: colour header, subject, a few lines and a button. */
function MailThumb({ color, subject, headerStyle }: { color: string; subject: string; headerStyle?: string }) {
  return (
    <span className={cn("ecl-thumb", headerStyle === "minimal" && "is-minimal", headerStyle === "centered" && "is-centered")} style={{ ["--mail-color" as string]: color }}>
      <span className="ecl-thumb__mail">
        <span className="ecl-thumb__head">
          <i />
          <b>{subject}</b>
        </span>
        <span className="ecl-thumb__body">
          <s />
          <s />
          <s />
          <em />
        </span>
      </span>
    </span>
  );
}

export function CampaignsListPage() {
  const router = useRouter();
  const [data, setData] = useState<ListCampaignsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(0);
  const [audience, setAudience] = useState("");
  const [page, setPage] = useState(1);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<EmailCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailCampaign | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const status = STATUS_TABS[tab].id;

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(
        await getEmailCampaigns({
          page,
          perPage: 12,
          search: search || undefined,
          status: status || undefined,
          audienceType: (audience || undefined) as never,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, audience]);

  useEffect(() => {
    const handle = setTimeout(() => void fetchCampaigns(), search ? 250 : 0);
    return () => clearTimeout(handle);
  }, [fetchCampaigns, search]);

  async function confirmSend() {
    if (!sendTarget) return;
    try {
      setActionLoading(true);
      await sendEmailCampaign(sendTarget.id);
      setNotice(`"${sendTarget.name}" is on its way.`);
      setSendTarget(null);
      void fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send campaign");
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      setActionLoading(true);
      await deleteEmailCampaign(deleteTarget.id);
      setNotice(`"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      void fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign");
    } finally {
      setActionLoading(false);
    }
  }

  function openCampaign(campaign: EmailCampaign) {
    const editable = campaign.status === "draft" || campaign.status === "scheduled";
    router.push(`/dashboard/marketing/campaigns/${campaign.id}${editable ? "/edit" : ""}`);
  }

  const stats = data?.overviewStats;
  const items = data?.items ?? [];
  const filtered = Boolean(search || status || audience);
  const firstRun = !loading && !filtered && (stats?.totalCampaigns ?? 0) === 0;

  const metrics = [
    { label: "Emails sent", value: (stats?.totalSent ?? 0).toLocaleString(), hint: `${stats?.totalCampaigns ?? 0} campaigns` },
    { label: "Delivered", value: pct(stats?.totalDelivered ?? 0, stats?.totalSent ?? 0), hint: `${stats?.totalDelivered ?? 0} reached the inbox` },
    { label: "Opened", value: pct(stats?.totalOpened ?? 0, stats?.totalDelivered ?? 0), hint: `${stats?.totalOpened ?? 0} unique opens` },
    { label: "Clicked", value: pct(stats?.totalClicked ?? 0, stats?.totalOpened ?? 0), hint: `${stats?.totalClicked ?? 0} clicks` },
  ];

  return (
    <AppPage
      title="Email campaigns"
      subtitle="Newsletters, offers and follow-ups for your customers and leads."
      primaryAction={{
        content: "New campaign",
        icon: PlusIcon,
        onAction: () => router.push("/dashboard/marketing/campaigns/new"),
      }}
      secondaryActions={[
        {
          content: "Templates",
          icon: TextBlockIcon,
          onAction: () => router.push("/dashboard/marketing/templates"),
        },
      ]}
    >
      <BlockStack gap="500">
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

        {firstRun ? (
          <section className="ecl-first">
            <div className="ecl-first__head">
              <Text as="h2" variant="headingLg">
                Start your first campaign
              </Text>
              <Text as="p" tone="subdued">
                Pick a starting point — you can change every word, colour and button afterwards.
              </Text>
            </div>
            <div className="ecl-grid">
              <button
                className="ecl-card ecl-card--new"
                type="button"
                onClick={() => router.push("/dashboard/marketing/campaigns/new?template=blank")}
              >
                <span className="ecl-card__plus">
                  <Icon source={PlusIcon} />
                </span>
                <strong>Blank email</strong>
                <small>Start with an empty message</small>
              </button>
              {STARTERS.map((preset) => (
                <button
                  className="ecl-card"
                  key={preset.id}
                  type="button"
                  onClick={() => router.push(`/dashboard/marketing/campaigns/new?template=${preset.id}`)}
                >
                  <MailThumb
                    color={preset.designConfig.primaryColor || "#047857"}
                    headerStyle={preset.designConfig.headerStyle}
                    subject={preset.subject.replace(/\{\{[^}]+\}\}/g, "you")}
                  />
                  <span className="ecl-card__body">
                    <strong>{preset.name}</strong>
                    <small>{preset.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <div className="ecl-metrics">
              {metrics.map((metric) => (
                <div className="ecl-metric" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{loading && !data ? "…" : metric.value}</strong>
                  <small>{metric.hint}</small>
                </div>
              ))}
            </div>

            <div className="ecl-bar">
              <Tabs
                selected={tab}
                tabs={STATUS_TABS.map((t) => ({ id: t.id || "all", content: t.content }))}
                onSelect={(index) => {
                  setTab(index);
                  setPage(1);
                }}
              />
              <div className="ecl-bar__filters">
                <div className="ecl-bar__search">
                  <TextField
                    autoComplete="off"
                    clearButton
                    label="Search campaigns"
                    labelHidden
                    placeholder="Search campaigns"
                    prefix={<Icon source={SearchIcon} />}
                    value={search}
                    onChange={(value) => {
                      setSearch(value);
                      setPage(1);
                    }}
                    onClearButtonClick={() => setSearch("")}
                  />
                </div>
                <Select
                  label="Audience"
                  labelHidden
                  options={[
                    { label: "Any audience", value: "" },
                    { label: "Customers & leads", value: "all" },
                    { label: "Customers", value: "contacts" },
                    { label: "Leads", value: "leads" },
                  ]}
                  value={audience}
                  onChange={(value) => {
                    setAudience(value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            {loading && !data ? (
              <SkeletonBodyText lines={8} />
            ) : items.length === 0 ? (
              <div className="ecl-none">
                <Text as="p" fontWeight="semibold">
                  No campaigns here
                </Text>
                <Text as="p" tone="subdued">
                  Try another tab or search term.
                </Text>
              </div>
            ) : (
              <div className={cn("ecl-grid", loading && "is-loading")}>
                <button
                  className="ecl-card ecl-card--new"
                  type="button"
                  onClick={() => router.push("/dashboard/marketing/campaigns/new")}
                >
                  <span className="ecl-card__plus">
                    <Icon source={PlusIcon} />
                  </span>
                  <strong>New campaign</strong>
                  <small>Start from a template or blank</small>
                </button>

                {items.map((campaign) => {
                  const meta = STATUS_META[campaign.status] ?? STATUS_META.draft;
                  const canSend = campaign.status === "draft" || campaign.status === "failed";
                  const canEdit = campaign.status === "draft" || campaign.status === "scheduled";
                  const sent = campaign.sentCount > 0;
                  return (
                    <article className="ecl-card" key={campaign.id}>
                      <button className="ecl-card__open" type="button" onClick={() => openCampaign(campaign)}>
                        <MailThumb
                          color={campaign.designConfig?.primaryColor || "#047857"}
                          headerStyle={campaign.designConfig?.headerStyle}
                          subject={campaign.subject || "No subject yet"}
                        />
                        <span className="ecl-card__body">
                          <span className="ecl-card__title">
                            <strong>{campaign.name}</strong>
                            <Badge size="small" tone={meta.tone}>
                              {meta.label}
                            </Badge>
                          </span>
                          <small>
                            {AUDIENCE_LABELS[campaign.targetAudienceType] ?? "Customers & leads"} ·{" "}
                            {campaign.sentAt
                              ? `sent ${formatAppDate(campaign.sentAt)}`
                              : campaign.scheduledAt
                                ? `for ${formatAppDate(campaign.scheduledAt)}`
                                : `edited ${formatAppDate(campaign.updatedAt)}`}
                          </small>
                        </span>
                        <span className="ecl-card__stats">
                          <span>
                            <b>{campaign.totalRecipients || "—"}</b>
                            <i>Recipients</i>
                          </span>
                          <span>
                            <b>{sent ? pct(campaign.openedCount, campaign.deliveredCount) : "—"}</b>
                            <i>Opened</i>
                          </span>
                          <span>
                            <b>{sent ? pct(campaign.clickedCount, campaign.openedCount) : "—"}</b>
                            <i>Clicked</i>
                          </span>
                        </span>
                      </button>
                      <div className="ecl-card__menu">
                        <Popover
                          active={openMenu === campaign.id}
                          activator={
                            <Button
                              accessibilityLabel={`Actions for ${campaign.name}`}
                              icon={MenuHorizontalIcon}
                              size="slim"
                              onClick={() => setOpenMenu((current) => (current === campaign.id ? null : campaign.id))}
                            />
                          }
                          preferredAlignment="right"
                          onClose={() => setOpenMenu(null)}
                        >
                          <ActionList
                            actionRole="menuitem"
                            onActionAnyItem={() => setOpenMenu(null)}
                            sections={[
                              {
                                items: [
                                  ...(canEdit
                                    ? [{ content: "Edit", onAction: () => router.push(`/dashboard/marketing/campaigns/${campaign.id}/edit`) }]
                                    : []),
                                  {
                                    content: sent ? "View report" : "View details",
                                    onAction: () => router.push(`/dashboard/marketing/campaigns/${campaign.id}`),
                                  },
                                  ...(canSend ? [{ content: "Send now", onAction: () => setSendTarget(campaign) }] : []),
                                ],
                              },
                              { items: [{ content: "Delete", destructive: true, onAction: () => setDeleteTarget(campaign) }] },
                            ]}
                          />
                        </Popover>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {data && data.totalPages > 1 ? (
              <div className="ecl-pager">
                <Pagination
                  hasNext={page < data.totalPages}
                  hasPrevious={page > 1}
                  label={`Page ${page} of ${data.totalPages}`}
                  onNext={() => setPage((p) => Math.min(p + 1, data.totalPages))}
                  onPrevious={() => setPage((p) => Math.max(p - 1, 1))}
                />
              </div>
            ) : null}
          </>
        )}
      </BlockStack>

      <Modal
        open={Boolean(sendTarget)}
        primaryAction={{ content: "Send now", loading: actionLoading, onAction: confirmSend }}
        secondaryActions={[{ content: "Cancel", disabled: actionLoading, onAction: () => setSendTarget(null) }]}
        title="Send this campaign?"
        onClose={() => setSendTarget(null)}
      >
        <Modal.Section>
          <Text as="p">
            <strong>{sendTarget?.name}</strong> will be emailed to its audience
            {sendTarget?.totalRecipients ? ` (${sendTarget.totalRecipients} recipients)` : ""} straight away.
            This can&apos;t be undone.
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        primaryAction={{ content: "Delete campaign", destructive: true, loading: actionLoading, onAction: confirmDelete }}
        secondaryActions={[{ content: "Cancel", disabled: actionLoading, onAction: () => setDeleteTarget(null) }]}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        onClose={() => setDeleteTarget(null)}
      >
        <Modal.Section>
          <Text as="p">The campaign and its report will be removed. This can&apos;t be undone.</Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
