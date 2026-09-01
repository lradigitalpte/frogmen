import { apiFetch } from "./api";
import type {
  CreateEmailCampaignInput,
  CreateEmailTemplateInput,
  EmailCampaignStatus,
  EmailDesignConfig,
  ListEmailCampaignsQuery,
  RecipientDeliveryStatus,
  TargetAudienceFilter,
  TestSendCampaignInput,
  UpdateEmailCampaignInput,
  UpdateEmailTemplateInput,
} from "@frog1/shared";

export interface EmailTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  category: "announcement" | "promotion" | "newsletter" | "onboarding" | "outreach" | "custom";
  subject: string;
  previewText?: string | null;
  bodyHtml: string;
  bodyText?: string | null;
  designConfig?: EmailDesignConfig | null;
  isSystemPreset: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaign {
  id: string;
  organizationId: string;
  name: string;
  subject: string;
  previewText?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  templateId?: string | null;
  bodyHtml: string;
  bodyText?: string | null;
  designConfig?: EmailDesignConfig | null;
  targetAudienceType: "all" | "contacts" | "leads" | "segment" | "custom";
  audienceFilter?: TargetAudienceFilter | null;
  status: EmailCampaignStatus;
  scheduledAt?: string | null;
  sentAt?: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignRecipient {
  id: string;
  campaignId: string;
  organizationId: string;
  recipientType: "contact" | "lead" | "custom";
  contactId?: string | null;
  leadId?: string | null;
  email: string;
  name?: string | null;
  company?: string | null;
  status: RecipientDeliveryStatus;
  resendEmailId?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  openedAt?: string | null;
  openCount: number;
  clickedAt?: string | null;
  clickCount: number;
  lastClickedUrl?: string | null;
  bouncedAt?: string | null;
  errorMessage?: string | null;
  trackingToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCampaignsResponse {
  items: EmailCampaign[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  overviewStats: {
    totalCampaigns: number;
    totalSent: number;
    totalDelivered: number;
    totalOpened: number;
    totalClicked: number;
    totalBounced: number;
  };
}

export interface AudiencePreviewResponse {
  totalCount: number;
  activeCount?: number;
  contactCount: number;
  leadCount: number;
  customCount: number;
  sampleRecipients: Array<{
    recipientType: "contact" | "lead" | "custom";
    contactId?: string;
    leadId?: string;
    email: string;
    name: string;
    company: string;
    jobTitle?: string;
  }>;
}

// Templates API
export async function getEmailTemplates(search?: string): Promise<EmailTemplate[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch<EmailTemplate[]>(`/api/v1/email-marketing/templates${params}`);
}

export async function getEmailTemplate(id: string): Promise<EmailTemplate> {
  return apiFetch<EmailTemplate>(`/api/v1/email-marketing/templates/${id}`);
}

export async function createEmailTemplate(input: CreateEmailTemplateInput): Promise<EmailTemplate> {
  return apiFetch<EmailTemplate>("/api/v1/email-marketing/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateEmailTemplate(
  id: string,
  input: UpdateEmailTemplateInput,
): Promise<EmailTemplate> {
  return apiFetch<EmailTemplate>(`/api/v1/email-marketing/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteEmailTemplate(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/v1/email-marketing/templates/${id}`, {
    method: "DELETE",
  });
}

// Campaigns API
export async function getEmailCampaigns(
  query?: Partial<ListEmailCampaignsQuery>,
): Promise<ListCampaignsResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.perPage) params.set("perPage", String(query.perPage));
  if (query?.search) params.set("search", query.search);
  if (query?.status) params.set("status", query.status);
  if (query?.audienceType) params.set("audienceType", query.audienceType);
  if (query?.sortBy) params.set("sortBy", query.sortBy);
  if (query?.sortOrder) params.set("sortOrder", query.sortOrder);

  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ListCampaignsResponse>(`/api/v1/email-marketing/campaigns${qs}`);
}

export async function getEmailCampaign(id: string): Promise<EmailCampaign> {
  return apiFetch<EmailCampaign>(`/api/v1/email-marketing/campaigns/${id}`);
}

export async function createEmailCampaign(
  input: CreateEmailCampaignInput,
): Promise<EmailCampaign> {
  return apiFetch<EmailCampaign>("/api/v1/email-marketing/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateEmailCampaign(
  id: string,
  input: UpdateEmailCampaignInput,
): Promise<EmailCampaign> {
  return apiFetch<EmailCampaign>(`/api/v1/email-marketing/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteEmailCampaign(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/v1/email-marketing/campaigns/${id}`, {
    method: "DELETE",
  });
}

export async function sendEmailCampaign(id: string): Promise<EmailCampaign> {
  return apiFetch<EmailCampaign>(`/api/v1/email-marketing/campaigns/${id}/send`, {
    method: "POST",
  });
}

export async function testSendEmailCampaign(
  input: TestSendCampaignInput,
): Promise<{ success: boolean; mode: string; resendId?: string; recipient: string }> {
  return apiFetch<{ success: boolean; mode: string; resendId?: string; recipient: string }>(
    "/api/v1/email-marketing/test-send",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getAudiencePreview(
  filter?: TargetAudienceFilter,
): Promise<AudiencePreviewResponse> {
  return apiFetch<AudiencePreviewResponse>("/api/v1/email-marketing/audience-preview", {
    method: "POST",
    body: JSON.stringify(filter || {}),
  });
}

export async function getCampaignRecipients(
  campaignId: string,
  query?: { status?: string; search?: string; page?: number; perPage?: number },
): Promise<{
  items: EmailCampaignRecipient[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  if (query?.search) params.set("search", query.search);
  if (query?.page) params.set("page", String(query.page));
  if (query?.perPage) params.set("perPage", String(query.perPage));

  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{
    items: EmailCampaignRecipient[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }>(`/api/v1/email-marketing/campaigns/${campaignId}/recipients${qs}`);
}

export async function submitUnsubscribe(
  token: string,
  reason?: string,
): Promise<{ success: boolean; email: string; message: string }> {
  return apiFetch<{ success: boolean; email: string; message: string }>(
    "/api/v1/email-marketing/unsubscribe",
    {
      method: "POST",
      body: JSON.stringify({ token, reason }),
    },
  );
}
