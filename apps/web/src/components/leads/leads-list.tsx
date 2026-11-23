"use client";

import {
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  Icon,
  Select,
  SkeletonBodyText,
  TextField,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { getLeadStats, isFollowUpDue, listLeads, sourceLabel, updateLeadStage } from "@/lib/leads-api";
import { cn } from "@/lib/utils";
import type { Lead, LeadPriority, LeadSource, LeadStage, LeadStats } from "@/types/lead";
import { CreateLeadModal } from "./create-lead-modal";
import { DeleteLeadModal } from "./delete-lead-modal";
import { EditLeadModal } from "./edit-lead-modal";
import { LeadDetailModal } from "./lead-detail-modal";
import { LeadKanban } from "./lead-kanban";
import { LeadSourcesAnalytics } from "./lead-sources-analytics";
import { LeadTable } from "./lead-table";
import { LEAD_STAGES, OPEN_STAGES, stageMeta } from "./lead-ui";
import { LogContactModal } from "./log-contact-modal";

type View = "board" | "table" | "sources";
type ContactFilter = "all" | "contacted" | "not_contacted" | "followup_due";

const VIEW_KEY = "frogmen-leads-view";

const SOURCES: LeadSource[] = [
  "website",
  "google_ads",
  "organic_search",
  "linkedin",
  "referral",
  "cold_outreach",
  "event",
  "partner",
  "direct_call",
  "other",
];

/** Loads every lead, paging through the API's 100-per-request limit. */
async function fetchAllLeads(): Promise<Lead[]> {
  const first = await listLeads({ page: 1, perPage: 100, sortBy: "createdAt", sortOrder: "desc" });
  if (first.meta.totalPages <= 1) return first.data;
  const rest = await Promise.all(
    Array.from({ length: first.meta.totalPages - 1 }, (_, i) =>
      listLeads({ page: i + 2, perPage: 100, sortBy: "createdAt", sortOrder: "desc" }),
    ),
  );
  return [...first.data, ...rest.flatMap((r) => r.data)];
}

export function LeadsListPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const { showError, showSuccess } = useToast();

  const [view, setView] = useState<View>("board");
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "all">("all");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [logLead, setLogLead] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "board" || saved === "table" || saved === "sources") setView(saved);
    } catch {
      // ignore
    }
  }, []);

  function changeView(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignore
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [leads, nextStats] = await Promise.all([fetchAllLeads(), getLeadStats()]);
      setAllLeads(leads);
      setStats(nextStats);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Leads could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshStats = useCallback(() => {
    getLeadStats().then(setStats).catch(() => null);
  }, []);

  /** Replace one lead in place (after an edit, contact log, etc.). */
  const upsertLead = useCallback(
    (lead: Lead) => {
      setAllLeads((current) => {
        const exists = current.some((l) => l.id === lead.id);
        return exists ? current.map((l) => (l.id === lead.id ? { ...l, ...lead } : l)) : [lead, ...current];
      });
      setDetailLead((current) => (current?.id === lead.id ? { ...current, ...lead } : current));
      refreshStats();
    },
    [refreshStats],
  );

  /** Optimistic stage move: update the board now, roll back if the API refuses. */
  const moveLead = useCallback(
    async (lead: Lead, stage: LeadStage) => {
      const previous = lead.stage;
      setAllLeads((current) => current.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
      setMovingIds((ids) => new Set(ids).add(lead.id));
      try {
        const saved = await updateLeadStage(lead.id, stage);
        upsertLead({ ...saved, communicationLogs: lead.communicationLogs });
        showSuccess(`${lead.name} moved to ${stageMeta[stage].label}`);
      } catch (err) {
        setAllLeads((current) => current.map((l) => (l.id === lead.id ? { ...l, stage: previous } : l)));
        showError(err instanceof Error ? err.message : "Could not move the lead");
      } finally {
        setMovingIds((ids) => {
          const next = new Set(ids);
          next.delete(lead.id);
          return next;
        });
      }
    },
    [showError, showSuccess, upsertLead],
  );

  /* ── Filtering (client-side, so counts and views stay in sync) ── */
  const matchesNonStage = useCallback(
    (lead: Lead) => {
      const q = search.trim().toLowerCase();
      if (
        q &&
        ![lead.name, lead.company, lead.email, lead.phone, lead.jobTitle]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      ) {
        return false;
      }
      if (sourceFilter !== "all" && lead.leadSource !== sourceFilter) return false;
      if (priorityFilter !== "all" && lead.priority !== priorityFilter) return false;
      if (contactFilter === "contacted" && !lead.contacted) return false;
      if (contactFilter === "not_contacted" && lead.contacted) return false;
      if (contactFilter === "followup_due" && !isFollowUpDue(lead)) return false;
      return true;
    },
    [contactFilter, priorityFilter, search, sourceFilter],
  );

  const baseLeads = useMemo(() => allLeads.filter(matchesNonStage), [allLeads, matchesNonStage]);
  const visibleLeads = useMemo(
    () => (stageFilter === "all" ? baseLeads : baseLeads.filter((l) => l.stage === stageFilter)),
    [baseLeads, stageFilter],
  );

  const stageSummary = useMemo(
    () =>
      LEAD_STAGES.map((stage) => {
        const items = baseLeads.filter((l) => l.stage === stage);
        return {
          stage,
          count: items.length,
          value: items.reduce((sum, l) => sum + (l.estimatedValue || 0), 0),
        };
      }),
    [baseLeads],
  );

  const openLeads = allLeads.filter((l) => OPEN_STAGES.includes(l.stage));
  const openValue = openLeads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
  const filtersActive =
    Boolean(search.trim()) ||
    stageFilter !== "all" ||
    sourceFilter !== "all" ||
    priorityFilter !== "all" ||
    contactFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStageFilter("all");
    setSourceFilter("all");
    setPriorityFilter("all");
    setContactFilter("all");
  }

  function exportCsv() {
    if (!visibleLeads.length) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Name", "Company", "Email", "Phone", "Job title", "Source", "Stage", "Priority", "Estimated value", "Contacted", "Last contacted", "Next follow-up", "Assigned to", "Created"];
    const rows = visibleLeads.map((l) =>
      [l.name, l.company, l.email, l.phone, l.jobTitle, sourceLabel(l.leadSource), stageMeta[l.stage].label, l.priority, l.estimatedValue, l.contacted ? "Yes" : "No", l.lastContactedAt, l.nextFollowUp, l.assignedTo?.name, l.createdAt].map(esc).join(","),
    );
    const blob = new Blob([[header.map(esc).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppPage
      title="Leads"
      subtitle="Track prospects from first contact to a won customer"
      primaryAction={{ content: "Add lead", onAction: () => setCreateOpen(true) }}
      secondaryActions={[{ content: "Export CSV", disabled: !visibleLeads.length, onAction: exportCsv }]}
    >
      <BlockStack gap="400">
        {loadError ? (
          <Banner tone="critical" title="Leads could not be loaded" action={{ content: "Try again", onAction: () => void load() }}>
            <p>{loadError}</p>
          </Banner>
        ) : null}

        {/* Summary */}
        <section className="lead-hero">
          <div className="lead-hero__main">
            <span className="lead-hero__label">Open pipeline</span>
            <span className="lead-hero__value">{stats || !loading ? formatBaseMoney(openValue) : "—"}</span>
            <span className="lead-hero__hint">
              {openLeads.length} open lead{openLeads.length === 1 ? "" : "s"} · {formatBaseMoney(stats?.totalPipelineValue ?? 0)} incl. won & lost
            </span>
          </div>
          <div className="lead-hero__stats">
            <div>
              <span>Contacted</span>
              <strong>{stats ? `${stats.contactedRate}%` : "—"}</strong>
              <small>{stats ? `${stats.notContactedCount} still to reach` : ""}</small>
            </div>
            <div>
              <span>Qualified</span>
              <strong>{stats?.qualifiedCount ?? "—"}</strong>
              <small>Qualified or proposal</small>
            </div>
            <div>
              <span>Win rate</span>
              <strong>{stats ? `${stats.winRate}%` : "—"}</strong>
              <small>{stats ? `${stats.wonCount} won` : ""}</small>
            </div>
            <button
              type="button"
              className={cn((stats?.followUpsDueToday ?? 0) > 0 && "is-alert")}
              onClick={() => setContactFilter("followup_due")}
            >
              <span>Follow-ups due</span>
              <strong>{stats?.followUpsDueToday ?? "—"}</strong>
              <small>{(stats?.followUpsDueToday ?? 0) > 0 ? "Show them →" : "All caught up"}</small>
            </button>
          </div>
        </section>

        {/* Stage strip */}
        <nav className="lead-stages" aria-label="Filter by stage">
          <button
            type="button"
            className={cn("lead-stage", stageFilter === "all" && "is-active")}
            onClick={() => setStageFilter("all")}
          >
            <span className="lead-stage__label">All</span>
            <strong>{baseLeads.length}</strong>
            <small>{formatBaseMoney(baseLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0))}</small>
          </button>
          {stageSummary.map(({ stage, count, value }) => (
            <button
              key={stage}
              type="button"
              className={cn("lead-stage", stageFilter === stage && "is-active", (stage === "won" || stage === "lost") && "is-closed")}
              style={{ ["--stage-color" as string]: stageMeta[stage].color }}
              onClick={() => setStageFilter(stageFilter === stage ? "all" : stage)}
            >
              <span className="lead-stage__label">
                <i />
                {stageMeta[stage].label}
              </span>
              <strong>{count}</strong>
              <small>{formatBaseMoney(value)}</small>
            </button>
          ))}
        </nav>

        {/* Toolbar */}
        <Card padding="300">
          <div className="lead-toolbar">
            <div className="lead-toolbar__search">
              <TextField
                label="Search leads"
                labelHidden
                autoComplete="off"
                placeholder="Search name, company, email or phone"
                prefix={<Icon source={SearchIcon} tone="subdued" />}
                value={search}
                onChange={setSearch}
                clearButton
                onClearButtonClick={() => setSearch("")}
              />
            </div>
            <Select
              label="Source"
              labelInline
              value={sourceFilter}
              onChange={(v) => setSourceFilter(v as LeadSource | "all")}
              options={[{ label: "All", value: "all" }, ...SOURCES.map((s) => ({ label: sourceLabel(s), value: s }))]}
            />
            <Select
              label="Priority"
              labelInline
              value={priorityFilter}
              onChange={(v) => setPriorityFilter(v as LeadPriority | "all")}
              options={[
                { label: "All", value: "all" },
                { label: "Hot", value: "hot" },
                { label: "Warm", value: "warm" },
                { label: "Cold", value: "cold" },
              ]}
            />
            <Select
              label="Contact"
              labelInline
              value={contactFilter}
              onChange={(v) => setContactFilter(v as ContactFilter)}
              options={[
                { label: "All", value: "all" },
                { label: "Contacted", value: "contacted" },
                { label: "Not contacted", value: "not_contacted" },
                { label: "Follow-up due", value: "followup_due" },
              ]}
            />
            {filtersActive ? (
              <Button variant="plain" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
            <div className="lead-toolbar__views">
              <ButtonGroup variant="segmented">
                <Button pressed={view === "board"} onClick={() => changeView("board")}>Board</Button>
                <Button pressed={view === "table"} onClick={() => changeView("table")}>Table</Button>
                <Button pressed={view === "sources"} onClick={() => changeView("sources")}>Sources</Button>
              </ButtonGroup>
            </div>
          </div>
        </Card>

        {/* Views */}
        {loading && allLeads.length === 0 ? (
          <Card>
            <SkeletonBodyText lines={8} />
          </Card>
        ) : view === "board" ? (
          allLeads.length === 0 && !loadError ? (
            <Card>
              <div className="lead-empty">
                <h2>Start your pipeline</h2>
                <p>Add a lead for every person or company you are trying to win. Move them across the board as the deal progresses, and convert them to a customer when they say yes.</p>
                <Button variant="primary" onClick={() => setCreateOpen(true)}>Add your first lead</Button>
              </div>
            </Card>
          ) : (
            <LeadKanban
              leads={visibleLeads}
              movingIds={movingIds}
              onSelectLead={setDetailLead}
              onLogContact={setLogLead}
              onMoveLead={(lead, stage) => void moveLead(lead, stage)}
            />
          )
        ) : view === "table" ? (
          <LeadTable
            leads={visibleLeads}
            loading={loading}
            filtered={filtersActive}
            onSelectLead={setDetailLead}
            onLogContact={setLogLead}
            onEditLead={setEditLead}
            onMoveLead={(lead, stage) => void moveLead(lead, stage)}
            onDeleteLead={setDeleteTarget}
            onCreateLead={() => setCreateOpen(true)}
          />
        ) : stats ? (
          <LeadSourcesAnalytics
            stats={stats}
            onPickSource={(source) => {
              setSourceFilter(source);
              changeView("table");
            }}
          />
        ) : null}
      </BlockStack>

      <CreateLeadModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onLeadCreated={(lead) => {
          upsertLead(lead);
          showSuccess(`${lead.name} added`);
          setDetailLead(lead);
        }}
      />

      <LeadDetailModal
        lead={detailLead}
        open={Boolean(detailLead)}
        onOpenChange={(open) => !open && setDetailLead(null)}
        onLeadUpdated={upsertLead}
      />

      <LogContactModal
        lead={logLead}
        open={Boolean(logLead)}
        onOpenChange={(open) => !open && setLogLead(null)}
        onContactLogged={(lead) => {
          upsertLead(lead);
          showSuccess("Contact logged");
        }}
      />

      <EditLeadModal
        lead={editLead}
        open={Boolean(editLead)}
        onOpenChange={(open) => !open && setEditLead(null)}
        onLeadUpdated={(lead) => {
          upsertLead(lead);
          showSuccess("Lead updated");
        }}
      />

      <DeleteLeadModal
        lead={deleteTarget}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onLeadDeleted={(id) => {
          setAllLeads((current) => current.filter((l) => l.id !== id));
          setDetailLead((current) => (current?.id === id ? null : current));
          refreshStats();
          showSuccess("Lead deleted");
        }}
      />
    </AppPage>
  );
}
