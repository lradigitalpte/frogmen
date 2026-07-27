"use client";

import {
  Badge,
  BlockStack,
  Button,
  Card,
  IndexTable,
  Text,
} from "@shopify/polaris";
import {
  Anchor,
  ClipboardList,
  FileText,
  FolderKanban,
  MapPin,
  Share2,
  Waves,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import { listReports, listRovProjects } from "@/lib/rov-api";
import type { RovProject, RovProjectStatus } from "@/types/rov";

const WORKFLOW_STEPS = [
  {
    step: 1,
    title: "Create project",
    description: "Set client, site location, and inspection schedule.",
    href: "/dashboard/rov/projects/new",
  },
  {
    step: 2,
    title: "Add structures",
    description: "Upload engineering diagrams and surface photos per pile or section.",
    href: "/dashboard/rov/projects",
  },
  {
    step: 3,
    title: "Upload media",
    description: "Attach ROV video and images to each structure via S3.",
    href: "/dashboard/rov/projects",
  },
  {
    step: 4,
    title: "Annotate findings",
    description: "Place severity-coded pins on diagrams and link media to each observation.",
    href: "/dashboard/rov/projects",
  },
  {
    step: 5,
    title: "Share report",
    description: "Generate a client-facing link with interactive map and optional PDF.",
    href: "/dashboard/rov/reports",
  },
];

function statusTone(
  status: RovProjectStatus,
): "success" | "warning" | "info" | undefined {
  if (status === "completed") return "success";
  if (status === "in_progress") return "warning";
  if (status === "archived") return "info";
  return undefined;
}

function formatStatus(status: RovProjectStatus) {
  return status.replace(/_/g, " ");
}

export function RovOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<RovProject[]>([]);
  const [sharedReports, setSharedReports] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsResult, reports] = await Promise.all([
        listRovProjects({ perPage: 200 }),
        listReports(),
      ]);
      setProjects(projectsResult.data);
      setSharedReports(
        reports.filter((report) => report.status === "shared" || report.sharedLinkHash)
          .length,
      );
    } catch {
      setProjects([]);
      setSharedReports(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const inProgress = projects.filter((p) => p.status === "in_progress").length;
    const completed = projects.filter((p) => p.status === "completed").length;
    const draft = projects.filter((p) => p.status === "draft").length;
    return {
      total: projects.length,
      inProgress,
      completed,
      draft,
    };
  }, [projects]);

  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [projects],
  );

  return (
    <AppPage
      title="ROV Inspection"
      subtitle="Plan underwater inspections, capture findings on site diagrams, and deliver shareable client reports."
      primaryAction={{
        content: "New project",
        onAction: () => router.push("/dashboard/rov/projects/new"),
      }}
      secondaryActions={[
        {
          content: "All projects",
          onAction: () => router.push("/dashboard/rov/projects"),
        },
        {
          content: "Reports",
          onAction: () => router.push("/dashboard/rov/reports"),
        },
      ]}
    >
      <div className="rov-overview">
        <div className="rov-overview__hero">
          <div className="rov-overview__hero-copy">
            <span className="rov-overview__eyebrow">
              <Waves className="size-3.5" />
              Inspection workspace
            </span>
            <h2 className="rov-overview__hero-title">
              From dive footage to client-ready reports
            </h2>
            <p className="rov-overview__hero-text">
              Manage ROV jobs end to end   structures, annotated diagrams, linked
              media, and password-free share links for your clients.
            </p>
          </div>
          <div className="rov-overview__hero-actions">
            <Button
              variant="primary"
              onClick={() => router.push("/dashboard/rov/projects/new")}
            >
              New inspection project
            </Button>
            <Button onClick={() => router.push("/dashboard/rov/projects")}>
              Browse projects
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<FolderKanban className="size-5" />}
            label="Projects"
            value={String(stats.total)}
            hint={`${stats.draft} draft · ${stats.inProgress} active`}
            loading={loading}
          />
          <KpiCard
            icon={<Anchor className="size-5" />}
            label="In progress"
            value={String(stats.inProgress)}
            hint="Inspections currently underway"
            tone={stats.inProgress > 0 ? "default" : "muted"}
            loading={loading}
          />
          <KpiCard
            icon={<MapPin className="size-5" />}
            label="Completed"
            value={String(stats.completed)}
            hint="Finished inspection jobs"
            tone="success"
            loading={loading}
          />
          <KpiCard
            icon={<Share2 className="size-5" />}
            label="Shared reports"
            value={String(sharedReports)}
            hint="Client links published"
            tone={sharedReports > 0 ? "success" : "muted"}
            loading={loading}
          />
        </div>

        <div className="rov-overview__quick-grid">
          <button
            type="button"
            className="rov-overview__quick-card"
            onClick={() => router.push("/dashboard/rov/projects/new")}
          >
            <span className="rov-overview__quick-icon rov-overview__quick-icon--primary">
              <FolderKanban className="size-5" />
            </span>
            <span className="rov-overview__quick-title">Start a project</span>
            <span className="rov-overview__quick-text">
              Create a job, assign a client, and set the site location.
            </span>
          </button>
          <button
            type="button"
            className="rov-overview__quick-card"
            onClick={() => router.push("/dashboard/rov/projects")}
          >
            <span className="rov-overview__quick-icon">
              <ClipboardList className="size-5" />
            </span>
            <span className="rov-overview__quick-title">Inspection projects</span>
            <span className="rov-overview__quick-text">
              Open structures, media, annotations, and per-project reports.
            </span>
          </button>
          <button
            type="button"
            className="rov-overview__quick-card"
            onClick={() => router.push("/dashboard/rov/reports")}
          >
            <span className="rov-overview__quick-icon">
              <FileText className="size-5" />
            </span>
            <span className="rov-overview__quick-title">Report hub</span>
            <span className="rov-overview__quick-text">
              Review generated reports and copy share links for clients.
            </span>
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Recent projects
                </Text>
                <Text as="p" tone="subdued">
                  Jump back into your latest inspection work.
                </Text>
              </BlockStack>

              {recentProjects.length === 0 && !loading ? (
                <div className="rov-overview__empty">
                  <Text as="p" tone="subdued">
                    No projects yet. Create your first ROV inspection to get started.
                  </Text>
                  <Button
                    onClick={() => router.push("/dashboard/rov/projects/new")}
                  >
                    Create project
                  </Button>
                </div>
              ) : (
                <IndexTable
                  resourceName={{ singular: "project", plural: "projects" }}
                  itemCount={recentProjects.length}
                  headings={[
                    { title: "Project" },
                    { title: "Client" },
                    { title: "Status" },
                    { title: "Structures" },
                  ]}
                  loading={loading}
                  selectable={false}
                >
                  {recentProjects.map((project, index) => (
                    <IndexTable.Row
                      id={project.id}
                      key={project.id}
                      position={index}
                      onClick={() =>
                        router.push(`/dashboard/rov/projects/${project.id}`)
                      }
                    >
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="semibold">
                            {project.name}
                          </Text>
                          {project.location ? (
                            <Text as="span" tone="subdued" variant="bodySm">
                              {project.location}
                            </Text>
                          ) : null}
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {project.customerName ?? " "}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={statusTone(project.status)}>
                          {formatStatus(project.status)}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {project.structureCount ?? 0}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Inspection workflow
                </Text>
                <Text as="p" tone="subdued">
                  Follow these steps for every ROV job.
                </Text>
              </BlockStack>

              <div className="rov-overview__workflow">
                {WORKFLOW_STEPS.map((item) => (
                  <button
                    key={item.step}
                    type="button"
                    className="rov-overview__workflow-step"
                    onClick={() => router.push(item.href)}
                  >
                    <span className="rov-overview__workflow-index">
                      {item.step}
                    </span>
                    <span className="rov-overview__workflow-body">
                      <span className="rov-overview__workflow-title">
                        {item.title}
                      </span>
                      <span className="rov-overview__workflow-desc">
                        {item.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </BlockStack>
          </Card>
        </div>
      </div>
    </AppPage>
  );
}
