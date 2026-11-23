"use client";

import { Badge, Button, Icon, SkeletonBodyText } from "@shopify/polaris";
import { ImageIcon, NoteIcon, PlusIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { formatAppDate } from "@/lib/format-date";
import { getRovOverview, rovAssetUrl } from "@/lib/rov-api";
import { cn } from "@/lib/utils";
import { ROV_STATUS as STATUS, ROV_STEPS as STEPS, rovJobProgress as progress } from "@/components/rov/rov-progress";
import type { InspectionSeverity, RovOverview } from "@/types/rov";

const SEVERITY: Record<InspectionSeverity, { label: string; tone: "critical" | "warning" | "info" }> = {
  major: { label: "Major", tone: "critical" },
  moderate: { label: "Moderate", tone: "warning" },
  minor: { label: "Minor", tone: "info" },
};

const WORKFLOW = [
  { title: "Create project", text: "Client, site and dates" },
  { title: "Add structures", text: "Diagram and photo per pile or section" },
  { title: "Upload media", text: "ROV video and stills" },
  { title: "Annotate findings", text: "Severity pins on the diagram" },
  { title: "Share report", text: "Client link and optional PDF" },
];

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function dateRange(start: string | null, end: string | null) {
  if (start && end) return `${formatAppDate(start)} – ${formatAppDate(end)}`;
  if (start) return `From ${formatAppDate(start)}`;
  if (end) return `Due ${formatAppDate(end)}`;
  return "No dates set";
}

export function RovOverviewPage() {
  const [data, setData] = useState<RovOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getRovOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the ROV overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const p = data?.projects;
  const f = data?.findings;
  const m = data?.media;
  const r = data?.reports;
  const open = (p?.draft ?? 0) + (p?.inProgress ?? 0);
  const flow = Math.max(1, (p?.draft ?? 0) + (p?.inProgress ?? 0) + (p?.completed ?? 0));
  const severityTotal = Math.max(1, (f?.major ?? 0) + (f?.moderate ?? 0) + (f?.minor ?? 0));
  const first = loading && !data;

  return (
    <AppPage
      fullWidth
      primaryAction={{ content: "New project", url: "/dashboard/rov/projects/new" }}
      secondaryActions={[
        { content: "All projects", url: "/dashboard/rov/projects" },
        { content: "Reports", url: "/dashboard/rov/reports" },
      ]}
      subtitle="Underwater and visual inspections, from dive footage to client reports."
      title="ROV inspection"
    >
      <div className="pl rov-ov">
        {error ? (
          <div className="ac-error">
            {error}{" "}
            <button className="st-link" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}

        <section className={cn("pl-hero", loading && data && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Open inspection jobs</span>
            <strong className="pl-hero__value">{first ? "…" : open}</strong>
            <span className="pl-hero__period">
              {first
                ? "Loading…"
                : p && p.total === 0
                  ? "Create a project to plan your first dive"
                  : `${p?.inProgress ?? 0} in progress · ${p?.draft ?? 0} draft · ${p?.completed ?? 0} completed`}
            </span>
          </div>

          <div className="pl-hero__tiles">
            <NextLink className={cn("ac-tile is-link", (f?.major ?? 0) > 0 && "is-alert")} href="/dashboard/rov/projects">
              <span>Findings</span>
              <strong>{f?.total ?? 0}</strong>
              <small>{(f?.major ?? 0) > 0 ? `${f?.major} major` : f?.total ? "No major findings" : "None logged yet"}</small>
            </NextLink>
            <div className="ac-tile">
              <span>Media captured</span>
              <strong>{m?.total ?? 0}</strong>
              <small>
                {m?.total ? `${plural(m.video, "video")} · ${plural(m.image, "image")}` : "Nothing uploaded yet"}
              </small>
            </div>
            <NextLink className="ac-tile is-link" href="/dashboard/rov/reports">
              <span>Client links</span>
              <strong>{r?.liveLinks ?? 0}</strong>
              <small>
                {r?.total ? `${plural(r.total, "report")} · ${r.draft} draft` : "No reports yet"}
              </small>
            </NextLink>
          </div>

          {p && p.total - p.archived > 0 ? (
            <div className="pl-hero__bar">
              <div className="st-split">
                <b className="is-ok" style={{ width: `${(p.completed / flow) * 100}%` }} />
                <b className="is-low" style={{ width: `${(p.inProgress / flow) * 100}%` }} />
                <b className="is-muted" style={{ width: `${(p.draft / flow) * 100}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="st-dot is-ok" /> Completed {p.completed}
                </span>
                <span>
                  <i className="st-dot is-low" /> In progress {p.inProgress}
                </span>
                <span>
                  <i className="st-dot is-muted" /> Draft {p.draft}
                </span>
                <span>{plural(data?.structures.total ?? 0, "structure")} inspected</span>
              </div>
            </div>
          ) : null}
        </section>

        <div className="rov-ov__grid">
          <section className="ex-surface">
            <header className="rov-ov__head">
              <div>
                <h2>Active jobs</h2>
                <p>Most recently updated, with the next step for each.</p>
              </div>
              <Button url="/dashboard/rov/projects" variant="plain">
                All projects
              </Button>
            </header>

            {first ? (
              <div className="ex-pad">
                <SkeletonBodyText lines={6} />
              </div>
            ) : !data || data.recentProjects.length === 0 ? (
              <div className="ex-empty">
                <span className="ex-empty__icon">
                  <Icon source={PlusIcon} />
                </span>
                <strong>No active jobs</strong>
                <p>Create a project, assign the client and set the site location.</p>
                <Button url="/dashboard/rov/projects/new" variant="primary">
                  New project
                </Button>
              </div>
            ) : (
              <ul className={cn("ex-list", loading && "st-dim")}>
                {data.recentProjects.map((project) => {
                  const pr = progress(project);
                  const thumb = rovAssetUrl(project.planViewPath);
                  const status = STATUS[project.status];
                  return (
                    <li className="rov-ov__job" key={project.id}>
                      <NextLink className="rov-ov__thumb" href={`/dashboard/rov/projects/${project.id}`}>
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="" src={thumb} />
                        ) : (
                          <Icon source={ImageIcon} />
                        )}
                      </NextLink>

                      <div className="rov-ov__job-main">
                        <div className="rov-ov__job-title">
                          <NextLink href={`/dashboard/rov/projects/${project.id}`}>{project.name}</NextLink>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <small>
                          {[project.customerName, project.location].filter(Boolean).join(" · ") || "No client or site yet"}
                          {" · "}
                          {dateRange(project.startDate, project.endDate)}
                        </small>
                        <div className="rov-ov__steps" aria-label={`${pr.step} of ${STEPS.length} steps done`}>
                          {STEPS.map((label, i) => (
                            <span className={cn(pr.done[i] && "is-on")} key={label} title={label}>
                              <b />
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="rov-ov__counts">
                        <span>
                          <strong>{project.structureCount}</strong> structure{project.structureCount === 1 ? "" : "s"}
                        </span>
                        <span>
                          <strong>{project.mediaCount}</strong> media file{project.mediaCount === 1 ? "" : "s"}
                        </span>
                        <span>
                          <strong>{project.findingCount}</strong> finding{project.findingCount === 1 ? "" : "s"}
                          {project.majorCount > 0 ? (
                            <>
                              {" "}
                              <Badge tone="critical">{`${project.majorCount} major`}</Badge>
                            </>
                          ) : null}
                        </span>
                      </div>

                      <div className="rov-ov__action">
                        <Button
                          size="slim"
                          url={pr.next.url}
                          variant={pr.next.label === "Open" ? undefined : "primary"}
                        >
                          {pr.next.label}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ex-surface rov-ov__side">
            <header className="rov-ov__head">
              <div>
                <h2>Findings</h2>
                <p>Across all live projects.</p>
              </div>
            </header>

            <div className="rov-ov__sev">
              <div className="rov-ov__sev-bar">
                <b className="is-major" style={{ width: `${((f?.major ?? 0) / severityTotal) * 100}%` }} />
                <b className="is-moderate" style={{ width: `${((f?.moderate ?? 0) / severityTotal) * 100}%` }} />
                <b className="is-minor" style={{ width: `${((f?.minor ?? 0) / severityTotal) * 100}%` }} />
              </div>
              <div className="rov-ov__sev-grid">
                {(["major", "moderate", "minor"] as const).map((key) => (
                  <div key={key}>
                    <i className={`rov-ov__dot is-${key}`} />
                    <span>{SEVERITY[key].label}</span>
                    <strong>{f?.[key] ?? 0}</strong>
                  </div>
                ))}
              </div>
            </div>

            <h3 className="rov-ov__sub">Latest findings</h3>
            {first ? (
              <div className="ex-pad">
                <SkeletonBodyText lines={4} />
              </div>
            ) : !data || data.recentFindings.length === 0 ? (
              <p className="rov-ov__none">
                No findings yet. Open a project&apos;s Observations tab and drop pins on a structure diagram.
              </p>
            ) : (
              <ul className="rov-ov__findings">
                {data.recentFindings.map((finding) => {
                  const sev = finding.severity ? SEVERITY[finding.severity] : null;
                  const label = finding.label && finding.label !== finding.observationId ? finding.label : null;
                  const title =
                    finding.findingType ||
                    label ||
                    finding.description?.split(/[\r\n]/)[0] ||
                    (finding.observationId ? null : finding.pointNumber ? `Point ${finding.pointNumber}` : "Finding");
                  return (
                    <li key={finding.id}>
                      <NextLink href={`/dashboard/rov/projects/${finding.projectId}?tab=observations`}>
                        <i className={cn("rov-ov__dot", finding.severity ? `is-${finding.severity}` : "is-none")} />
                        <span>
                          <strong>
                            {[finding.observationId, title].filter(Boolean).join(" · ")}
                          </strong>
                          <small>
                            {finding.structureName} · {finding.projectName}
                          </small>
                        </span>
                        <span className="rov-ov__finding-meta">
                          {sev ? <Badge tone={sev.tone}>{sev.label}</Badge> : <Badge>Unrated</Badge>}
                          <small>{formatAppDate(finding.createdAt)}</small>
                        </span>
                      </NextLink>
                    </li>
                  );
                })}
              </ul>
            )}

            {m && m.unlinked > 0 ? (
              <p className="rov-ov__hint">
                <Icon source={NoteIcon} tone="subdued" />
                {plural(m.unlinked, "media file")} not linked to a finding yet.
              </p>
            ) : null}
          </section>
        </div>

        <section className="rov-ov__flow" aria-label="Inspection workflow">
          {WORKFLOW.map((step, i) => (
            <div key={step.title}>
              <b>{i + 1}</b>
              <span>
                <strong>{step.title}</strong>
                <small>{step.text}</small>
              </span>
            </div>
          ))}
        </section>
      </div>
    </AppPage>
  );
}
