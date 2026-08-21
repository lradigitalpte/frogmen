"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLead } from "@/lib/leads-api";
import { listMembers, type OrganizationMember } from "@/lib/security-api";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import type { Lead, LeadPriority, LeadSource } from "@/types/lead";
import {
  Check,
  FileText,
  Globe,
  Tag,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface CreateLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadCreated: (lead: Lead) => void;
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

export function CreateLeadModal({
  open,
  onOpenChange,
  onLeadCreated,
}: CreateLeadModalProps) {
  const [mounted, setMounted] = useState(false);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const { currencyPrefix } = useOrgCurrency();

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [leadSource, setLeadSource] = useState<LeadSource>("website");
  const [sourceDetails, setSourceDetails] = useState("");
  const [priority, setPriority] = useState<LeadPriority>("warm");
  const [estimatedValue, setEstimatedValue] = useState("25000");
  const [assignedToName, setAssignedToName] = useState("none");
  const [notes, setNotes] = useState("");
  const [contacted, setContacted] = useState(false);

  useEffect(() => {
    setMounted(true);
    listMembers()
      .then((m) => {
        setMembers(m || []);
        if (m && m.length > 0) {
          setAssignedToName(m[0].name);
        }
      })
      .catch(() => setMembers([]));
  }, []);

  if (!open || !mounted) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !company.trim()) {
      return;
    }

    const newLead = createLead({
      name: name.trim(),
      company: company.trim(),
      email: email.trim(),
      phone: phone.trim(),
      jobTitle: jobTitle.trim() || undefined,
      leadSource,
      sourceDetails: sourceDetails.trim() || undefined,
      priority,
      estimatedValue: parseFloat(estimatedValue) || 0,
      assignedToName: assignedToName === "none" ? undefined : assignedToName.trim(),
      notes: notes.trim() || undefined,
      contacted,
    });

    onLeadCreated(newLead);
    onOpenChange(false);

    // Reset form
    setName("");
    setCompany("");
    setEmail("");
    setPhone("");
    setJobTitle("");
    setSourceDetails("");
    setNotes("");
    setContacted(false);
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
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                  Record New Lead
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                  Capture contact details, acquisition origin source, deal valuation, and outreach status.
                </p>
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
                    placeholder="e.g. Alex Vance"
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
                    placeholder="e.g. AeroMarine Engineering Ltd"
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
                    placeholder="alex@aeromarine.co.uk"
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
                    placeholder="+44 20 7946 0912"
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
                    placeholder="e.g. Head of Fleet Operations"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Acquisition Source & Campaign */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span>Acquisition Origin & Campaign Tracking</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Lead Acquisition Channel <span className="text-destructive">*</span>
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

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Campaign / UTM / Source Notes
                  </label>
                  <Input
                    placeholder="e.g. Google Search Ad 'ROV Inspection', Referral from ABC"
                    value={sourceDetails}
                    onChange={(e) => setSourceDetails(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Qualification & Ownership */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <span>Qualification, Deal Value ({currencyPrefix}) & Owner</span>
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
                    Est. Deal Value ({currencyPrefix})
                  </label>
                  <Input
                    type="number"
                    placeholder="25000"
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
                  </select>
                </div>
              </div>
            </div>

            {/* Section 4: Initial Status & Requirement Notes */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>Initial Status & Lead Requirements</span>
              </div>

              <div className="space-y-3">
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                    contacted
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted/30 border-border hover:bg-muted/50"
                  }`}
                  onClick={() => setContacted(!contacted)}
                >
                  <div
                    className={`flex size-5 items-center justify-center rounded-md border text-white transition-colors ${
                      contacted ? "bg-emerald-500 border-emerald-500" : "bg-background border-input"
                    }`}
                  >
                    {contacted && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold">Initial Outreach Already Attempted?</div>
                    <div className="text-[11px] text-muted-foreground">
                      Check if you have already emailed or spoken with this lead.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Background Notes & Requirements
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[90px]"
                    placeholder="Enter project requirements, fleet specs, target delivery date..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
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
              <UserPlus className="h-4 w-4 mr-1.5" /> Create Lead Record
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
