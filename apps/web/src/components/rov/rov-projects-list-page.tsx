"use client";

import { Badge, Button, Icon, Pagination, Select, SkeletonBodyText, TextField } from "@shopify/polaris";
import { ImageIcon, SearchIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { ROV_STATUS, ROV_STEPS, rovJobProgress } from "@/components/rov/rov-progress";
import { useBranchLabels } from "@/hooks/use-branch-labels";
import { formatAppDate } from "@/lib/format-date";
import { listRovProjects, rovAssetUrl } from "@/lib/rov-api";
import { cn } from "@/lib/utils";
import type { RovProject, RovProjectSort, RovProjectStatus, RovProjectsSummary } from "@/types/rov";

type TabId = "all" | RovProjectStatus;

const TABS: Array<{ id: TabId; label: string; key: keyof RovProjectsSummary }> = [
  { id: "all", label: "All", key: "all" },
  { id: "in_progress", label: "In progress", key: "inProgress" },
  { id: "draft", label: "Draft", key: "draft" },
  { id: "completed", label: "Completed", key: "completed" },
  { id: "archived", label: "Archived", key: "archived" },
];

const SORT_OPTIONS: Array<{ label: string; value: RovProjectSort }> = [
  { label: "Recently updated", value: "updated" },
  { label: "Newest first", value: "newest" },
  { label: "Start date", value: "start_date" },
  { label: "End date (soonest)", value: "end_date" },
  { label: "Name A–Z", value: "name" },
];

const PAGE_SIZES = [16, 25, 50, 100];
const EMPTY_SUMMARY: RovProjectsSummary = {
  all: 0,
  draft: 0,
  inProgress: 0,
  completed: 0,
  archived: 0,
  overdue: 0,
  startingSoon: 0,
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Short schedule note: overdue, starts in N days, N days left. */
function scheduleNote(project: RovProject, now: string) {
  const open = project.status === "draft" || project.status === "in_progress";
  const start = project.startDate?.slice(0, 10);
  const end = project.endDate?.slice(0, 10);
  if (!open) return null;
  if (end && end < now) return { text: `Overdue by ${daysBetween(end, now)} d`, alert: true };
  if (start && start > now) {
    const d = daysBetween(now, start);
    return { text: d === 1 ? "Starts tomorrow" : `Starts in ${d} d`, alert: false };
  }
  if (end) {
    const d = daysBetween(now, end);
    return { text: d === 0 ? "Ends today" : `${d} d left`, alert: false };
  }
  return null;
}

export function RovProjectsListPage() {
  const { showBranchColumn, branchLabel } = useBranchLabels();
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<RovProjectSort>("updated");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(16);
  const [projects, setProjects] = useState<RovProject[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<RovProjectsSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listRovProjects({
        page,
        perPage,
        search: debouncedQuery || undefined,
        status: tab === "all" ? undefined : tab,
        hideArchived: tab === "all" ? true : undefined,
        sort,
      });
      if (request !== requestRef.current) return;
      setProjects(result.data);
      setTotal(result.meta.total);
      setSummary(result.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [debouncedQuery, page, perPage, sort, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseTab(next: TabId) {
    setTab(next);
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setTab("all");
    setPage(1);
  }

  const first = loading && !loaded;
  const now = today();
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const filtersActive = tab !== "all" || Boolean(debouncedQuery);
  const flow = Math.max(1, summary.all);

  return (
    <AppPage
      fullWidth
      backAction={{ content: "ROV overview", url: "/dashboard/rov" }}
      primaryAction={{ content: "New project", url: "/dashboard/rov/projects/new" }}
      secondaryActions={[{ content: "Reports", url: "/dashboard/rov/reports" }]}
      subtitle="Every ROV inspection job, its site, client and where it is in the workflow."
      title="Inspection projects"
    >
      <div className="pl rov-pl">
        {error ? (
          <div className="ac-error">
            {error}{" "}
            <button className="st-link" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}

        <section className={cn("pl-hero", loading && loaded && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">In progress</span>
            <strong className="pl-hero__value">{first ? "…" : summary.inProgress}</strong>
            <span className="pl-hero__period">
              {first
                ? "Loading…"
                : summary.all === 0
                  ? "No live projects yet"
                  : `of ${summary.all} live project${summary.all === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className="pl-hero__tiles">
            <button className="ac-tile is-link" type="button" onClick={() => chooseTab("draft")}>
              <span>Planned</span>
              <strong>{summary.draft}</strong>
              <small>
                {summary.startingSoon > 0 ? `${summary.startingSoon} starting within 2 weeks` : "Draft projects"}
              </small>
            </button>
            <button
              className={cn("ac-tile is-link", summary.overdue > 0 && "is-alert")}
              type="button"
              onClick={() => {
                setSort("end_date");
                chooseTab("all");
              }}
            >
              <span>Overdue</span>
              <strong>{summary.overdue}</strong>
              <small>{summary.overdue > 0 ? "Past the end date, still open" : "Everything on schedule"}</small>
            </button>
            <button className="ac-tile is-link" type="button" onClick={() => chooseTab("completed")}>
              <span>Completed</span>
              <strong>{summary.completed}</strong>
              <small>{summary.archived > 0 ? `${summary.archived} more archived` : "Finished jobs"}</small>
            </button>
          </div>

          {summary.all > 0 ? (
            <div className="pl-hero__bar">
              <div className="st-split">
                <b className="is-ok" style={{ width: `${(summary.completed / flow) * 100}%` }} />
                <b className="is-low" style={{ width: `${(summary.inProgress / flow) * 100}%` }} />
                <b className="is-muted" style={{ width: `${(summary.draft / flow) * 100}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="st-dot is-ok" /> Completed {summary.completed}
                </span>
                <span>
                  <i className="st-dot is-low" /> In progress {summary.inProgress}
                </span>
                <span>
                  <i className="st-dot is-muted" /> Draft {summary.draft}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters">
              {TABS.map((t) => (
                <button
                  className={cn("iv-filter", tab === t.id && "is-active")}
                  key={t.id}
                  type="button"
                  onClick={() => chooseTab(t.id)}
                >
                  {t.label} <span>{summary[t.key]}</span>
                </button>
              ))}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search projects"
                  labelHidden
                  placeholder="Project, site, client or description"
                  prefix={<Icon source={SearchIcon} />}
                  value={query}
                  onChange={setQuery}
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
              <Select
                label="Sort"
                labelInline
                options={SORT_OPTIONS}
                value={sort}
                onChange={(value) => {
                  setSort(value as RovProjectSort);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={8} />
            </div>
          ) : projects.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={ImageIcon} />
              </span>
              <strong>
                {debouncedQuery
                  ? `No projects match “${debouncedQuery}”`
                  : summary.all === 0 && tab === "all"
                    ? "No inspection projects yet"
                    : "Nothing in this view"}
              </strong>
              <p>
                {summary.all === 0 && tab === "all"
                  ? "Create a project to add structures, upload dive media and share a client report."
                  : "Try another search or status."}
              </p>
              {summary.all === 0 && tab === "all" && !debouncedQuery ? (
                <Button url="/dashboard/rov/projects/new" variant="primary">
                  New project
                </Button>
              ) : filtersActive ? (
                <Button onClick={clearFilters}>Show all projects</Button>
              ) : null}
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              <li className={cn("rov-pl__row is-head", showBranchColumn && "has-branch")} aria-hidden>
                <span />
                <span>Project</span>
                <span>Schedule</span>
                {showBranchColumn ? <span>Branch</span> : null}
                <span>Progress</span>
                <span>Findings</span>
                <span />
              </li>
              {projects.map((project) => {
                const url = `/dashboard/rov/projects/${project.id}`;
                const pr = rovJobProgress(project);
                const thumb = rovAssetUrl(project.planViewPath);
                const status = ROV_STATUS[project.status];
                const note = scheduleNote(project, now);
                const findings = project.findingCount ?? 0;
                const majors = project.majorCount ?? 0;
                const live = project.status !== "archived" && project.status !== "completed";
                return (
                  <li
                    className={cn("rov-pl__row", showBranchColumn && "has-branch", project.status === "archived" && "is-muted")}
                    key={project.id}
                  >
                    <NextLink className="rov-ov__thumb" href={url}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={thumb} />
                      ) : (
                        <Icon source={ImageIcon} />
                      )}
                    </NextLink>

                    <div className="rov-pl__main">
                      <div className="rov-ov__job-title">
                        <NextLink href={url}>{project.name}</NextLink>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      <small>
                        {[project.customerName, project.location].filter(Boolean).join(" · ") || "No client or site yet"}
                      </small>
                      {project.description ? <small className="rov-pl__desc">{project.description}</small> : null}
                    </div>

                    <div className="rov-pl__dates">
                      <span>
                        {project.startDate ? formatAppDate(project.startDate) : "No start date"}
                        {project.endDate ? ` – ${formatAppDate(project.endDate)}` : ""}
                      </span>
                      {note ? <small className={cn(note.alert && "is-overdue")}>{note.text}</small> : null}
                    </div>

                    {showBranchColumn ? <span className="rov-pl__branch">{branchLabel(project.branchId)}</span> : null}

                    <div className="rov-pl__progress">
                      <div className="rov-pl__bar" aria-label={`${pr.step} of ${ROV_STEPS.length} steps done`}>
                        {ROV_STEPS.map((label, i) => (
                          <b className={cn(pr.done[i] && "is-on")} key={label} title={label} />
                        ))}
                      </div>
                      <small>
                        {project.structureCount ?? 0} struct. · {project.mediaCount ?? 0} media
                        {project.reportStatus ? ` · report ${project.reportStatus}` : ""}
                      </small>
                    </div>

                    <div className="rov-pl__findings">
                      <strong>{findings}</strong>
                      {majors > 0 ? <Badge tone="critical">{`${majors} major`}</Badge> : <small>{findings ? "No major" : "None yet"}</small>}
                    </div>

                    <div className="rov-pl__actions">
                      <Button
                        size="slim"
                        url={live ? pr.next.url : url}
                        variant={live && pr.next.label !== "Open" ? "primary" : undefined}
                      >
                        {live ? pr.next.label : "Open"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!first && total > 0 ? (
            <div className="iv-pager">
              <span>
                Showing{" "}
                <strong>
                  {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, total)}
                </strong>{" "}
                of <strong>{total}</strong> project{total === 1 ? "" : "s"}
                {filtersActive ? (
                  <>
                    {" "}
                    ·{" "}
                    <button className="st-link" type="button" onClick={clearFilters}>
                      Show all
                    </button>
                  </>
                ) : null}
              </span>
              <div className="iv-pager__controls">
                <div className="ex-perpage">
                  <Select
                    label="Rows per page"
                    labelInline
                    options={PAGE_SIZES.map((n) => ({ label: String(n), value: String(n) }))}
                    value={String(perPage)}
                    onChange={(value) => {
                      setPerPage(Number(value));
                      setPage(1);
                    }}
                  />
                </div>
                <Pagination
                  hasNext={safePage < totalPages}
                  hasPrevious={safePage > 1}
                  label={`${safePage} / ${totalPages}`}
                  onNext={() => setPage(safePage + 1)}
                  onPrevious={() => setPage(safePage - 1)}
                />
              </div>
            </div>
          ) : null}
        </section>

        <p className="pl-foot">
          The five dots track Project → Structures → Media → Findings → Report shared. The button on each row opens the
          next step. &ldquo;All&rdquo; hides archived projects.
        </p>
      </div>
    </AppPage>
  );
}
