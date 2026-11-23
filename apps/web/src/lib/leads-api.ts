import { apiFetch } from "./api";
import type {
  CommunicationLog,
  CreateLeadInput,
  Lead,
  LeadContactStatus,
  LeadPriority,
  LeadSource,
  LeadStage,
  LeadStats,
  ListLeadsParams,
  LogContactInput,
  PaginatedLeads,
  UpdateLeadInput,
} from "@/types/lead";

/*
 * Leads are stored on the server (NestJS `/api/v1/leads`). Every function here
 * talks to the API directly and returns the saved record, so the UI always
 * shows what is in the database — no browser-only copies.
 */

/** Shape the API returns (Drizzle row: numerics as strings, dates as ISO). */
interface ApiLead {
  id: string;
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  leadSource: LeadSource;
  sourceDetails: string | null;
  contactStatus: LeadContactStatus;
  contacted: boolean;
  lastContactedAt: string | null;
  lastContactMethod: Lead["lastContactMethod"] | string | null;
  stage: LeadStage;
  priority: LeadPriority;
  estimatedValue: string | number | null;
  score: number | null;
  assignedToName: string | null;
  notes: string | null;
  nextFollowUp: string | null;
  createdAt: string;
  updatedAt: string;
  communicationLogs?: Array<{
    id: string;
    type: CommunicationLog["type"];
    author: string;
    summary: string;
    outcome: string | null;
    date: string;
  }>;
}

interface ApiLeadStats {
  totalLeads: number;
  contactedLeads: number;
  contactRatePercent: number;
  qualifiedLeads: number;
  wonLeads: number;
  winRatePercent: number;
  totalPipelineValue: number;
  followUpsDueToday: number;
  sourceBreakdown: Array<{
    source: LeadSource;
    count: number;
    totalValue: number;
    percentage: number;
  }>;
}

export function normalizeLead(raw: ApiLead): Lead {
  const lead: Lead = {
    id: raw.id,
    name: raw.name,
    company: raw.company,
    email: raw.email ?? "",
    phone: raw.phone ?? "",
    jobTitle: raw.jobTitle ?? undefined,
    leadSource: raw.leadSource,
    sourceDetails: raw.sourceDetails ?? undefined,
    contactStatus: raw.contactStatus,
    contacted: Boolean(raw.contacted),
    lastContactedAt: raw.lastContactedAt,
    lastContactMethod: (raw.lastContactMethod as Lead["lastContactMethod"]) ?? null,
    stage: raw.stage,
    priority: raw.priority,
    estimatedValue: Number(raw.estimatedValue) || 0,
    score: raw.score ?? 0,
    assignedTo: raw.assignedToName ? { name: raw.assignedToName } : undefined,
    notes: raw.notes ?? undefined,
    nextFollowUp: raw.nextFollowUp,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    communicationLogs: (raw.communicationLogs ?? []).map((log) => ({
      id: log.id,
      type: log.type,
      author: log.author,
      summary: log.summary,
      outcome: log.outcome ?? undefined,
      date: log.date,
    })),
  };
  // The stored score is only set at creation; recompute from current signals.
  lead.score = calculateLeadScore(lead);
  return lead;
}

function toQuery(params: ListLeadsParams) {
  const search = new URLSearchParams();
  if (params.search?.trim()) search.set("search", params.search.trim());
  if (params.leadSource && params.leadSource !== "all") search.set("leadSource", params.leadSource);
  // The API understands contacted=true|false. "followup_due" is filtered client-side.
  if (params.contacted === "contacted" || params.contacted === "true") search.set("contacted", "true");
  if (params.contacted === "not_contacted" || params.contacted === "false") search.set("contacted", "false");
  if (params.stage && params.stage !== "all") search.set("stage", params.stage);
  if (params.priority && params.priority !== "all") search.set("priority", params.priority);
  if (params.page) search.set("page", String(params.page));
  search.set("perPage", String(params.perPage ?? 100));
  if (params.sortBy && params.sortBy !== "lastContactedAt") search.set("sortBy", params.sortBy);
  const order = params.sortOrder ?? params.sortDir;
  if (order) search.set("sortOrder", order);
  return `?${search.toString()}`;
}

export function isFollowUpDue(lead: Lead, now = new Date()) {
  return Boolean(
    lead.nextFollowUp &&
      new Date(lead.nextFollowUp) <= now &&
      lead.stage !== "won" &&
      lead.stage !== "lost",
  );
}

/** List leads from the API (up to 100 per page). */
export async function listLeads(params: ListLeadsParams = {}): Promise<PaginatedLeads> {
  const res = await apiFetch<{ data: ApiLead[]; meta: PaginatedLeads["meta"] }>(
    `/api/v1/leads${toQuery(params)}`,
  );
  let data = res.data.map(normalizeLead);
  if (params.contacted === "followup_due") {
    data = data.filter((lead) => isFollowUpDue(lead));
  }
  return { data, meta: res.meta };
}

/** Pipeline statistics for the whole organization. */
export async function getLeadStats(): Promise<LeadStats> {
  const raw = await apiFetch<ApiLeadStats>("/api/v1/leads/stats");
  const breakdown = raw.sourceBreakdown.map((row) => ({
    source: row.source,
    label: sourceLabel(row.source),
    count: row.count,
    value: row.totalValue,
    totalValue: row.totalValue,
    percentage: row.percentage,
    conversionRate: 0,
  }));
  return {
    totalLeads: raw.totalLeads,
    totalPipelineValue: raw.totalPipelineValue,
    contactedCount: raw.contactedLeads,
    notContactedCount: Math.max(0, raw.totalLeads - raw.contactedLeads),
    contactedRate: raw.contactRatePercent,
    contactRatePercent: raw.contactRatePercent,
    qualifiedCount: raw.qualifiedLeads,
    wonCount: raw.wonLeads,
    winRate: raw.winRatePercent,
    winRatePercent: raw.winRatePercent,
    followUpsDueToday: raw.followUpsDueToday,
    sourceBreakdown: breakdown.sort((a, b) => b.count - a.count),
  };
}

/** One lead, including its communication history. */
export async function getLead(id: string): Promise<Lead> {
  return normalizeLead(await apiFetch<ApiLead>(`/api/v1/leads/${id}`));
}

/**
 * Lead score (0–100) from priority, stage, engagement and deal size.
 */
export function calculateLeadScore(lead: Partial<Lead>): number {
  let score = 0;
  if (lead.priority === "hot") score += 40;
  else if (lead.priority === "warm") score += 25;
  else score += 10;

  if (lead.stage === "won") score += 50;
  else if (lead.stage === "proposal") score += 40;
  else if (lead.stage === "qualified") score += 30;
  else if (lead.stage === "contacted") score += 20;
  else if (lead.stage === "new") score += 10;
  else if (lead.stage === "lost") score = 5;

  if (lead.contacted) score += 10;
  score += Math.min((lead.communicationLogs?.length || 0) * 5, 15);

  const value = lead.estimatedValue || 0;
  if (value >= 50000) score += 10;
  else if (value >= 10000) score += 5;

  return Math.min(Math.max(score, 0), 100);
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const created = await apiFetch<ApiLead>("/api/v1/leads", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      assignedToName:
        input.assignedToName && input.assignedToName !== "none" ? input.assignedToName : undefined,
      contacted: Boolean(input.contacted),
      estimatedValue: Number(input.estimatedValue) || 0,
    }),
  });
  return normalizeLead(created);
}

export async function updateLead(id: string, input: UpdateLeadInput): Promise<Lead> {
  const updated = await apiFetch<ApiLead>(`/api/v1/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return normalizeLead(updated);
}

export async function updateLeadStage(id: string, stage: LeadStage): Promise<Lead> {
  const updated = await apiFetch<ApiLead>(`/api/v1/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  });
  return normalizeLead(updated);
}

/** Record a call/email/meeting; returns the lead with its refreshed history. */
export async function logLeadContact(input: LogContactInput): Promise<Lead> {
  const { leadId, ...body } = input;
  await apiFetch<{ lead: ApiLead }>(`/api/v1/leads/${leadId}/contact-log`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return getLead(leadId);
}

/** Creates a customer from the lead and marks the lead as won. */
export async function convertLeadToCustomer(
  id: string,
): Promise<{ lead: Lead; customerId: string | null }> {
  const res = await apiFetch<{ lead: ApiLead; customer?: { id: string } }>(
    `/api/v1/leads/${id}/convert`,
    { method: "POST" },
  );
  return { lead: normalizeLead(res.lead), customerId: res.customer?.id ?? null };
}

export async function deleteLead(id: string): Promise<void> {
  await apiFetch(`/api/v1/leads/${id}`, { method: "DELETE" });
}

// Helpers for badges & labels
export function sourceLabel(source: LeadSource): string {
  const MAP: Record<LeadSource, string> = {
    website: "Website Form",
    google_ads: "Google Ads",
    organic_search: "Organic Search / SEO",
    linkedin: "LinkedIn Outreach",
    referral: "Customer Referral",
    cold_outreach: "Cold Email / Call",
    event: "Trade Show / Event",
    partner: "Partner Network",
    direct_call: "Direct Call",
    other: "Other",
  };
  return MAP[source] || source;
}

export function sourceBadgeVariant(
  source: LeadSource,
): "info" | "success" | "warning" | "neutral" {
  switch (source) {
    case "website":
    case "organic_search":
      return "info";
    case "referral":
    case "partner":
      return "success";
    case "google_ads":
    case "linkedin":
      return "warning";
    default:
      return "neutral";
  }
}

export function stageLabel(stage: LeadStage): string {
  const MAP: Record<LeadStage, string> = {
    new: "New Lead",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal: "Proposal Sent",
    won: "Won / Converted",
    lost: "Lost / Disqualified",
  };
  return MAP[stage] || stage;
}

export function stageBadgeVariant(
  stage: LeadStage,
): "info" | "success" | "warning" | "destructive" | "neutral" {
  switch (stage) {
    case "new":
      return "info";
    case "contacted":
      return "warning";
    case "qualified":
    case "proposal":
      return "info";
    case "won":
      return "success";
    case "lost":
      return "destructive";
    default:
      return "neutral";
  }
}

export function priorityLabel(priority: LeadPriority): string {
  return priority.toUpperCase();
}

export function priorityBadgeVariant(
  priority: LeadPriority,
): "destructive" | "warning" | "info" {
  switch (priority) {
    case "hot":
      return "destructive";
    case "warm":
      return "warning";
    case "cold":
      return "info";
  }
}

export function contactStatusLabel(status: LeadContactStatus): string {
  const MAP: Record<LeadContactStatus, string> = {
    not_contacted: "Not Contacted",
    attempted: "Attempted Contact",
    contacted: "Contacted",
    meeting_scheduled: "Meeting Scheduled",
    proposal_sent: "Proposal Sent",
    unresponsive: "Unresponsive",
  };
  return MAP[status] || status;
}

export function contactStatusVariant(
  status: LeadContactStatus,
): "info" | "success" | "warning" | "destructive" | "neutral" {
  switch (status) {
    case "not_contacted":
      return "neutral";
    case "attempted":
    case "unresponsive":
      return "warning";
    case "contacted":
    case "proposal_sent":
      return "info";
    case "meeting_scheduled":
      return "success";
    default:
      return "neutral";
  }
}
