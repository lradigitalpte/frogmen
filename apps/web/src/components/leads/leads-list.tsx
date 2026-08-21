"use client";

import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  getLeadStats,
  listLeads,
  sourceLabel,
  stageLabel,
} from "@/lib/leads-api";
import type {
  Lead,
  LeadPriority,
  LeadSource,
  LeadStage,
  LeadStats,
  ListLeadsParams,
} from "@/types/lead";
import { LeadKanban } from "./lead-kanban";
import { LeadTable } from "./lead-table";
import { LeadSourcesAnalytics } from "./lead-sources-analytics";
import { CreateLeadModal } from "./create-lead-modal";
import { LogContactModal } from "./log-contact-modal";
import { LeadDetailModal } from "./lead-detail-modal";
import { EditLeadModal } from "./edit-lead-modal";
import { DeleteLeadModal } from "./delete-lead-modal";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  DollarSign,
  Download,
  Filter,
  Kanban,
  LayoutList,
  Plus,
  Search,
  Target,
  Users,
} from "lucide-react";

export function LeadsListPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [viewMode, setViewMode] = useState<"kanban" | "table" | "analytics">("kanban");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [contactedFilter, setContactedFilter] = useState<"all" | "contacted" | "not_contacted" | "followup_due">("all");
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "all">("all");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats | null>(null);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [logContactLead, setLogContactLead] = useState<Lead | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [editLeadItem, setEditLeadItem] = useState<Lead | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteLeadItem, setDeleteLeadItem] = useState<Lead | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const refreshData = useCallback(() => {
    const params: ListLeadsParams = {
      search: search || undefined,
      leadSource: sourceFilter,
      contacted: contactedFilter,
      stage: stageFilter,
      priority: priorityFilter,
    };

    const res = listLeads(params);
    setLeads(res.data);
    setStats(getLeadStats());
  }, [search, sourceFilter, contactedFilter, stageFilter, priorityFilter]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleLeadCreated = (newLead: Lead) => {
    refreshData();
    setSelectedLead(newLead);
    setDetailModalOpen(true);
  };

  const handleLeadUpdated = (updatedLead: Lead) => {
    refreshData();
    if (selectedLead && selectedLead.id === updatedLead.id) {
      setSelectedLead(updatedLead);
    }
  };

  const handleExportCsv = () => {
    if (!leads.length) return;
    const headers = [
      "ID",
      "Name",
      "Company",
      "Email",
      "Phone",
      "Job Title",
      "Source",
      "Stage",
      "Priority",
      "Estimated Value",
      "Contacted",
      "Assigned To",
      "Created At",
    ];

    const rows = leads.map((l) => [
      l.id,
      `"${l.name}"`,
      `"${l.company}"`,
      l.email || "",
      l.phone || "",
      `"${l.jobTitle || ""}"`,
      l.leadSource,
      l.stage,
      l.priority,
      l.estimatedValue,
      l.contacted ? "Yes" : "No",
      `"${l.assignedTo?.name || "Unassigned"}"`,
      l.createdAt,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `frogmen_leads_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppPage
      title="Leads Management & Acquisition Tracking"
      subtitle="Track lead sources, contact outreach status, pipeline conversion, and follow-ups"
      primaryAction={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add New Lead
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Metric Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Active Pipeline"
              value={formatBaseMoney(stats.totalPipelineValue)}
              hint={`${stats.totalLeads} Total Prospects`}
              icon={<DollarSign className="h-5 w-5" />}
              tone="success"
            />
            <KpiCard
              label="Contacted Rate"
              value={`${stats.contactedRate}%`}
              hint={`${stats.contactedCount} Contacted / ${stats.notContactedCount} Pending`}
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="default"
            />
            <KpiCard
              label="Qualified Leads"
              value={String(stats.qualifiedCount)}
              hint="Proposal or Qualified Stage"
              icon={<Target className="h-5 w-5" />}
              tone="default"
            />
            <KpiCard
              label="Win Rate"
              value={`${stats.winRate}%`}
              hint={`${stats.wonCount} Converted Customers`}
              icon={<Users className="h-5 w-5" />}
              tone="success"
            />
            <KpiCard
              label="Follow-ups Due"
              value={String(stats.followUpsDueToday)}
              hint={stats.followUpsDueToday > 0 ? "Action Required Today" : "All Caught Up"}
              icon={<Calendar className="h-5 w-5" />}
              tone={stats.followUpsDueToday > 0 ? "warning" : "muted"}
            />
          </div>
        )}

        {/* Toolbar: Search, Filters, View Switcher */}
        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, company, email..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* View Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-lg border bg-muted/30 self-end md:self-auto">
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === "kanban"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setViewMode("kanban")}
              >
                <Kanban className="h-3.5 w-3.5" /> Pipeline Board
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === "table"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setViewMode("table")}
              >
                <LayoutList className="h-3.5 w-3.5" /> List Table
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === "analytics"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setViewMode("analytics")}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Source Analytics
              </button>
            </div>
          </div>

          {/* Filter Dropdowns Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t text-xs">
            <span className="font-semibold text-muted-foreground flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" /> Filters:
            </span>

            {/* Source Filter */}
            <select
              className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
            >
              <option value="all">All Sources</option>
              <option value="website">Website Form</option>
              <option value="google_ads">Google Ads</option>
              <option value="organic_search">Organic Search / SEO</option>
              <option value="linkedin">LinkedIn Outreach</option>
              <option value="referral">Customer Referral</option>
              <option value="cold_outreach">Cold Email / Call</option>
              <option value="event">Trade Show / Event</option>
              <option value="partner">Partner Network</option>
              <option value="direct_call">Direct Call</option>
              <option value="other">Other</option>
            </select>

            {/* Contacted Filter */}
            <select
              className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              value={contactedFilter}
              onChange={(e) => setContactedFilter(e.target.value as any)}
            >
              <option value="all">All Contact Statuses</option>
              <option value="contacted">Contacted</option>
              <option value="not_contacted">Not Contacted</option>
              <option value="followup_due">Follow-up Due Today</option>
            </select>

            {/* Stage Filter */}
            <select
              className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as any)}
            >
              <option value="all">All Stages</option>
              <option value="new">New Lead</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="proposal">Proposal Sent</option>
              <option value="won">Won / Converted</option>
              <option value="lost">Lost / Disqualified</option>
            </select>

            {/* Priority Filter */}
            <select
              className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
            >
              <option value="all">All Priorities</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </select>

            {/* Clear Filters CTA */}
            {(sourceFilter !== "all" ||
              contactedFilter !== "all" ||
              stageFilter !== "all" ||
              priorityFilter !== "all" ||
              search) && (
              <button
                type="button"
                className="text-xs text-primary hover:underline font-semibold ml-auto"
                onClick={() => {
                  setSearch("");
                  setSourceFilter("all");
                  setContactedFilter("all");
                  setStageFilter("all");
                  setPriorityFilter("all");
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* View Component Display */}
        {viewMode === "kanban" && (
          <LeadKanban
            leads={leads}
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setDetailModalOpen(true);
            }}
            onLogContact={(lead) => {
              setLogContactLead(lead);
              setLogModalOpen(true);
            }}
            onLeadUpdated={handleLeadUpdated}
          />
        )}

        {viewMode === "table" && (
          <LeadTable
            leads={leads}
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setDetailModalOpen(true);
            }}
            onLogContact={(lead) => {
              setLogContactLead(lead);
              setLogModalOpen(true);
            }}
            onLeadUpdated={handleLeadUpdated}
            onLeadDeleted={(id, lead) => {
              setDeleteLeadItem(lead);
              setDeleteModalOpen(true);
            }}
          />
        )}

        {viewMode === "analytics" && stats && (
          <LeadSourcesAnalytics stats={stats} />
        )}
      </div>

      {/* Modals */}
      <CreateLeadModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onLeadCreated={handleLeadCreated}
      />

      <LeadDetailModal
        lead={selectedLead}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onLeadUpdated={handleLeadUpdated}
      />

      <LogContactModal
        lead={logContactLead}
        open={logModalOpen}
        onOpenChange={setLogModalOpen}
        onContactLogged={handleLeadUpdated}
      />

      <EditLeadModal
        lead={editLeadItem}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onLeadUpdated={handleLeadUpdated}
      />

      <DeleteLeadModal
        lead={deleteLeadItem}
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onLeadDeleted={() => refreshData()}
      />
    </AppPage>
  );
}
