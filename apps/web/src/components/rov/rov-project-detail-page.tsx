"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Modal,
  Select,
  SkeletonBodyText,
  Tabs,
  Text,
} from "@shopify/polaris";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { ROV_STATUS, ROV_STEPS, rovJobProgress } from "@/components/rov/rov-progress";
import { formatAppDate } from "@/lib/format-date";
import { deleteRovProject, getRovProject, updateRovProject } from "@/lib/rov-api";
import { getCompanySettings } from "@/lib/settings-api";
import { cn } from "@/lib/utils";
import type { RovProject, RovProjectStatus } from "@/types/rov";
import { ManageStructuresTab } from "./manage-structures-tab";
import { ManageObservationsTab } from "./manage-observations-tab";
import { ManageMediaTab } from "./manage-media-tab";
import { ManageReportsTab } from "./manage-reports-tab";
import { RovProjectSummary } from "./rov-project-summary";

const STATUS_OPTIONS: Array<{ label: string; value: RovProjectStatus }> = [
  { label: "Draft", value: "draft" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Archived", value: "archived" },
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function schedule(project: RovProject) {
  const start = project.startDate?.slice(0, 10);
  const end = project.endDate?.slice(0, 10);
  const open = project.status === "draft" || project.status === "in_progress";
  const range =
    start && end
      ? `${formatAppDate(start)} – ${formatAppDate(end)}`
      : start
        ? `From ${formatAppDate(start)}`
        : end
          ? `Due ${formatAppDate(end)}`
          : "No dates set";
  const now = todayIso();
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  let note: { text: string; alert: boolean } | null = null;
  if (open && end && end < now) note = { text: `Overdue by ${days(end, now)} d`, alert: true };
  else if (open && start && start > now) note = { text: `Starts in ${days(now, start)} d`, alert: false };
  else if (open && end) note = { text: `${days(now, end)} d left`, alert: false };
  return { range, note };
}

const WORKSPACE_TABS = [
  { id: "structures", content: "Structures" },
  { id: "observations", content: "Observations" },
  { id: "media", content: "Media" },
  { id: "reports", content: "Reports" },
] as const;

const SECTION_HELP: Record<(typeof WORKSPACE_TABS)[number]["id"], string> = {
  structures:
    "Add piles, dolphins, or sections. Upload a diagram on each structure, then annotate findings.",
  observations:
    "All severity-coded pins across every structure and inspection view.",
  media: "ROV video, images, and documents linked to structures or observations.",
  reports: "Generate client share links and downloadable inspection reports.",
};

type SectionId = (typeof WORKSPACE_TABS)[number]["id"];

function isSectionId(value: string): value is SectionId {
  return WORKSPACE_TABS.some((tab) => tab.id === value);
}

export function RovProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<RovProject | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const { showSuccess, showError } = useToast();

  const activeSection = WORKSPACE_TABS[selectedTab]?.id ?? "structures";

  const changeStatus = useCallback(
    async (status: RovProjectStatus) => {
      if (!project || status === project.status) return;
      setSavingStatus(true);
      try {
        await updateRovProject(project.id, { status });
        setProject((current) => (current ? { ...current, status } : current));
        showSuccess(`Marked as ${ROV_STATUS[status].label.toLowerCase()}`);
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not change the status");
      } finally {
        setSavingStatus(false);
      }
    },
    [project, showError, showSuccess],
  );

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRovProject(projectId);
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
    void getCompanySettings()
      .then((settings) => setCompanyName(settings.name))
      .catch(() => setCompanyName(""));
  }, [loadProject]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && isSectionId(tab)) {
      const index = WORKSPACE_TABS.findIndex((item) => item.id === tab);
      if (index >= 0) setSelectedTab(index);
    }
  }, [searchParams]);

  const handleTabChange = useCallback(
    (index: number) => {
      setSelectedTab(index);
      void getRovProject(projectId)
        .then(setProject)
        .catch(() => undefined);
      const tabId = WORKSPACE_TABS[index]?.id;
      if (!tabId) return;
      router.replace(`/dashboard/rov/projects/${projectId}?tab=${tabId}`, {
        scroll: false,
      });
    },
    [projectId, router],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteRovProject(projectId);
      router.push("/dashboard/rov/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }, [projectId, router]);

  if (loading && !project) {
    return (
      <AppPage title="Loading project…" subtitle="">
        <Card>
          <SkeletonBodyText lines={6} />
        </Card>
      </AppPage>
    );
  }

  if (!project) {
    return (
      <AppPage title="Project not found" subtitle="">
        {error ? <Banner tone="critical">{error}</Banner> : null}
      </AppPage>
    );
  }

  const stats = project.stats;
  const status = ROV_STATUS[project.status];
  const sched = schedule(project);
  const progress = rovJobProgress({
    id: project.id,
    structureCount: stats?.structureCount ?? project.structures?.length ?? 0,
    mediaCount: stats?.mediaCount ?? 0,
    findingCount: stats?.findingCount ?? 0,
    reportStatus: stats?.reportStatus ?? null,
  });

  function goToNext() {
    const tab = new URL(progress.next.url, window.location.origin).searchParams.get("tab");
    const index = WORKSPACE_TABS.findIndex((item) => item.id === tab);
    if (index >= 0) handleTabChange(index);
  }

  const tabCounts: Record<SectionId, number | undefined> = {
    structures: stats?.structureCount ?? project.structures?.length,
    observations: stats?.findingCount,
    media: stats?.mediaCount,
    reports: stats?.reportCount,
  };

  return (
    <AppPage
      title={project.name}
      subtitle={project.location ? `Inspection project · ${project.location}` : "Inspection project"}
      backAction={{
        content: "Projects",
        onAction: () => router.push("/dashboard/rov/projects"),
      }}
      secondaryActions={[{ content: "All reports", url: "/dashboard/rov/reports" }]}
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <BlockStack gap="400">
          <section className="pl-hero rov-pd__hero">
            <div className="pl-hero__main">
              <span className="pl-hero__label">Project status</span>
              <strong className="rov-pd__title">
                <i className={cn("rov-pd__dot", `is-${project.status}`)} aria-hidden />
                {status.label}
              </strong>
              <span className="pl-hero__period">
                {[project.customerName ? `Client ${project.customerName}` : "No client", project.location]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="rov-pd__dates">
                {sched.range}
                {sched.note ? (
                  <em className={cn(sched.note.alert && "is-alert")}>{sched.note.text}</em>
                ) : null}
              </span>
              {project.description ? <p className="rov-pd__desc">{project.description}</p> : null}
            </div>

            <div className="pl-hero__tiles">
              <button className="ac-tile is-link" type="button" onClick={() => handleTabChange(0)}>
                <span>Structures</span>
                <strong>{stats?.structureCount ?? project.structures?.length ?? 0}</strong>
                <small>
                  {stats
                    ? stats.withDiagram === stats.structureCount
                      ? stats.structureCount
                        ? "All have diagrams"
                        : "None added yet"
                      : `${stats.structureCount - stats.withDiagram} need a diagram`
                    : "Piles and sections"}
                </small>
              </button>
              <button
                className={cn("ac-tile is-link", (stats?.majorCount ?? 0) > 0 && "is-alert")}
                type="button"
                onClick={() => handleTabChange(1)}
              >
                <span>Findings</span>
                <strong>{stats?.findingCount ?? 0}</strong>
                <small>
                  {stats && stats.findingCount > 0
                    ? `${stats.majorCount} major · ${stats.moderateCount} moderate · ${stats.minorCount} minor`
                    : "None logged yet"}
                </small>
              </button>
              <button className="ac-tile is-link" type="button" onClick={() => handleTabChange(2)}>
                <span>Media</span>
                <strong>{stats?.mediaCount ?? 0}</strong>
                <small>Video, images and documents</small>
              </button>
              <button className="ac-tile is-link" type="button" onClick={() => handleTabChange(3)}>
                <span>Report</span>
                <strong className="rov-pd__report">
                  {stats?.reportStatus === "shared"
                    ? "Shared"
                    : stats?.reportStatus === "final"
                      ? "Final"
                      : stats?.reportStatus === "draft"
                        ? "Draft"
                        : "None"}
                </strong>
                <small>{stats?.reportStatus === "shared" ? "Client link is live" : "Not shared with the client"}</small>
              </button>
            </div>

            <div className="rov-pd__flow">
              <ol className="rov-pd__steps">
                {ROV_STEPS.map((label, i) => (
                  <li className={cn(progress.done[i] && "is-on")} key={label}>
                    <b>{progress.done[i] ? "✓" : i + 1}</b>
                    {label}
                  </li>
                ))}
              </ol>
              <div className="rov-pd__next">
                {progress.next.label !== "Open" ? (
                  <Button variant="primary" onClick={() => goToNext()}>
                    {`Next: ${progress.next.label}`}
                  </Button>
                ) : project.status !== "completed" && project.status !== "archived" ? (
                  <Button loading={savingStatus} variant="primary" onClick={() => void changeStatus("completed")}>
                    Mark completed
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="rov-pd__bar">
            <div className="rov-pd__status">
              <Select
                disabled={savingStatus}
                label="Status"
                labelInline
                options={STATUS_OPTIONS}
                value={project.status}
                onChange={(value) => void changeStatus(value as RovProjectStatus)}
              />
            </div>
            <div className="rov-pd__actions">
              <Button onClick={() => setDetailsOpen((open) => !open)}>
                {detailsOpen ? "Hide details" : "Project details"}
              </Button>
              <Button url={`/dashboard/rov/projects/${projectId}/edit`}>Edit</Button>
              <Button variant="plain" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </div>
          </div>

          {detailsOpen ? (
            <RovProjectSummary project={project} companyName={companyName} />
          ) : null}

          <Card padding="0">
            <Tabs
              tabs={WORKSPACE_TABS.map((tab) => ({
                ...tab,
                badge: tabCounts[tab.id] !== undefined ? String(tabCounts[tab.id]) : undefined,
              }))}
              selected={selectedTab}
              onSelect={handleTabChange}
            >
              <div className="rov-project-workspace__panel">
                {activeSection === "reports" ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    {SECTION_HELP[activeSection]}
                  </Text>
                ) : null}

                {activeSection === "structures" ? (
                  <ManageStructuresTab
                    project={project}
                    onUpdated={() => void loadProject()}
                  />
                ) : null}

                {activeSection === "observations" ? (
                  <ManageObservationsTab projectId={projectId} onChanged={() => void loadProject()} />
                ) : null}

                {activeSection === "media" ? (
                  <ManageMediaTab
                    onChanged={() => void loadProject()}
                    projectId={projectId}
                    structures={project.structures ?? []}
                  />
                ) : null}

                {activeSection === "reports" ? (
                  <ManageReportsTab
                    projectId={projectId}
                    projectName={project.name}
                    clientName={project.customerName}
                    location={project.location}
                    structureCount={project.structures?.length ?? 0}
                  />
                ) : null}
              </div>
            </Tabs>
          </Card>
        </BlockStack>
      </BlockStack>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete inspection project?"
        primaryAction={{
          content: "Delete project",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This will permanently delete <strong>{project.name}</strong> and all
            related structures, observations, media, and reports.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
