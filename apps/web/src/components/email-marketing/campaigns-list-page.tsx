"use client";

import {
  Badge,
  Banner,
  Button,
  ButtonGroup,
  Card,
  EmptyState,
  Filters,
  IndexTable,
  Layout,
  Modal,
  Pagination,
  Select,
  Text,
  useIndexResourceState,
} from "@shopify/polaris";
import {
  CheckIcon,
  DeleteIcon,
  EditIcon,
  EmailIcon,
  PlusIcon,
  SendIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  deleteEmailCampaign,
  getEmailCampaigns,
  sendEmailCampaign,
  type EmailCampaign,
  type ListCampaignsResponse,
} from "@/lib/email-marketing-api";

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

function getAudienceBadge(type: EmailCampaign["targetAudienceType"]) {
  switch (type) {
    case "contacts":
      return <Badge tone="info">Contacts Only</Badge>;
    case "leads":
      return <Badge tone="attention">Leads Only</Badge>;
    case "segment":
      return <Badge tone="warning">Filtered Segment</Badge>;
    case "custom":
      return <Badge>Custom Selection</Badge>;
    case "all":
    default:
      return <Badge tone="success">All Contacts & Leads</Badge>;
  }
}

export function CampaignsListPage() {
  const router = useRouter();
  const [data, setData] = useState<ListCampaignsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedAudience, setSelectedAudience] = useState<string>("");
  const [page, setPage] = useState(1);

  // Modal actions
  const [sendModalCampaign, setSendModalCampaign] = useState<EmailCampaign | null>(null);
  const [deleteModalCampaign, setDeleteModalCampaign] = useState<EmailCampaign | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getEmailCampaigns({
        page,
        perPage: 15,
        search: search || undefined,
        status: selectedStatus ? (selectedStatus as any) : undefined,
        audienceType: selectedAudience ? (selectedAudience as any) : undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load marketing campaigns");
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedStatus, selectedAudience]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleConfirmSend = async () => {
    if (!sendModalCampaign) return;
    try {
      setActionLoading(true);
      await sendEmailCampaign(sendModalCampaign.id);
      setSuccessBanner(`Campaign "${sendModalCampaign.name}" has been launched!`);
      setSendModalCampaign(null);
      fetchCampaigns();
    } catch (err: any) {
      setError(err.message || "Failed to dispatch campaign");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalCampaign) return;
    try {
      setActionLoading(true);
      await deleteEmailCampaign(deleteModalCampaign.id);
      setSuccessBanner(`Campaign "${deleteModalCampaign.name}" deleted.`);
      setDeleteModalCampaign(null);
      fetchCampaigns();
    } catch (err: any) {
      setError(err.message || "Failed to delete campaign");
    } finally {
      setActionLoading(false);
    }
  };

  const resourceName = {
    singular: "campaign",
    plural: "campaigns",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState((data?.items as any) || []);

  const stats = data?.overviewStats;
  const deliveryRate =
    stats && stats.totalSent > 0
      ? `${Math.round((stats.totalDelivered / stats.totalSent) * 100)}%`
      : "—";
  const openRate =
    stats && stats.totalDelivered > 0
      ? `${Math.round((stats.totalOpened / stats.totalDelivered) * 100)}%`
      : "—";
  const clickRate =
    stats && stats.totalOpened > 0
      ? `${Math.round((stats.totalClicked / stats.totalOpened) * 100)}%`
      : "—";

  const rowMarkup = data?.items.map((campaign, index) => {
    const formattedDate = campaign.sentAt
      ? new Date(campaign.sentAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : campaign.scheduledAt
        ? `Scheduled: ${new Date(campaign.scheduledAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}`
        : "Draft";

    const canSend = campaign.status === "draft" || campaign.status === "failed";
    const canEdit = campaign.status === "draft" || campaign.status === "scheduled";

    return (
      <IndexTable.Row
        id={campaign.id}
        key={campaign.id}
        position={index}
        selected={selectedResources.includes(campaign.id)}
      >
        <IndexTable.Cell>
          <div>
            <Button
              variant="plain"
              onClick={() =>
                router.push(`/dashboard/marketing/campaigns/${campaign.id}`)
              }
            >
              {campaign.name}
            </Button>
            <div style={{ color: "#64748b", fontSize: "13px", marginTop: "2px" }}>
              {campaign.subject}
            </div>
          </div>
        </IndexTable.Cell>

        <IndexTable.Cell>{getAudienceBadge(campaign.targetAudienceType)}</IndexTable.Cell>

        <IndexTable.Cell>{getStatusBadge(campaign.status)}</IndexTable.Cell>

        <IndexTable.Cell>
          <Text variant="bodySm" as="span" tone="subdued">
            {formattedDate}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text variant="bodyMd" as="span" fontWeight="medium">
            {campaign.totalRecipients || "—"}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          {campaign.sentCount > 0 ? (
            <div style={{ fontSize: "12px", lineHeight: "1.4" }}>
              <div>
                <strong>{campaign.deliveredCount}</strong> del. (
                {Math.round((campaign.deliveredCount / campaign.sentCount) * 100)}%)
              </div>
              <div style={{ color: "#047857" }}>
                <strong>{campaign.openedCount}</strong> opened (
                {campaign.deliveredCount > 0
                  ? Math.round((campaign.openedCount / campaign.deliveredCount) * 100)
                  : 0}
                %)
              </div>
            </div>
          ) : (
            <span style={{ color: "#94a3b8" }}>—</span>
          )}
        </IndexTable.Cell>

        <IndexTable.Cell>
          <ButtonGroup variant="segmented">
            <Button
              size="slim"
              icon={ViewIcon}
              onClick={() =>
                router.push(`/dashboard/marketing/campaigns/${campaign.id}`)
              }
            >
              View
            </Button>
            {canEdit && (
              <Button
                size="slim"
                icon={EditIcon}
                onClick={() =>
                  router.push(`/dashboard/marketing/campaigns/${campaign.id}/edit`)
                }
              >
                Edit
              </Button>
            )}
            {canSend && (
              <Button
                size="slim"
                icon={SendIcon}
                onClick={() => setSendModalCampaign(campaign)}
              >
                Send
              </Button>
            )}
            <Button
              size="slim"
              tone="critical"
              icon={DeleteIcon}
              onClick={() => setDeleteModalCampaign(campaign)}
            />
          </ButtonGroup>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <AppPage
      title="Email Marketing"
      subtitle="Broadcast targeted email campaigns to contacts and leads with real-time delivery and engagement analytics."
      primaryAction={{
        content: "Create Campaign",
        icon: PlusIcon,
        onAction: () => router.push("/dashboard/marketing/campaigns/new"),
      }}
      secondaryActions={[
        {
          content: "Email Templates",
          icon: EmailIcon,
          onAction: () => router.push("/dashboard/marketing/templates"),
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
            <Banner
              title="Error"
              tone="critical"
              onDismiss={() => setError(null)}
            >
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* KPI Metrics Header */}
        <Layout.Section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Total Sent"
              value={stats ? String(stats.totalSent) : "0"}
              hint={`${stats?.totalCampaigns || 0} total campaigns`}
              icon={<SendIcon />}
              tone="default"
              loading={loading}
            />
            <KpiCard
              label="Delivered Rate"
              value={deliveryRate}
              hint={`${stats?.totalDelivered || 0} emails delivered`}
              icon={<CheckIcon />}
              tone="success"
              loading={loading}
            />
            <KpiCard
              label="Open Rate"
              value={openRate}
              hint={`${stats?.totalOpened || 0} unique opens`}
              icon={<EmailIcon />}
              tone="success"
              loading={loading}
            />
            <KpiCard
              label="Click-Through Rate"
              value={clickRate}
              hint={`${stats?.totalClicked || 0} total clicks`}
              icon={<ViewIcon />}
              tone="default"
              loading={loading}
            />
          </div>
        </Layout.Section>

        {/* Campaigns Table Card */}
        <Layout.Section>
          <Card padding="0">
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #e2e8f0" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  <div style={{ minWidth: "260px", flex: 1 }}>
                    <Filters
                      queryValue={search}
                      filters={[]}
                      onQueryChange={(val) => {
                        setSearch(val);
                        setPage(1);
                      }}
                      onQueryClear={() => {
                        setSearch("");
                        setPage(1);
                      }}
                      onClearAll={() => {
                        setSearch("");
                        setSelectedStatus("");
                        setSelectedAudience("");
                        setPage(1);
                      }}
                    />
                  </div>

                  <div style={{ minWidth: "160px" }}>
                    <Select
                      label="Status"
                      labelHidden
                      options={[
                        { label: "All Statuses", value: "" },
                        { label: "Draft", value: "draft" },
                        { label: "Sending", value: "sending" },
                        { label: "Sent", value: "sent" },
                        { label: "Scheduled", value: "scheduled" },
                        { label: "Failed", value: "failed" },
                      ]}
                      value={selectedStatus}
                      onChange={(val) => {
                        setSelectedStatus(val);
                        setPage(1);
                      }}
                    />
                  </div>

                  <div style={{ minWidth: "180px" }}>
                    <Select
                      label="Audience"
                      labelHidden
                      options={[
                        { label: "All Audiences", value: "" },
                        { label: "Contacts Only", value: "contacts" },
                        { label: "Leads Only", value: "leads" },
                        { label: "Segment", value: "segment" },
                      ]}
                      value={selectedAudience}
                      onChange={(val) => {
                        setSelectedAudience(val);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {data?.items.length === 0 && !loading ? (
              <EmptyState
                heading="No marketing campaigns found"
                action={{
                  content: "Create First Campaign",
                  onAction: () => router.push("/dashboard/marketing/campaigns/new"),
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Create personalized email campaigns targeting your contacts, leads, or custom customer segments.
                </p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={resourceName}
                itemCount={data?.total || 0}
                selectedItemsCount={
                  allResourcesSelected ? "All" : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Campaign" },
                  { title: "Audience" },
                  { title: "Status" },
                  { title: "Date" },
                  { title: "Recipients" },
                  { title: "Performance" },
                  { title: "Actions" },
                ]}
                loading={loading}
              >
                {rowMarkup}
              </IndexTable>
            )}

            {data && data.totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "16px",
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <Pagination
                  hasPrevious={page > 1}
                  onPrevious={() => setPage((p) => Math.max(p - 1, 1))}
                  hasNext={page < data.totalPages}
                  onNext={() => setPage((p) => Math.min(p + 1, data.totalPages))}
                />
              </div>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Send Confirmation Modal */}
      <Modal
        open={Boolean(sendModalCampaign)}
        onClose={() => setSendModalCampaign(null)}
        title={`Send Campaign "${sendModalCampaign?.name}"`}
        primaryAction={{
          content: "Dispatch Now via Resend",
          loading: actionLoading,
          onAction: handleConfirmSend,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: actionLoading,
            onAction: () => setSendModalCampaign(null),
          },
        ]}
      >
        <Modal.Section>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p>
              Are you sure you want to send <strong>{sendModalCampaign?.name}</strong> to your target audience?
            </p>
            <Banner tone="info">
              <p>
                Emails will be personalized with contact/lead merge tags and dispatched via Resend. Delivery, opens, and clicks will be tracked in real-time.
              </p>
            </Banner>
          </div>
        </Modal.Section>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteModalCampaign)}
        onClose={() => setDeleteModalCampaign(null)}
        title={`Delete Campaign "${deleteModalCampaign?.name}"`}
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: actionLoading,
          onAction: handleConfirmDelete,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: actionLoading,
            onAction: () => setDeleteModalCampaign(null),
          },
        ]}
      >
        <Modal.Section>
          <p>
            Are you sure you want to delete this campaign? This action cannot be undone.
          </p>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
