"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logLeadContact } from "@/lib/leads-api";
import { listMembers, type OrganizationMember } from "@/lib/security-api";
import type { Lead } from "@/types/lead";
import {
  Building2,
  Calendar,
  Check,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Send,
  User,
  Users,
  X,
} from "lucide-react";

interface LogContactModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactLogged: (updatedLead: Lead) => void;
}

const TOUCHPOINTS: {
  id: "call" | "email" | "whatsapp" | "meeting" | "note";
  label: string;
  icon: typeof Phone;
  color: string;
}[] = [
  { id: "call", label: "Phone Call", icon: Phone, color: "text-blue-500 bg-blue-500/10" },
  { id: "email", label: "Email Sent", icon: Mail, color: "text-purple-500 bg-purple-500/10" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-emerald-500 bg-emerald-500/10" },
  { id: "meeting", label: "Meeting", icon: Users, color: "text-amber-500 bg-amber-500/10" },
  { id: "note", label: "Internal Note", icon: FileText, color: "text-slate-500 bg-slate-500/10" },
];

const PRESET_OUTCOMES = [
  "Sent Product Quotation",
  "Demo Scheduled",
  "Left Voicemail",
  "Awaiting Technical Feedback",
  "Meeting Completed",
  "Requested Price List",
  "Budget Approved",
  "Follow-up Call Required",
];

export function LogContactModal({
  lead,
  open,
  onOpenChange,
  onContactLogged,
}: LogContactModalProps) {
  const [mounted, setMounted] = useState(false);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [type, setType] = useState<"call" | "email" | "whatsapp" | "meeting" | "note">("call");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [authorName, setAuthorName] = useState("");

  useEffect(() => {
    setMounted(true);
    listMembers()
      .then((m) => {
        setMembers(m || []);
        if (m && m.length > 0) {
          setAuthorName(m[0].name);
        }
      })
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (open) {
      setSummary("");
      setOutcome("");
      // Default follow up 3 days from now
      const defaultDate = new Date(Date.now() + 3600 * 1000 * 72)
        .toISOString()
        .slice(0, 16);
      setNextFollowUp(defaultDate);
    }
  }, [open]);

  if (!open || !lead || !mounted) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;

    const updated = logLeadContact({
      leadId: lead.id,
      type,
      summary: summary.trim(),
      outcome: outcome.trim() || undefined,
      nextFollowUp: nextFollowUp ? new Date(nextFollowUp).toISOString() : undefined,
      authorName: authorName.trim() || "Sales Rep",
    });

    if (updated) {
      onContactLogged(updated);
      onOpenChange(false);
    }
  };

  const drawerContent = (
    <div className="relative z-[99999]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-Over Right Drawer Panel - Max Width 2XL (Bigger & Spacious) */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-card border-l border-border/80 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b bg-gradient-to-r from-card via-muted/30 to-muted/10 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0 shadow-2xs">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                  Record Outreach Touchpoint
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 font-medium">
                  <span className="font-extrabold text-foreground">{lead.name}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-primary shrink-0" /> {lead.company}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close drawer</span>
            </button>
          </div>

          {/* Form Body - Scrollable */}
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Touchpoint Type Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Outreach Method <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-5 gap-2">
                {TOUCHPOINTS.map((tp) => {
                  const Icon = tp.icon;
                  const selected = type === tp.id;

                  return (
                    <button
                      key={tp.id}
                      type="button"
                      className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-xs font-bold transition-all ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary shadow-md scale-[1.03]"
                          : "bg-background border-input text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      onClick={() => setType(tp.id)}
                    >
                      <Icon className="h-5 w-5 mb-1.5" />
                      <span className="text-xs truncate w-full text-center">{tp.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conversation Summary */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Touchpoint Notes & Summary <span className="text-destructive">*</span>
              </label>
              <textarea
                required
                className="w-full rounded-xl border border-input bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[140px] leading-relaxed"
                placeholder="What was discussed? Note requirements, budget remarks, customer questions, or objections..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>

            {/* Key Outcome + Preset Pills */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Key Outcome / Next Action
              </label>
              <Input
                placeholder="e.g. Sent formal quote #Q-2026-90, booked technical demo..."
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="h-10 text-sm mb-2"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_OUTCOMES.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="text-xs px-2.5 py-1 rounded-full border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors font-semibold"
                    onClick={() => setOutcome(preset)}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Next Follow Up & Author */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-primary" /> Schedule Next Follow-Up
                </label>
                <Input
                  type="datetime-local"
                  value={nextFollowUp}
                  onChange={(e) => setNextFollowUp(e.target.value)}
                  className="h-10 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-primary" /> Logged By
                </label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                  {!members.some((m) => m.name === authorName) && authorName && (
                    <option value={authorName}>{authorName}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/20 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              <Send className="h-4 w-4 mr-1.5" /> Save Touchpoint Log
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
