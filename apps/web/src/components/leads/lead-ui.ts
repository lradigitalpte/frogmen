import type { LeadPriority, LeadStage } from "@/types/lead";

export const LEAD_STAGES: LeadStage[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

/** The stages a lead moves through before it is won or lost. */
export const OPEN_STAGES: LeadStage[] = ["new", "contacted", "qualified", "proposal"];

export const stageMeta: Record<
  LeadStage,
  { label: string; short: string; color: string; empty: string }
> = {
  new: { label: "New", short: "New", color: "#4a7fb5", empty: "New leads land here" },
  contacted: { label: "Contacted", short: "Contacted", color: "#d9a441", empty: "Log a call or email to move leads here" },
  qualified: { label: "Qualified", short: "Qualified", color: "#7a6fd0", empty: "Leads with real budget and need" },
  proposal: { label: "Proposal sent", short: "Proposal", color: "#3f8f8f", empty: "Leads waiting on your quote" },
  won: { label: "Won", short: "Won", color: "#2f8a5f", empty: "Converted to customers" },
  lost: { label: "Lost", short: "Lost", color: "#c4604d", empty: "Disqualified or went elsewhere" },
};

export const NEXT_STAGE: Record<LeadStage, LeadStage | null> = {
  new: "contacted",
  contacted: "qualified",
  qualified: "proposal",
  proposal: "won",
  won: null,
  lost: null,
};

export function priorityTone(priority: LeadPriority): "critical" | "attention" | "info" {
  if (priority === "hot") return "critical";
  if (priority === "warm") return "attention";
  return "info";
}
