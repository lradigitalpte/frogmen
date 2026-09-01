"use client";

import {
  Badge,
  Banner,
  Button,
  ButtonGroup,
  Card,
  Filters,
  IndexTable,
  Layout,
  Modal,
  Pagination,
  Select,
  Tabs,
  Text,
  TextField,
  useIndexResourceState,
} from "@shopify/polaris";
import {
  CheckIcon,
  DesktopIcon,
  EditIcon,
  EmailIcon,
  MobileIcon,
  PersonIcon,
  RefreshIcon,
  SendIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  getCampaignRecipients,
  getEmailCampaign,
  sendEmailCampaign,
  testSendEmailCampaign,
  type EmailCampaign,
  type EmailCampaignRecipient,
} from "@/lib/email-marketing-api";
import { renderMarketingEmailHtml, type EmailDesignConfig } from "@frog1/shared";

function getStatusBadge(status: EmailCampaign["status"]) {
  switch (status) {
    case "sent":
      return <Badge tone="success">Sent</Badge>;
    case "partially_sent":
      return <Badge tone="warning">Partially Sent</Badge>;
    case "sending":
      return <Badge tone="attention">Sending…</Badge>;
    case "scheduled":
      return <Badge tone="info">Scheduled</Badge>;
    case "failed":
      return <Badge tone="critical">Failed</Badge>;
    case "cancelled":
      return <Badge>Cancelled</Badge>;
    case "draft":
    default:
      return <Badge tone="info">Draft</Badge>;
  }
}

function getRecipientStatusBadge(status: EmailCampaignRecipient["status"]) {
  switch (status) {
    case "clicked":
      return <Badge tone="success">Clicked Link</Badge>;
    case "opened":
      return <Badge tone="success">Opened</Badge>;
    case "delivered":
      return <Badge tone="info">Delivered</Badge>;
    case "sent":
      return <Badge tone="info">Sent</Badge>;
    case "bounced":
      return <Badge tone="critical">Bounced</Badge>;
    case "failed":
      return <Badge tone="critical">Failed</Badge>;
    case "unsubscribed":
      return <Badge tone="warning">Unsubscribed</Badge>;
    case "pending":
    default:
      return <Badge>Pending</Badge>;
  }
}

export function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [recipients, setRecipients] = useState<EmailCampaignRecipient[]>([]);
  const [totalRecipients, setTotalRecipients] = useState(0);
  const [recipientsPage, setRecipientsPage] = useState(1);
  const [recipientsTotalPages, setRecipientsTotalPages] = useState(1);
  const [recipientStatusFilter, setRecipientStatusFilter] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Tabs
  const [selectedTab, setSelectedTab] = useState(0);

  // Preview Mode
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  // Modals
  const [sendConfirmModalOpen, setSendConfirmModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [testEmailModalOpen, setTestEmailModalOpen] = useState(false);
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [testSendResult, setTestSendResult] = useState<string | null>(null);

  const fetchCampaign = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getEmailCampaign(campaignId);
      setCampaign(res);
    } catch (err: any) {
      setError(err.message || "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const fetchRecipients = useCallback(async () => {
    try {
      setRecipientsLoading(true);
      const res = await getCampaignRecipients(campaignId, {
        page: recipientsPage,
        perPage: 25,
        status: recipientStatusFilter || undefined,
        search: recipientSearch || undefined,
      });
      setRecipients(res.items);
      setTotalRecipients(res.total);
      setRecipientsTotalPages(res.totalPages);
    } catch {
      // ignore
    } finally {
      setRecipientsLoading(false);
    }
  }, [campaignId, recipientsPage, recipientStatusFilter, recipientSearch]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);

  const handleSendCampaign = async () => {
    try {
      setActionLoading(true);
      await sendEmailCampaign(campaignId);
      setSuccessBanner("Campaign dispatched successfully via Resend!");
      setSendConfirmModalOpen(false);
      fetchCampaign();
      fetchRecipients();
    } catch (err: any) {
      setError(err.message || "Failed to dispatch campaign");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestSend = async () => {
    if (!campaign || !testRecipientEmail.trim()) return;

    try {
      setActionLoading(true);
      setTestSendResult(null);
      const res = await testSendEmailCampaign({
        recipientEmail: testRecipientEmail.trim(),
        subject: campaign.subject,
        previewText: campaign.previewText || undefined,
        bodyHtml: campaign.bodyHtml,
        bodyText: campaign.bodyText || undefined,
        designConfig: campaign.designConfig || undefined,
        sampleData: {
          name: "Test Recipient",
          firstName: "Tester",
          company: "Partner Marine Corp",
          jobTitle: "Technical Manager",
        },
      });

      setTestSendResult(
        `Preview sent to ${res.recipient} (Mode: ${res.mode}${res.resendId ? `, Resend ID: ${res.resendId}` : ""}).`,
      );
    } catch (err: any) {
      setTestSendResult(`Error sending test email: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Preview HTML
  const previewHtml = useMemo(() => {
    if (!campaign) return "";

    const design: EmailDesignConfig = {
      primaryColor: campaign.designConfig?.primaryColor || "#047857",
      backgroundColor: previewTheme === "dark" ? "#0b1311" : "#f4f7f5",
      darkBackgroundColor: "#0b1311",
      cardBackgroundColor: previewTheme === "dark" ? "#13211c" : "#ffffff",
      darkCardBackgroundColor: "#13211c",
      textColor: previewTheme === "dark" ? "#e2e8f0" : "#334155",
      darkTextColor: "#e2e8f0",
      headingColor: previewTheme === "dark" ? "#ffffff" : "#0f172a",
      darkHeadingColor: "#ffffff",
      showLogo: campaign.designConfig?.showLogo !== false,
      brandName: campaign.designConfig?.brandName || "Frogmen Technologies",
      headerStyle: campaign.designConfig?.headerStyle || "banner",
      ctaLabel: campaign.designConfig?.ctaLabel || undefined,
      ctaUrl: campaign.designConfig?.ctaUrl || undefined,
      ctaStyle: campaign.designConfig?.ctaStyle || "rounded",
      footerText: campaign.designConfig?.footerText || undefined,
      companyAddress: campaign.designConfig?.companyAddress || undefined,
      showUnsubscribe: true,
    };

    const rendered = renderMarketingEmailHtml({
      subject: campaign.subject,
      previewText: campaign.previewText || undefined,
      bodyHtml: campaign.bodyHtml,
      bodyText: campaign.bodyText || undefined,
      design,
      mergeData: {
        name: "Alex Morgan",
        firstName: "Alex",
        company: "Acme Offshore Marine",
        jobTitle: "Operations Director",
        email: "alex.morgan@acmemarine.com",
        unsubscribeUrl: "#",
      },
    });

    return rendered.html;
  }, [campaign, previewTheme]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState((recipients as any) || []);

  const deliveryRate =
    campaign && campaign.sentCount > 0
      ? `${Math.round((campaign.deliveredCount / campaign.sentCount) * 100)}%`
      : "—";

  const openRate =
    campaign && campaign.deliveredCount > 0
      ? `${Math.round((campaign.openedCount / campaign.deliveredCount) * 100)}%`
      : "—";

  const clickRate =
    campaign && campaign.openedCount > 0
      ? `${Math.round((campaign.clickedCount / campaign.openedCount) * 100)}%`
      : "—";

  const canSend = campaign?.status === "draft" || campaign?.status === "failed";
  const canEdit = campaign?.status === "draft" || campaign?.status === "scheduled";

  const recipientRows = recipients.map((r, index) => (
    <IndexTable.Row
      id={r.id}
      key={r.id}
      position={index}
      selected={selectedResources.includes(r.id)}
    >
      <IndexTable.Cell>
        <div>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {r.name || "—"}
          </Text>
          <div style={{ color: "#64748b", fontSize: "12px" }}>{r.email}</div>
        </div>
      </IndexTable.Cell>

      <IndexTable.Cell>
        <Text variant="bodySm" as="span">
          {r.company || "—"}
        </Text>
      </IndexTable.Cell>

      <IndexTable.Cell>
        <Badge tone={r.recipientType === "contact" ? "info" : "attention"}>
          {r.recipientType === "contact" ? "Contact" : "Lead"}
        </Badge>
      </IndexTable.Cell>

      <IndexTable.Cell>{getRecipientStatusBadge(r.status)}</IndexTable.Cell>

      <IndexTable.Cell>
        <Text variant="bodySm" as="span" tone="subdued">
          {r.deliveredAt
            ? new Date(r.deliveredAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </Text>
      </IndexTable.Cell>

      <IndexTable.Cell>
        {r.openCount > 0 ? (
          <span style={{ color: "#047857", fontWeight: 600 }}>
            {r.openCount} {r.openCount === 1 ? "time" : "times"}
          </span>
        ) : (
          <span style={{ color: "#94a3b8" }}>—</span>
        )}
      </IndexTable.Cell>

      <IndexTable.Cell>
        {r.clickCount > 0 ? (
          <span style={{ color: "#0284c7", fontWeight: 600 }}>
            {r.clickCount} {r.clickCount === 1 ? "click" : "clicks"}
          </span>
        ) : (
          <span style={{ color: "#94a3b8" }}>—</span>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const tabItems = [
    { id: "recipients", content: `Recipient Activity (${totalRecipients})` },
    { id: "preview", content: "Email Preview" },
  ];

  return (
    <AppPage
      title={campaign?.name || "Campaign Details"}
      subtitle={campaign?.subject}
      backAction={{
        content: "All Campaigns",
        onAction: () => router.push("/dashboard/marketing/campaigns"),
      }}
      primaryAction={
        canSend
          ? {
              content: "Dispatch via Resend",
              icon: SendIcon,
              onAction: () => setSendConfirmModalOpen(true),
            }
          : undefined
      }
      secondaryActions={[
        ...(canEdit
          ? [
              {
                content: "Edit Campaign",
                icon: EditIcon,
                onAction: () =>
                  router.push(`/dashboard/marketing/campaigns/${campaignId}/edit`),
              },
            ]
          : []),
        {
          content: "Test Email",
          icon: EmailIcon,
          onAction: () => setTestEmailModalOpen(true),
        },
        {
          content: "Refresh Analytics",
          icon: RefreshIcon,
          onAction: () => {
            fetchCampaign();
            fetchRecipients();
          },
        },
      ]}
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

        {/* Hero Card with Status and Info */}
        <Layout.Section>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                  <Text variant="headingLg" as="h2">
                    {campaign?.name}
                  </Text>
                  {campaign && getStatusBadge(campaign.status)}
                </div>
                <div style={{ color: "#64748b", fontSize: "14px" }}>
                  Sender: <strong>{campaign?.fromName}</strong> ({campaign?.fromEmail || "System"}) | Target Audience:{" "}
                  <strong>{campaign?.targetAudienceType.toUpperCase()}</strong>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <Text variant="bodySm" as="span" tone="subdued">
                  {campaign?.sentAt
                    ? `Dispatched on ${new Date(campaign.sentAt).toLocaleString()}`
                    : `Created on ${new Date(campaign?.createdAt || Date.now()).toLocaleDateString()}`}
                </Text>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* KPI Performance Cards */}
        <Layout.Section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Audience Delivered"
              value={deliveryRate}
              hint={`${campaign?.deliveredCount || 0} / ${campaign?.totalRecipients || 0} delivered`}
              icon={<CheckIcon />}
              tone="success"
              loading={loading}
            />
            <KpiCard
              label="Open Rate"
              value={openRate}
              hint={`${campaign?.openedCount || 0} unique opens`}
              icon={<EmailIcon />}
              tone="success"
              loading={loading}
            />
            <KpiCard
              label="Click-Through Rate"
              value={clickRate}
              hint={`${campaign?.clickedCount || 0} clicked links`}
              icon={<ViewIcon />}
              tone="default"
              loading={loading}
            />
            <KpiCard
              label="Bounced / Unsub"
              value={`${campaign?.bouncedCount || 0} / ${campaign?.unsubscribedCount || 0}`}
              hint={`${campaign?.bouncedCount || 0} bounces, ${campaign?.unsubscribedCount || 0} opt-outs`}
              icon={<PersonIcon />}
              tone={campaign && campaign.bouncedCount > 0 ? "warning" : "muted"}
              loading={loading}
            />
          </div>
        </Layout.Section>

        {/* Tabs: Recipient Activity / Email Preview */}
        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={tabItems} selected={selectedTab} onSelect={setSelectedTab}>
              <div style={{ padding: "16px 20px" }}>
                {/* TAB 1: RECIPIENT ACTIVITY */}
                {selectedTab === 0 && (
                  <div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                      <div style={{ flex: 1, minWidth: "240px" }}>
                        <Filters
                          queryValue={recipientSearch}
                          filters={[]}
                          onQueryChange={(val) => {
                            setRecipientSearch(val);
                            setRecipientsPage(1);
                          }}
                          onQueryClear={() => {
                            setRecipientSearch("");
                            setRecipientsPage(1);
                          }}
                          onClearAll={() => {
                            setRecipientSearch("");
                            setRecipientStatusFilter("");
                            setRecipientsPage(1);
                          }}
                        />
                      </div>

                      <div style={{ minWidth: "160px" }}>
                        <Select
                          label="Status"
                          labelHidden
                          options={[
                            { label: "All Statuses", value: "" },
                            { label: "Delivered", value: "delivered" },
                            { label: "Opened", value: "opened" },
                            { label: "Clicked", value: "clicked" },
                            { label: "Bounced", value: "bounced" },
                            { label: "Unsubscribed", value: "unsubscribed" },
                          ]}
                          value={recipientStatusFilter}
                          onChange={(val) => {
                            setRecipientStatusFilter(val);
                            setRecipientsPage(1);
                          }}
                        />
                      </div>
                    </div>

                    <IndexTable
                      resourceName={{ singular: "recipient", plural: "recipients" }}
                      itemCount={totalRecipients}
                      selectedItemsCount={
                        allResourcesSelected ? "All" : selectedResources.length
                      }
                      onSelectionChange={handleSelectionChange}
                      headings={[
                        { title: "Recipient" },
                        { title: "Company" },
                        { title: "Type" },
                        { title: "Delivery Status" },
                        { title: "Delivered At" },
                        { title: "Opens" },
                        { title: "Clicks" },
                      ]}
                      loading={recipientsLoading}
                    >
                      {recipientRows}
                    </IndexTable>

                    {recipientsTotalPages > 1 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          padding: "16px",
                          borderTop: "1px solid #e2e8f0",
                        }}
                      >
                        <Pagination
                          hasPrevious={recipientsPage > 1}
                          onPrevious={() => setRecipientsPage((p) => Math.max(p - 1, 1))}
                          hasNext={recipientsPage < recipientsTotalPages}
                          onNext={() =>
                            setRecipientsPage((p) =>
                              Math.min(p + 1, recipientsTotalPages),
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: EMAIL PREVIEW */}
                {selectedTab === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                      <Text variant="headingSm" as="h4">
                        Sent Email Render
                      </Text>

                      <div style={{ display: "flex", gap: "10px" }}>
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

                    <div
                      style={{
                        background: previewTheme === "dark" ? "#0b1311" : "#e2e8f0",
                        padding: "24px",
                        borderRadius: "12px",
                        display: "flex",
                        justifyContent: "center",
                        minHeight: "500px",
                        transition: "background-color 0.2s",
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
                          title="Sent Campaign Preview"
                          srcDoc={previewHtml}
                          style={{
                            width: "100%",
                            minHeight: "560px",
                            border: "none",
                            borderRadius: "10px",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Test Email Modal */}
      <Modal
        open={testEmailModalOpen}
        onClose={() => {
          setTestEmailModalOpen(false);
          setTestSendResult(null);
        }}
        title="Send Test Email Preview"
        primaryAction={{
          content: "Send Preview",
          loading: actionLoading,
          onAction: handleTestSend,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: actionLoading,
            onAction: () => {
              setTestEmailModalOpen(false);
              setTestSendResult(null);
            },
          },
        ]}
      >
        <Modal.Section>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p>
              Deliver a personalized test preview of this campaign to any inbox to verify light/dark rendering.
            </p>
            <TextField
              label="Recipient Email"
              value={testRecipientEmail}
              onChange={setTestRecipientEmail}
              autoComplete="email"
              placeholder="e.g. yourname@company.com"
            />
            {testSendResult && (
              <Banner
                title={testSendResult.startsWith("Error") ? "Failed" : "Sent"}
                tone={testSendResult.startsWith("Error") ? "critical" : "success"}
              >
                <p>{testSendResult}</p>
              </Banner>
            )}
          </div>
        </Modal.Section>
      </Modal>

      {/* Send Confirmation Modal */}
      <Modal
        open={sendConfirmModalOpen}
        onClose={() => setSendConfirmModalOpen(false)}
        title="Dispatch Campaign via Resend"
        primaryAction={{
          content: "Confirm & Launch Now",
          loading: actionLoading,
          onAction: handleSendCampaign,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: actionLoading,
            onAction: () => setSendConfirmModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p>
              Are you sure you want to send <strong>"{campaign?.name}"</strong> to all targeted recipients?
            </p>
            <Banner tone="info">
              <p>
                Each recipient will receive a personalized email with delivery and engagement tracking.
              </p>
            </Banner>
          </div>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
