export type LeadSource =
  | "website"
  | "google_ads"
  | "organic_search"
  | "linkedin"
  | "referral"
  | "cold_outreach"
  | "event"
  | "partner"
  | "direct_call"
  | "other";

export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export type LeadContactStatus =
  | "not_contacted"
  | "attempted"
  | "contacted"
  | "meeting_scheduled"
  | "proposal_sent"
  | "unresponsive";

export type LeadPriority = "hot" | "warm" | "cold";

export interface CommunicationLog {
  id: string;
  date: string;
  type: "call" | "email" | "whatsapp" | "meeting" | "note";
  author: string;
  summary: string;
  outcome?: string;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  jobTitle?: string;
  leadSource: LeadSource;
  sourceDetails?: string;
  contactStatus: LeadContactStatus;
  contacted: boolean;
  lastContactedAt: string | null;
  lastContactMethod: "email" | "phone" | "call" | "whatsapp" | "meeting" | "note" | null;
  stage: LeadStage;
  priority: LeadPriority;
  estimatedValue: number;
  score: number;
  assignedTo?: {
    id?: string;
    name: string;
    avatar?: string;
  };
  notes?: string;
  nextFollowUp: string | null;
  createdAt: string;
  updatedAt: string;
  communicationLogs: CommunicationLog[];
}

export interface LeadSourceStat {
  source: LeadSource;
  label: string;
  count: number;
  value: number;
  totalValue: number;
  percentage: number;
  conversionRate: number;
}

export interface LeadStats {
  totalLeads: number;
  totalPipelineValue: number;
  contactedCount: number;
  notContactedCount: number;
  contactedRate: number;
  contactRatePercent: number;
  qualifiedCount: number;
  wonCount: number;
  winRate: number;
  winRatePercent: number;
  followUpsDueToday: number;
  sourceBreakdown: LeadSourceStat[];
}

export interface ListLeadsParams {
  search?: string;
  leadSource?: LeadSource | "all";
  contacted?: "all" | "contacted" | "not_contacted" | "followup_due" | "true" | "false";
  stage?: LeadStage | "all";
  priority?: LeadPriority | "all";
  page?: number;
  perPage?: number;
  sortBy?: "createdAt" | "estimatedValue" | "score" | "name" | "company" | "lastContactedAt" | "nextFollowUp";
  sortOrder?: "asc" | "desc";
  sortDir?: "asc" | "desc";
}

export interface CreateLeadInput {
  name: string;
  company: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  leadSource: LeadSource;
  sourceDetails?: string;
  priority: LeadPriority;
  estimatedValue: number;
  assignedToName?: string;
  notes?: string;
  contacted?: boolean;
}

export interface UpdateLeadInput {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  leadSource?: LeadSource;
  sourceDetails?: string;
  priority?: LeadPriority;
  estimatedValue?: number;
  assignedToName?: string;
  notes?: string;
  contacted?: boolean;
  contactStatus?: LeadContactStatus;
  stage?: LeadStage;
  score?: number;
}

export interface LogContactInput {
  leadId: string;
  type: "call" | "email" | "whatsapp" | "meeting" | "note";
  summary: string;
  outcome?: string;
  nextFollowUp?: string;
  authorName?: string;
}

export interface PaginatedLeads {
  data: Lead[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}
