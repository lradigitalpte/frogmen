import type { RovProjectStatus } from "@/types/rov";

export const ROV_STATUS: Record<RovProjectStatus, { label: string; tone?: "success" | "attention" | "info" }> = {
  draft: { label: "Draft" },
  in_progress: { label: "In progress", tone: "attention" },
  completed: { label: "Completed", tone: "success" },
  archived: { label: "Archived", tone: "info" },
};

export const ROV_STEPS = ["Project", "Structures", "Media", "Findings", "Report shared"] as const;

export interface RovProgressInput {
  id: string;
  structureCount?: number;
  mediaCount?: number;
  findingCount?: number;
  reportStatus?: "draft" | "final" | "shared" | null;
}

/** How far a job has got, and the one thing to do next. */
export function rovJobProgress(p: RovProgressInput) {
  const base = `/dashboard/rov/projects/${p.id}`;
  const structures = p.structureCount ?? 0;
  const media = p.mediaCount ?? 0;
  const findings = p.findingCount ?? 0;
  const done = [true, structures > 0, media > 0, findings > 0, p.reportStatus === "shared"];
  const step = done.filter(Boolean).length;
  let next: { label: string; url: string };
  if (structures === 0) next = { label: "Add structures", url: `${base}?tab=structures` };
  else if (media === 0) next = { label: "Upload media", url: `${base}?tab=media` };
  else if (findings === 0) next = { label: "Log findings", url: `${base}?tab=observations` };
  else if (!p.reportStatus) next = { label: "Write report", url: `${base}?tab=reports` };
  else if (p.reportStatus !== "shared") next = { label: "Share report", url: `${base}?tab=reports` };
  else next = { label: "Open", url: base };
  return { done, step, next };
}
