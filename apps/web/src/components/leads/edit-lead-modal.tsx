"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateLead } from "@/lib/leads-api";
import { listMembers, type OrganizationMember } from "@/lib/security-api";
import type { Lead, LeadPriority, LeadSource, LeadStage } from "@/types/lead";
import {
  Building2,
  Check,
  Edit3,
  FileText,
  Globe,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";

interface EditLeadModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadUpdated: (lead: Lead) => void;
}

const SOURCES: { id: LeadSource; label: string }[] = [
  { id: "website", label: "Website Form" },
  { id: "google_ads", label: "Google Ads" },
  { id: "organic_search", label: "Organic Search / SEO" },
  { id: "linkedin", label: "LinkedIn Outreach" },
  { id: "referral", label: "Customer Referral" },
  { id: "cold_outreach", label: "Cold Email / Call" },
  { id: "event", label: "Trade Show / Event" },
  { id: "partner", label: "Partner Network" },
  { id: "direct_call", label: "Direct Call" },
  { id: "other", label: "Other" },
];

const STAGES: { id: LeadStage; label: string }[] = [
  { id: "new", label: "New Lead" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal Sent" },
  { id: "won", label: "Won / Converted" },
  { id: "lost", label: "Lost / Disqualified" },
];

export function EditLeadModal({
  lead,
  open,
  onOpenChange,
  onLeadUpdated,
}: EditLeadModalProps) {
  const [mounted, setMounted] = useState(false);
  const [members, setMembers] = useState<OrganizationMember[]>([]);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [leadSource, setLeadSource] = useState<LeadSource>("website");
  const [sourceDetails, setSourceDetails] = useState("");
  const [priority, setPriority] = useState<LeadPriority>("warm");
  const [stage, setStage] = useState<LeadStage>("new");
  const [estimatedValue, setEstimatedValue] = useState("25000");
  const [assignedToName, setAssignedToName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setMounted(true);
    listMembers()
      .then((m) => setMembers(m || []))
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (lead && open) {
      setName(lead.name || "");
      setCompany(lead.company || "");
      setEmail(lead.email || "");
      setPhone(lead.phone || "");
      setJobTitle(lead.jobTitle || "");
      setLeadSource(lead.leadSource || "website");
      setSourceDetails(lead.sourceDetails || "");
      setPriority(lead.priority || "warm");
      setStage(lead.stage || "new");
      setEstimatedValue(String(lead.estimatedValue || 0));
      setAssignedToName(lead.assignedTo?.name || "none");
      setNotes(lead.notes || "");
    }
  }, [lead, open]);

  if (!open || !lead || !mounted) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !company.trim()) {
      return;
    }

    const updated = updateLead(lead.id, {
      name: name.trim(),
      company: company.trim(),
      email: email.trim(),
      phone: phone.trim(),
      jobTitle: jobTitle.trim() || undefined,
      leadSource,
      sourceDetails: sourceDetails.trim() || undefined,
      priority,
      stage,
      estimatedValue: parseFloat(estimatedValue) || 0,
      assignedToName: assignedToName === "none" ? "" : assignedToName.trim(),
      notes: notes.trim() || undefined,
    });

    if (updated) {
      onLeadUpdated(updated);
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

      {/* Slide-Over Right Drawer Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-card border-l border-border/80 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b bg-gradient-to-r from-card via-muted/30 to-muted/10 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0 shadow-2xs">
                <Edit3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                  Edit Lead Details
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 font-medium">
                  <span className="font-bold text-foreground">{lead.name}</span>
                  <span>•</span>
                  <span>{lead.company}</span>
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
            {/* Section 1: Contact & Company Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <User className="h-3.5 w-3.5 text-primary" />
                <span>Contact & Company Information</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Contact Person Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Company / Organization <span className="text-destructive">*</span>
                  </label>
                  <Input
                    required
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Phone Number
                  </label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Job Title / Role
                  </label>
                  <Input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Pipeline Stage & Acquisition Channel */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span>Pipeline Stage & Acquisition Channel</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Pipeline Lifecycle Stage
                  </label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                    value={stage}
                    onChange={(e) => setStage(e.target.value as LeadStage)}
                  >
                    {STAGES.map((stg) => (
                      <option key={stg.id} value={stg.id}>
                        {stg.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Lead Acquisition Channel
                  </label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value as LeadSource)}
                  >
                    {SOURCES.map((src) => (
                      <option key={src.id} value={src.id}>
                        {src.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Campaign / UTM / Source Notes
                  </label>
                  <Input
                    value={sourceDetails}
                    onChange={(e) => setSourceDetails(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Priority, Valuation & Org User Selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <span>Valuation, Priority & Organization Owner</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Priority Level
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 rounded-lg border">
                    {(["hot", "warm", "cold"] as LeadPriority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`py-1 text-xs font-bold capitalize rounded-md transition-all ${
                          priority === p
                            ? p === "hot"
                              ? "bg-red-500 text-white shadow-xs"
                              : p === "warm"
                                ? "bg-amber-500 text-white shadow-xs"
                                : "bg-blue-500 text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setPriority(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Est. Deal Value
                  </label>
                  <Input
                    type="number"
                    value={estimatedValue}
                    onChange={(e) => setEstimatedValue(e.target.value)}
                    className="h-9 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-primary" /> Assigned Owner
                  </label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                    value={assignedToName}
                    onChange={(e) => setAssignedToName(e.target.value)}
                  >
                    <option value="none">Unassigned / None</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                    {!members.some((m) => m.name === assignedToName) && assignedToName && assignedToName !== "none" && (
                      <option value={assignedToName}>{assignedToName}</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 4: Requirement Notes */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>Background Notes & Requirements</span>
              </div>

              <div>
                <textarea
                  className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[90px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
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
              <Check className="h-4 w-4 mr-1.5" /> Update Lead Details
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
