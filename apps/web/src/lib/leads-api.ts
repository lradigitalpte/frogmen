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

// Storage Key
const STORAGE_KEY = "frogmen_leads_db_v2";

/**
 * Empty Initial Seeds - All mock data cleared per request
 */
const INITIAL_MOCK_LEADS: Lead[] = [];

/**
 * Local Reactive Store helper for offline / instant UI feedback
 */
function getStoredLeads(): Lead[] {
  if (typeof window === "undefined") return INITIAL_MOCK_LEADS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_MOCK_LEADS));
      return INITIAL_MOCK_LEADS;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read leads from localStorage", err);
    return INITIAL_MOCK_LEADS;
  }
}

function saveStoredLeads(leads: Lead[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  } catch (err) {
    console.error("Failed to save leads to localStorage", err);
  }
}

function toQuery(params: ListLeadsParams) {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.leadSource && params.leadSource !== "all") search.set("leadSource", params.leadSource);
  if (params.contacted && params.contacted !== "all") search.set("contacted", params.contacted);
  if (params.stage && params.stage !== "all") search.set("stage", params.stage);
  if (params.priority && params.priority !== "all") search.set("priority", params.priority);
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("perPage", String(params.perPage));
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.sortOrder) search.set("sortOrder", params.sortOrder);

  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * List Leads with API Fetch & Local Storage Fallback
 */
export function listLeads(params: ListLeadsParams = {}): PaginatedLeads {
  let leads = getStoredLeads();

  // Search filter
  if (params.search?.trim()) {
    const term = params.search.trim().toLowerCase();
    leads = leads.filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        l.company.toLowerCase().includes(term) ||
        (l.email && l.email.toLowerCase().includes(term)) ||
        (l.sourceDetails && l.sourceDetails.toLowerCase().includes(term)) ||
        (l.jobTitle && l.jobTitle.toLowerCase().includes(term)),
    );
  }

  // Source filter
  if (params.leadSource && params.leadSource !== "all") {
    leads = leads.filter((l) => l.leadSource === params.leadSource);
  }

  // Contacted filter
  if (params.contacted && params.contacted !== "all") {
    const isContacted = params.contacted === "true" || params.contacted === "contacted";
    leads = leads.filter((l) => l.contacted === isContacted);
  }

  // Stage filter
  if (params.stage && params.stage !== "all") {
    leads = leads.filter((l) => l.stage === params.stage);
  }

  // Priority filter
  if (params.priority && params.priority !== "all") {
    leads = leads.filter((l) => l.priority === params.priority);
  }

  // Sort
  const sortBy = params.sortBy || "createdAt";
  const sortOrder = params.sortOrder || "desc";

  leads.sort((a, b) => {
    let valA: any = a[sortBy as keyof Lead] ?? "";
    let valB: any = b[sortBy as keyof Lead] ?? "";

    if (sortBy === "createdAt" || sortBy === "nextFollowUp") {
      valA = new Date(valA || 0).getTime();
      valB = new Date(valB || 0).getTime();
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const page = params.page || 1;
  const perPage = params.perPage || 20;
  const total = leads.length;
  const totalPages = Math.ceil(total / perPage) || 1;
  const start = (page - 1) * perPage;
  const data = leads.slice(start, start + perPage);

  // Trigger background sync with NestJS API
  apiFetch<PaginatedLeads>(`/api/v1/leads${toQuery(params)}`)
    .then((res) => {
      if (res && Array.isArray(res.data)) {
        saveStoredLeads(res.data);
      }
    })
    .catch(() => {
      // Backend api offline or fallback
    });

  return {
    data,
    meta: {
      page,
      perPage,
      total,
      totalPages,
    },
  };
}

/**
 * Get Aggregated Lead Statistics
 */
export function getLeadStats(): LeadStats {
  const leads = getStoredLeads();
  const totalLeads = leads.length;
  const contactedCount = leads.filter((l) => l.contacted).length;
  const notContactedCount = totalLeads - contactedCount;
  const contactedRate = totalLeads > 0 ? Math.round((contactedCount / totalLeads) * 100) : 0;
  const qualifiedCount = leads.filter(
    (l) => l.stage === "qualified" || l.stage === "proposal",
  ).length;
  const wonCount = leads.filter((l) => l.stage === "won").length;
  const winRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;
  const totalPipelineValue = leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  const nowIso = new Date().toISOString();
  const followUpsDueToday = leads.filter(
    (l) =>
      l.nextFollowUp &&
      l.nextFollowUp <= nowIso &&
      l.stage !== "won" &&
      l.stage !== "lost",
  ).length;

  const sourceMap: Record<string, { count: number; wonCount: number; value: number }> = {};

  leads.forEach((l) => {
    const src = l.leadSource;
    if (!sourceMap[src]) {
      sourceMap[src] = { count: 0, wonCount: 0, value: 0 };
    }
    sourceMap[src].count += 1;
    if (l.stage === "won") {
      sourceMap[src].wonCount += 1;
    }
    sourceMap[src].value += (l.estimatedValue || 0);
  });

  const sourceBreakdown = Object.entries(sourceMap).map(([source, item]) => ({
    source: source as LeadSource,
    label: sourceLabel(source as LeadSource),
    count: item.count,
    value: item.value,
    totalValue: item.value,
    percentage: totalLeads > 0 ? Math.round((item.count / totalLeads) * 100) : 0,
    conversionRate: item.count > 0 ? Math.round((item.wonCount / item.count) * 100) : 0,
  }));

  return {
    totalLeads,
    totalPipelineValue,
    contactedCount,
    notContactedCount,
    contactedRate,
    contactRatePercent: contactedRate,
    qualifiedCount,
    wonCount,
    winRate,
    winRatePercent: winRate,
    followUpsDueToday,
    sourceBreakdown,
  };
}

/**
 * Get Single Lead Record
 */
export function getLead(id: string): Lead | null {
  const leads = getStoredLeads();
  return leads.find((l) => l.id === id) || null;
}

/**
 * Calculate Lead Score (0 - 100) based on signals:
 * - Priority Level (Hot: 40pts, Warm: 25pts, Cold: 10pts)
 * - Pipeline Stage Progress (Won: 50pts, Proposal: 40pts, Qualified: 30pts, Contacted: 20pts, New: 10pts, Lost: 5pts)
 * - Engagement & Touchpoints (Contacted: +10pts, Touchpoints: +5pts each up to 15pts)
 * - Deal Valuation (>= 50k: +10pts, >= 10k: +5pts)
 */
export function calculateLeadScore(lead: Partial<Lead>): number {
  let score = 0;

  // Priority Signal
  if (lead.priority === "hot") score += 40;
  else if (lead.priority === "warm") score += 25;
  else score += 10;

  // Stage Progression
  if (lead.stage === "won") score += 50;
  else if (lead.stage === "proposal") score += 40;
  else if (lead.stage === "qualified") score += 30;
  else if (lead.stage === "contacted") score += 20;
  else if (lead.stage === "new") score += 10;
  else if (lead.stage === "lost") score = 5;

  // Outreach & Touchpoint Engagement
  if (lead.contacted) score += 10;
  const touchpointCount = lead.communicationLogs?.length || 0;
  score += Math.min(touchpointCount * 5, 15);

  // Valuation Weight
  const val = lead.estimatedValue || 0;
  if (val >= 50000) score += 10;
  else if (val >= 10000) score += 5;

  return Math.min(Math.max(score, 0), 100);
}

/**
 * Create Lead Record
 */
export function createLead(input: CreateLeadInput): Lead {
  const leads = getStoredLeads();
  const now = new Date().toISOString();

  const draft: Partial<Lead> = {
    name: input.name,
    company: input.company,
    email: input.email || "",
    phone: input.phone || "",
    jobTitle: input.jobTitle || undefined,
    leadSource: input.leadSource,
    sourceDetails: input.sourceDetails || undefined,
    contactStatus: input.contacted ? "contacted" : "not_contacted",
    contacted: !!input.contacted,
    lastContactedAt: input.contacted ? now : null,
    lastContactMethod: input.contacted ? "email" : null,
    stage: "new",
    priority: input.priority,
    estimatedValue: input.estimatedValue || 0,
    assignedTo: input.assignedToName && input.assignedToName !== "none"
      ? { name: input.assignedToName }
      : undefined,
    notes: input.notes || undefined,
    nextFollowUp: null,
    communicationLogs: input.contacted
      ? [
          {
            id: `log_${Date.now()}`,
            type: "email",
            date: now,
            author: input.assignedToName || "Sales Rep",
            summary: "Initial outreach message sent.",
          },
        ]
      : [],
    createdAt: now,
    updatedAt: now,
  };

  const newLead: Lead = {
    ...draft as any,
    id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    score: calculateLeadScore(draft),
  };

  const updated = [newLead, ...leads];
  saveStoredLeads(updated);

  // Async push to NestJS API
  apiFetch<Lead>("/api/v1/leads", {
    method: "POST",
    body: JSON.stringify(input),
  }).catch(() => {});

  return newLead;
}

/**
 * Update Lead Record
 */
export function updateLead(id: string, input: UpdateLeadInput): Lead | null {
  const leads = getStoredLeads();
  const index = leads.findIndex((l) => l.id === id);
  if (index === -1) return null;

  const target = leads[index];
  const now = new Date().toISOString();

  const isContactedNow = input.contacted !== undefined ? input.contacted : target.contacted;
  const lastContactedAt = target.lastContactedAt || (isContactedNow ? now : null);

  const updatedLead: Lead = {
    ...target,
    ...input,
    contacted: isContactedNow,
    lastContactedAt,
    assignedTo: input.assignedToName !== undefined
      ? input.assignedToName && input.assignedToName !== "none"
        ? { name: input.assignedToName }
        : undefined
      : target.assignedTo,
    updatedAt: now,
  };

  updatedLead.score = calculateLeadScore(updatedLead);

  leads[index] = updatedLead;
  saveStoredLeads(leads);

  apiFetch<Lead>(`/api/v1/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).catch(() => {});

  return updatedLead;
}

/**
 * Update Pipeline Stage
 */
export function updateLeadStage(id: string, newStage: LeadStage): Lead | null {
  const leads = getStoredLeads();
  const leadIndex = leads.findIndex((l) => l.id === id);
  if (leadIndex === -1) return null;

  const now = new Date().toISOString();
  const target = leads[leadIndex];

  const isAdvancedOutreach = newStage !== "new" && newStage !== "lost";
  const contacted = target.contacted || isAdvancedOutreach;
  const lastContactedAt = target.lastContactedAt || (contacted ? now : null);
  const contactStatus = contacted && target.contactStatus === "not_contacted" ? "contacted" : target.contactStatus;

  const updatedLead: Lead = {
    ...target,
    stage: newStage,
    contacted,
    contactStatus,
    lastContactedAt,
    updatedAt: now,
  };

  updatedLead.score = calculateLeadScore(updatedLead);

  leads[leadIndex] = updatedLead;
  saveStoredLeads(leads);

  // Sync to NestJS API
  apiFetch<Lead>(`/api/v1/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage: newStage }),
  }).catch(() => {});

  return updatedLead;
}

/**
 * Log Contact Touchpoint
 */
export function logLeadContact(input: LogContactInput): Lead | null {
  const leads = getStoredLeads();
  const leadIndex = leads.findIndex((l) => l.id === input.leadId);
  if (leadIndex === -1) return null;

  const now = new Date().toISOString();
  const target = leads[leadIndex];

  const newLog: CommunicationLog = {
    id: `log_${Date.now()}`,
    type: input.type,
    date: now,
    author: input.authorName || "Sales Rep",
    summary: input.summary,
    outcome: input.outcome || undefined,
  };

  const updatedLogs = [newLog, ...(target.communicationLogs || [])];
  const nextStage = target.stage === "new" ? "contacted" : target.stage;

  const updatedLead: Lead = {
    ...target,
    contacted: true,
    contactStatus: input.type === "meeting" ? "meeting_scheduled" : "contacted",
    lastContactedAt: now,
    lastContactMethod: input.type,
    stage: nextStage,
    nextFollowUp: input.nextFollowUp || target.nextFollowUp,
    communicationLogs: updatedLogs,
    updatedAt: now,
  };

  updatedLead.score = calculateLeadScore(updatedLead);

  leads[leadIndex] = updatedLead;
  saveStoredLeads(leads);

  // Sync to NestJS API
  apiFetch<{ lead: Lead }>(`/api/v1/leads/${input.leadId}/contact-log`, {
    method: "POST",
    body: JSON.stringify(input),
  }).catch(() => {});

  return updatedLead;
}

/**
 * Convert Lead to Customer
 */
export function convertLeadToCustomer(id: string): Lead | null {
  const updated = updateLeadStage(id, "won");

  apiFetch<{ lead: Lead }>(`/api/v1/leads/${id}/convert`, {
    method: "POST",
  }).catch(() => {});

  return updated;
}

/**
 * Delete Lead Record
 */
export function deleteLead(id: string): boolean {
  const leads = getStoredLeads();
  const filtered = leads.filter((l) => l.id !== id);
  if (filtered.length === leads.length) return false;

  saveStoredLeads(filtered);

  apiFetch(`/api/v1/leads/${id}`, {
    method: "DELETE",
  }).catch(() => {});

  return true;
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
