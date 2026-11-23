"use client";

import { Badge, Button, Icon, Pagination, Select, SkeletonBodyText, TextField } from "@shopify/polaris";
import { FileIcon, SearchIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { formatAppDate } from "@/lib/format-date";
import { listReports } from "@/lib/rov-api";
import { cn } from "@/lib/utils";
import type { InspectionReport, InspectionReportStatus } from "@/types/rov";

type TabId = "all" | "ready" | InspectionReportStatus;
type SortMode = "updated" | "views" | "title";

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Recently updated", value: "updated" },
  { label: "Most viewed", value: "views" },
  { label: "Title A–Z", value: "title" },
];

const PAGE_SIZES = [16, 25, 50, 100];

type LinkState = "live" | "expired" | "none";

function linkState(report: InspectionReport, nowMs: number): LinkState {
  if (!report.sharedLinkHash) return "none";
  if (report.sharedLinkExpiresAt && Date.parse(report.sharedLinkExpiresAt) < nowMs) return "expired";
  return "live";
}

/** Which tab a report belongs to. Any report with a link counts as shared. */
function bucket(report: InspectionReport): InspectionReportStatus {
  if (report.status === "archived") return "archived";
  if (report.sharedLinkHash || report.status === "shared") return "shared";
  return report.status;
}

function statusBadge(status: InspectionReportStatus) {
  if (status === "shared") return <Badge tone="success">Shared</Badge>;
  if (status === "final") return <Badge tone="info">Final</Badge>;
  if (status === "archived") return <Badge>Archived</Badge>;
  return <Badge tone="attention">Draft</Badge>;
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

export function RovReportsHubPage() {
  const { showSuccess, showError } = useToast();
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("updated");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(16);
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReports(await listReports());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const s = { all: 0, draft: 0, final: 0, shared: 0, archived: 0, ready: 0, live: 0, expired: 0, views: 0 };
    let lastViewed: string | null = null;
    for (const r of reports) {
      const b = bucket(r);
      s[b] += 1;
      if (b !== "archived") s.all += 1;
      if (r.status === "final" && !r.sharedLinkHash) s.ready += 1;
      const ls = linkState(r, nowMs);
      if (ls === "live") s.live += 1;
      if (ls === "expired") s.expired += 1;
      s.views += r.viewCount ?? 0;
      if (r.lastViewedAt && (!lastViewed || r.lastViewedAt > lastViewed)) lastViewed = r.lastViewedAt;
    }
    return { ...s, lastViewed };
  }, [reports, nowMs]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = reports.filter((r) => {
      const b = bucket(r);
      if (tab === "all" && b === "archived") return false;
      if (tab === "ready" && !(r.status === "final" && !r.sharedLinkHash)) return false;
      if (tab !== "all" && tab !== "ready" && b !== tab) return false;
      if (!term) return true;
      return [r.title, r.projectName, r.customerName, r.summary]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(term));
    });
    rows.sort((a, b) => {
      if (sort === "views") return (b.viewCount ?? 0) - (a.viewCount ?? 0);
      if (sort === "title") return (a.title ?? "").localeCompare(b.title ?? "");
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return rows;
  }, [reports, tab, query, sort]);

  useEffect(() => {
    setPage(1);
  }, [tab, query, sort, perPage]);

  async function copyLink(report: InspectionReport) {
    const url = `${window.location.origin}/report/${report.sharedLinkHash}`;
    try {
      await navigator.clipboard.writeText(url);
      showSuccess("Client link copied");
    } catch {
      showError("Could not copy. Open the report and copy the link from there.");
    }
  }

  const first = loading && !loaded;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const filtersActive = tab !== "all" || Boolean(query.trim());
  const flow = Math.max(1, stats.all);

  const tabs: Array<{ id: TabId; label: string; count: number; alert?: boolean }> = [
    { id: "all", label: "All", count: stats.all },
    { id: "ready", label: "Ready to share", count: stats.ready, alert: true },
    { id: "draft", label: "Draft", count: stats.draft },
    { id: "final", label: "Final", count: stats.final },
    { id: "shared", label: "Shared", count: stats.shared },
    { id: "archived", label: "Archived", count: stats.archived },
  ];

  return (
    <AppPage
      fullWidth
      backAction={{ content: "ROV overview", url: "/dashboard/rov" }}
      secondaryActions={[{ content: "Inspection projects", url: "/dashboard/rov/projects" }]}
      subtitle="Every inspection report, who it's shared with and whether the client has opened it."
      title="Inspection reports"
    >
      <div className="pl rov-rh">
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
            <span className="pl-hero__label">Live client links</span>
            <strong className="pl-hero__value">{first ? "…" : stats.live}</strong>
            <span className="pl-hero__period">
              {first
                ? "Loading…"
                : stats.all === 0
                  ? "Create a report from a project's Reports tab"
                  : stats.expired > 0
                    ? `${stats.expired} link${stats.expired === 1 ? " has" : "s have"} expired`
                    : `${plural(stats.all, "report")} in total`}
            </span>
          </div>

          <div className="pl-hero__tiles">
            <button
              className={cn("ac-tile is-link", stats.ready > 0 && "is-alert")}
              type="button"
              onClick={() => setTab("ready")}
            >
              <span>Ready to share</span>
              <strong>{stats.ready}</strong>
              <small>{stats.ready > 0 ? "Final, no client link yet" : "Nothing waiting"}</small>
            </button>
            <button className="ac-tile is-link" type="button" onClick={() => setTab("draft")}>
              <span>Drafts</span>
              <strong>{stats.draft}</strong>
              <small>{stats.draft > 0 ? "Still being written" : "No drafts"}</small>
            </button>
            <div className="ac-tile">
              <span>Client views</span>
              <strong>{stats.views}</strong>
              <small>{stats.lastViewed ? `Last opened ${formatAppDate(stats.lastViewed)}` : "Not opened yet"}</small>
            </div>
          </div>

          {stats.all > 0 ? (
            <div className="pl-hero__bar">
              <div className="st-split">
                <b className="is-ok" style={{ width: `${(stats.shared / flow) * 100}%` }} />
                <b className="is-low" style={{ width: `${(stats.final / flow) * 100}%` }} />
                <b className="is-muted" style={{ width: `${(stats.draft / flow) * 100}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="st-dot is-ok" /> Shared {stats.shared}
                </span>
                <span>
                  <i className="st-dot is-low" /> Final {stats.final}
                </span>
                <span>
                  <i className="st-dot is-muted" /> Draft {stats.draft}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters">
              {tabs.map((t) => (
                <button
                  className={cn("iv-filter", tab === t.id && "is-active", t.alert && t.count > 0 && "is-alert")}
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                >
                  {t.label} <span>{t.count}</span>
                </button>
              ))}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search reports"
                  labelHidden
                  placeholder="Report title, project or client"
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
                onChange={(value) => setSort(value as SortMode)}
              />
            </div>
          </div>

          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={6} />
            </div>
          ) : pageRows.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={FileIcon} />
              </span>
              <strong>
                {query.trim()
                  ? `No reports match “${query.trim()}”`
                  : reports.length === 0
                    ? "No reports yet"
                    : tab === "ready"
                      ? "Nothing waiting to be shared"
                      : "Nothing in this view"}
              </strong>
              <p>
                {reports.length === 0
                  ? "Open a project, log its findings, then create the report from its Reports tab."
                  : "Try another search or status."}
              </p>
              {reports.length === 0 ? (
                <Button url="/dashboard/rov/projects" variant="primary">
                  Go to projects
                </Button>
              ) : filtersActive ? (
                <Button
                  onClick={() => {
                    setTab("all");
                    setQuery("");
                  }}
                >
                  Show all reports
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              <li className="rov-rh__row is-head" aria-hidden>
                <span>Report</span>
                <span>Client</span>
                <span>Status</span>
                <span>Client link</span>
                <span>Findings</span>
                <span />
              </li>
              {pageRows.map((report) => {
                const workspace = `/dashboard/rov/projects/${report.rovProjectId}?tab=reports`;
                const ls = linkState(report, nowMs);
                const findings = report.findingCount ?? 0;
                const majors = report.majorCount ?? 0;
                const views = report.viewCount ?? 0;
                return (
                  <li className={cn("rov-rh__row", report.status === "archived" && "is-muted")} key={report.id}>
                    <div className="rov-rh__title">
                      <span className="rov-rh__icon" aria-hidden>
                        <Icon source={FileIcon} />
                      </span>
                      <span>
                        <NextLink href={workspace}>{report.title || "Untitled report"}</NextLink>
                        <small>
                          {report.projectName ?? "Project"} · updated {formatAppDate(report.updatedAt)}
                        </small>
                      </span>
                    </div>

                    <span className="rov-rh__client">
                      {report.customerName ? (
                        <span className="wr-customer">
                          <i aria-hidden>{report.customerName.charAt(0).toUpperCase()}</i>
                          <span>{report.customerName}</span>
                        </span>
                      ) : (
                        <span className="rov-rh__none">No client</span>
                      )}
                    </span>

                    <span className="rov-rh__status">{statusBadge(bucket(report))}</span>

                    <span className="rov-rh__link">
                      {ls === "live" ? (
                        <>
                          <span className="rov-rh__state is-live">
                            <i /> Live
                            {report.sharedLinkExpiresAt ? ` until ${formatAppDate(report.sharedLinkExpiresAt)}` : ""}
                          </span>
                          <small>
                            {views > 0
                              ? `${plural(views, "view")} · last ${formatAppDate(report.lastViewedAt)}`
                              : "Not opened yet"}
                          </small>
                        </>
                      ) : ls === "expired" ? (
                        <>
                          <span className="rov-rh__state is-expired">
                            <i /> Expired {formatAppDate(report.sharedLinkExpiresAt)}
                          </span>
                          <small>{plural(views, "view")}</small>
                        </>
                      ) : (
                        <>
                          <span className="rov-rh__state">
                            <i /> Not shared
                          </span>
                          <small>{report.status === "final" ? "Ready to share" : "Finish the report first"}</small>
                        </>
                      )}
                    </span>

                    <span className="rov-rh__findings">
                      <strong>{findings}</strong>
                      {majors > 0 ? <Badge tone="critical">{`${majors} major`}</Badge> : null}
                    </span>

                    <span className="rov-rh__actions">
                      {ls === "live" ? (
                        <>
                          <Button size="slim" onClick={() => void copyLink(report)}>
                            Copy link
                          </Button>
                          <Button size="slim" url={`/report/${report.sharedLinkHash}`} external variant="plain">
                            View
                          </Button>
                        </>
                      ) : (
                        <Button size="slim" url={workspace} variant={report.status === "final" ? "primary" : undefined}>
                          {report.status === "final" ? "Share" : ls === "expired" ? "Renew link" : "Edit"}
                        </Button>
                      )}
                    </span>
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
                of <strong>{total}</strong> report{total === 1 ? "" : "s"}
              </span>
              <div className="iv-pager__controls">
                <div className="ex-perpage">
                  <Select
                    label="Rows per page"
                    labelInline
                    options={PAGE_SIZES.map((n) => ({ label: String(n), value: String(n) }))}
                    value={String(perPage)}
                    onChange={(value) => setPerPage(Number(value))}
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
          Client links don&apos;t need a password. Anyone with the link can open the report, so copy it only to the client.
          Views are counted each time the link is opened.
        </p>
      </div>
    </AppPage>
  );
}
