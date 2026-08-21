"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  contactStatusLabel,
  convertLeadToCustomer,
  priorityBadgeVariant,
  priorityLabel,
  sourceBadgeVariant,
  sourceLabel,
  updateLeadStage,
} from "@/lib/leads-api";
import type { Lead, LeadStage } from "@/types/lead";
import { LogContactModal } from "./log-contact-modal";
import { EditLeadModal } from "./edit-lead-modal";
import {
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  FileText,
  Globe,
  Mail,
  MessageSquare,
  Phone,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";

interface LeadDetailModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadUpdated: (updatedLead: Lead) => void;
}

const STAGES: { id: LeadStage; label: string }[] = [
  { id: "new", label: "New Lead" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal Sent" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

export function LeadDetailModal({
  lead,
  open,
  onOpenChange,
  onLeadUpdated,
}: LeadDetailModalProps) {
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "timeline">("overview");
  const [mounted, setMounted] = useState(false);

  const { formatBaseMoney } = useOrgCurrency();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !lead || !mounted) return null;

  const initials = lead.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const handleStageChange = (newStage: LeadStage) => {
    const updated = updateLeadStage(lead.id, newStage);
    if (updated) onLeadUpdated(updated);
  };

  const handleConvert = () => {
    const updated = convertLeadToCustomer(lead.id);
    if (updated) onLeadUpdated(updated);
  };

  const isFollowUpOverdue =
    lead.nextFollowUp &&
    lead.nextFollowUp <= new Date().toISOString() &&
    lead.stage !== "won" &&
    lead.stage !== "lost";

  const drawerContent = (
    <div className="relative z-[99999]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-Over Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-card border-l border-border/80 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Top Header */}
        <div className="p-6 border-b bg-gradient-to-r from-card via-muted/30 to-muted/10 shrink-0 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary font-black text-base border border-primary/20 shrink-0 shadow-2xs">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                    {lead.name}
                  </h2>
                  <StatusBadge
                    variant={priorityBadgeVariant(lead.priority)}
                    className="text-[10px] font-bold uppercase tracking-wider"
                  >
                    {priorityLabel(lead.priority)}
                  </StatusBadge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 font-medium">
                  <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-foreground font-semibold">{lead.company}</span>
                  {lead.jobTitle && <span>• {lead.jobTitle}</span>}
                </div>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close drawer</span>
            </button>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={() => setLogModalOpen(true)}>
              <MessageSquare className="h-4 w-4 mr-1.5" /> Log Touchpoint
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditModalOpen(true)}
            >
              <Edit3 className="h-4 w-4 mr-1.5" /> Edit Lead Details
            </Button>
            {lead.stage !== "won" && (
              <Button
                size="sm"
                variant="outline"
                className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 font-bold"
                onClick={handleConvert}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Convert to Customer
              </Button>
            )}
          </div>

          {/* Pipeline Stage Stepper Bar */}
          <div className="pt-2">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Pipeline Stage Progress
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {STAGES.map((stg) => {
                const active = lead.stage === stg.id;
                return (
                  <button
                    key={stg.id}
                    type="button"
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl shrink-0 transition-all ${
                      active
                        ? "bg-primary text-primary-foreground font-bold shadow-xs scale-[1.02]"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
                    }`}
                    onClick={() => handleStageChange(stg.id)}
                  >
                    {stg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* View Tabs */}
          <div className="flex items-center gap-4 pt-1 text-xs border-t">
            <button
              type="button"
              className={`pb-1 font-bold border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("overview")}
            >
              Lead Overview & Campaign Details
            </button>
            <button
              type="button"
              className={`pb-1 font-bold border-b-2 transition-colors ${
                activeTab === "timeline"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("timeline")}
            >
              Outreach History Timeline ({lead.communicationLogs?.length || 0})
            </button>
          </div>
        </div>

        {/* Panel Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Metrics Highlights Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border bg-card shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-500" /> Est. Valuation
                  </span>
                  <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {formatBaseMoney(lead.estimatedValue)}
                  </div>
                </div>

                <div className="p-4 rounded-xl border bg-card shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-blue-500" /> Acquisition Source
                  </span>
                  <div className="text-sm font-bold text-foreground truncate">
                    {sourceLabel(lead.leadSource)}
                  </div>
                </div>

                <div className="p-4 rounded-xl border bg-card shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-500" /> Next Follow-Up
                  </span>
                  <div
                    className={`text-sm font-bold truncate ${
                      isFollowUpOverdue ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {lead.nextFollowUp
                      ? new Date(lead.nextFollowUp).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "None Scheduled"}
                  </div>
                </div>
              </div>

              {/* Contact Information & Ownership */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-card space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-primary" /> Contact Details
                  </h4>
                  <div className="text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <a href={`mailto:${lead.email}`} className="text-primary font-medium hover:underline truncate">
                        {lead.email || "No email address"}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{lead.phone || "No phone number"}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1.5 border-t">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>Assigned Rep: <strong className="text-foreground">{lead.assignedTo?.name || "Unassigned"}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border bg-card space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-primary" /> Acquisition & Quality Score
                  </h4>
                  <div className="text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Lead Source:</span>
                      <StatusBadge variant={sourceBadgeVariant(lead.leadSource)}>
                        {sourceLabel(lead.leadSource)}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Quality Score:</span>
                      <span className="font-bold text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                        {lead.score} / 100
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t">
                      <span className="text-muted-foreground">Outreach State:</span>
                      <span
                        className={`font-semibold ${
                          lead.contacted
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {lead.contacted ? "Contacted" : "Not Contacted"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source Details & Campaign Info */}
              {lead.sourceDetails && (
                <div className="p-4 rounded-xl border bg-card space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-primary" /> Campaign & UTM Tracking Info
                  </h4>
                  <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border font-mono">
                    {lead.sourceDetails}
                  </p>
                </div>
              )}

              {/* Lead Background Notes */}
              {lead.notes && (
                <div className="p-4 rounded-xl border bg-card space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" /> Requirement Notes
                  </h4>
                  <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">
                    {lead.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Activity & Touchpoint Timeline
                </h4>
                <Button size="xs" onClick={() => setLogModalOpen(true)}>
                  + Log Touchpoint
                </Button>
              </div>

              {!lead.communicationLogs || lead.communicationLogs.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-xl bg-muted/20 text-muted-foreground text-xs space-y-2">
                  <p className="font-semibold">No outreach touchpoints logged yet</p>
                  <p className="text-[11px] text-muted-foreground/70">
                    Record calls, emails, or meetings to build lead interaction history.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                  {lead.communicationLogs.map((log) => {
                    const Icon =
                      log.type === "call"
                        ? Phone
                        : log.type === "email"
                          ? Mail
                          : log.type === "whatsapp"
                            ? MessageSquare
                            : log.type === "meeting"
                              ? Users
                              : FileText;

                    return (
                      <div key={log.id} className="relative pl-8 space-y-1 group">
                        <div className="absolute left-1.5 top-2 size-5 rounded-full bg-card border border-primary/40 flex items-center justify-center text-primary shrink-0 shadow-2xs">
                          <Icon className="h-2.5 w-2.5" />
                        </div>

                        <div className="p-4 rounded-xl border bg-card text-xs space-y-1.5 shadow-2xs hover:shadow-xs transition-shadow">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span className="font-bold text-foreground flex items-center gap-1.5">
                              <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-muted border font-bold">
                                {log.type}
                              </span>
                              <span>{log.author}</span>
                            </span>
                            <span className="text-[11px] flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(log.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          <p className="text-foreground text-xs leading-normal pt-1">{log.summary}</p>

                          {log.outcome && (
                            <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 pt-1.5 border-t border-border/40">
                              Outcome: {log.outcome}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <LogContactModal
        lead={lead}
        open={logModalOpen}
        onOpenChange={setLogModalOpen}
        onContactLogged={(updated) => {
          onLeadUpdated(updated);
        }}
      />

      <EditLeadModal
        lead={lead}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onLeadUpdated={(updated) => {
          onLeadUpdated(updated);
        }}
      />
    </div>
  );

  return createPortal(drawerContent, document.body);
}
