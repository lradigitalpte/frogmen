"use client";

import { useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  contactStatusLabel,
  priorityBadgeVariant,
  priorityLabel,
  sourceLabel,
  updateLeadStage,
} from "@/lib/leads-api";
import type { Lead, LeadStage } from "@/types/lead";
import {
  ArrowRight,
  Building2,
  Clock,
  GripVertical,
  MessageSquare,
  Sparkles,
} from "lucide-react";

interface LeadKanbanProps {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onLogContact: (lead: Lead) => void;
  onLeadUpdated: (lead: Lead) => void;
}

const STAGES: {
  id: LeadStage;
  title: string;
  dotColor: string;
  badgeBg: string;
}[] = [
  {
    id: "new",
    title: "New Leads",
    dotColor: "bg-blue-500",
    badgeBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  {
    id: "contacted",
    title: "Contacted",
    dotColor: "bg-amber-500",
    badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  {
    id: "qualified",
    title: "Qualified",
    dotColor: "bg-indigo-500",
    badgeBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  },
  {
    id: "proposal",
    title: "Proposal Sent",
    dotColor: "bg-purple-500",
    badgeBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  {
    id: "won",
    title: "Won / Converted",
    dotColor: "bg-emerald-500",
    badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  {
    id: "lost",
    title: "Lost / Disqualified",
    dotColor: "bg-rose-500",
    badgeBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
];

export function LeadKanban({
  leads,
  onSelectLead,
  onLogContact,
  onLeadUpdated,
}: LeadKanbanProps) {
  const { formatBaseMoney } = useOrgCurrency();
  const [dragOverCol, setDragOverCol] = useState<LeadStage | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggedLeadIdRef = useRef<string | null>(null);

  const handleDrop = (targetStage: LeadStage, eventLeadId?: string) => {
    const leadId = eventLeadId || draggedLeadIdRef.current || draggingId;
    setDragOverCol(null);
    setDraggingId(null);
    draggedLeadIdRef.current = null;

    if (!leadId) return;

    const updated = updateLeadStage(leadId, targetStage);
    if (updated) {
      onLeadUpdated(updated);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-2 scrollbar-thin">
      {STAGES.map((col) => {
        const stageLeads = leads.filter((l) => l.stage === col.id);
        const colTotalValue = stageLeads.reduce(
          (sum, l) => sum + (l.estimatedValue || 0),
          0,
        );
        const isTarget = dragOverCol === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverCol !== col.id) setDragOverCol(col.id);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOverCol(col.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverCol(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const leadId = e.dataTransfer.getData("text/plain");
              handleDrop(col.id, leadId);
            }}
            className={`flex flex-col rounded-2xl border transition-all duration-200 min-w-[300px] max-w-[320px] flex-1 shrink-0 p-3.5 ${
              isTarget
                ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-lg scale-[1.01]"
                : "border-border/70 bg-card/60 dark:bg-muted/10 backdrop-blur-xs"
            }`}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${col.dotColor}`} />
                <h3 className="font-bold text-sm text-foreground tracking-tight">
                  {col.title}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full font-extrabold bg-muted text-foreground border shadow-2xs">
                  {stageLeads.length}
                </span>
              </div>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {formatBaseMoney(colTotalValue)}
              </div>
            </div>

            {/* Drop Hint Banner when dragging */}
            {isTarget && (
              <div className="mb-3 py-2 px-3 rounded-lg border border-dashed border-primary/60 bg-primary/10 text-primary text-xs font-semibold text-center animate-pulse flex items-center justify-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Drop lead into {col.title}
              </div>
            )}

            {/* Column Cards Container */}
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-270px)] pr-0.5">
              {stageLeads.length === 0 ? (
                <div className="text-center py-10 text-xs text-muted-foreground border border-dashed border-border/80 rounded-xl bg-background/30 p-4">
                  <p className="font-medium">No leads in stage</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    Drag cards here or click "Advance"
                  </p>
                </div>
              ) : (
                stageLeads.map((lead) => {
                  const isBeingDragged = draggingId === lead.id;

                  return (
                    <div
                      key={lead.id}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", lead.id);
                        e.dataTransfer.effectAllowed = "move";
                        draggedLeadIdRef.current = lead.id;
                        setDraggingId(lead.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverCol(null);
                        draggedLeadIdRef.current = null;
                      }}
                      onClick={() => onSelectLead(lead)}
                      className={`group relative bg-card hover:bg-card/95 border border-border/80 hover:border-primary/50 rounded-xl p-4 shadow-2xs hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing space-y-3 ${
                        isBeingDragged ? "opacity-40 scale-95 border-dashed border-primary" : ""
                      }`}
                    >
                      {/* Drag Handle & Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                          <div>
                            <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">
                              {lead.name}
                            </h4>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="truncate font-medium text-foreground/80">
                                {lead.company}
                              </span>
                            </div>
                          </div>
                        </div>

                        <StatusBadge
                          variant={priorityBadgeVariant(lead.priority)}
                          className="shrink-0 text-[10px] font-bold"
                        >
                          {priorityLabel(lead.priority)}
                        </StatusBadge>
                      </div>

                      {/* Source & Contact Status Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/15">
                          {sourceLabel(lead.leadSource)}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            lead.contacted
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                          }`}
                        >
                          {contactStatusLabel(lead.contactStatus)}
                        </span>
                      </div>

                      {/* Card Footer Info */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {lead.lastContactedAt
                              ? new Date(lead.lastContactedAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "Uncontacted"}
                          </span>
                        </div>

                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatBaseMoney(lead.estimatedValue)}
                        </span>
                      </div>

                      {/* Card Actions Toolbar */}
                      <div
                        className="flex items-center justify-between pt-1 border-t border-border/30 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="xs"
                          variant="ghost"
                          className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 font-medium"
                          onClick={() => onLogContact(lead)}
                        >
                          <MessageSquare className="h-3 w-3 mr-1" /> Touchpoint
                        </Button>

                        {col.id !== "won" && col.id !== "lost" && (
                          <Button
                            size="xs"
                            variant="outline"
                            className="h-6 px-2 text-[10px] font-semibold text-foreground hover:bg-muted"
                            onClick={() => {
                              const nextMap: Record<LeadStage, LeadStage> = {
                                new: "contacted",
                                contacted: "qualified",
                                qualified: "proposal",
                                proposal: "won",
                                won: "won",
                                lost: "new",
                              };
                              const nextStage = nextMap[col.id];
                              const updated = updateLeadStage(lead.id, nextStage);
                              if (updated) {
                                onLeadUpdated(updated);
                              }
                            }}
                          >
                            Next <ArrowRight className="h-2.5 w-2.5 ml-1" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
