"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Modal,
  Tabs,
  Text,
} from "@shopify/polaris";
import { MapPin } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { deleteRovProject, getRovProject } from "@/lib/rov-api";
import { getCompanySettings } from "@/lib/settings-api";
import type { RovProject, RovProjectStatus } from "@/types/rov";
import { ManageStructuresTab } from "./manage-structures-tab";
import { ManageObservationsTab } from "./manage-observations-tab";
import { ManageMediaTab } from "./manage-media-tab";
import { ManageReportsTab } from "./manage-reports-tab";
import {
  formatStatus,
  RovProjectSummary,
  statusTone,
} from "./rov-project-summary";

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

  const activeSection = WORKSPACE_TABS[selectedTab]?.id ?? "structures";

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
      <AppPage title="Loading project..." subtitle="">
        <Text as="p" tone="subdued">
          Loading project…
        </Text>
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

  return (
    <AppPage
      title={project.name}
      subtitle={project.location ?? "Inspection project workspace"}
      backAction={{
        content: "Projects",
        onAction: () => router.push("/dashboard/rov/projects"),
      }}
      secondaryActions={[
        {
          content: "Edit",
          onAction: () =>
            router.push(`/dashboard/rov/projects/${projectId}/edit`),
        },
      ]}
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <BlockStack gap="400">
          <Card>
            <InlineStack align="space-between" blockAlign="start" gap="400">
              <BlockStack gap="300">
                <Badge tone={statusTone(project.status as RovProjectStatus)}>
                  {formatStatus(project.status)}
                </Badge>

                <InlineStack gap="400" wrap>
                  {project.location ? (
                    <InlineStack gap="100" blockAlign="center">
                      <MapPin size={15} />
                      <Text as="span" tone="subdued">
                        {project.location}
                      </Text>
                    </InlineStack>
                  ) : null}
                  {project.customerName ? (
                    <Text as="span" tone="subdued">
                      Client: {project.customerName}
                    </Text>
                  ) : null}
                  <Text as="span" tone="subdued">
                    Structures: {project.structures?.length ?? 0}
                  </Text>
                </InlineStack>

                {project.description ? (
                  <Text as="p" tone="subdued">
                    {project.description}
                  </Text>
                ) : null}
              </BlockStack>

              <InlineStack gap="200">
                <Button onClick={() => setDetailsOpen((open) => !open)}>
                  {detailsOpen ? "Hide details" : "Project details"}
                </Button>
                <Button
                  onClick={() =>
                    router.push(`/dashboard/rov/projects/${projectId}/edit`)
                  }
                >
                  Edit
                </Button>
                <Button tone="critical" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              </InlineStack>
            </InlineStack>
          </Card>

          {detailsOpen ? (
            <RovProjectSummary project={project} companyName={companyName} />
          ) : null}

          <Card padding="0">
            <Tabs
              tabs={[...WORKSPACE_TABS]}
              selected={selectedTab}
              onSelect={handleTabChange}
            >
              <div className="rov-project-workspace__panel">
                {activeSection !== "structures" ? (
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
                  <ManageObservationsTab projectId={projectId} />
                ) : null}

                {activeSection === "media" ? (
                  <ManageMediaTab
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
