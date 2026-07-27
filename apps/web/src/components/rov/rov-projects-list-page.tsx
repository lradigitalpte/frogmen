"use client";

import {
  Badge,
  Banner,
  BlockStack,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  Link,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { listRovProjects } from "@/lib/rov-api";
import type { RovProject, RovProjectStatus } from "@/types/rov";
import { useBranchLabels } from "@/hooks/use-branch-labels";

const STATUS_TABS = [
  { id: "all", content: "All projects" },
  { id: "in_progress", content: "Active" },
  { id: "draft", content: "Draft" },
  { id: "completed", content: "Completed" },
  { id: "archived", content: "Archived" },
] as const;

const PER_PAGE = 25;

function statusTone(
  status: RovProjectStatus,
): "success" | "warning" | "info" | "attention" | undefined {
  if (status === "completed") return "success";
  if (status === "in_progress") return "warning";
  if (status === "archived") return "info";
  if (status === "draft") return "attention";
  return undefined;
}

function formatStatus(status: RovProjectStatus) {
  if (status === "in_progress") return "In progress";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string | null | undefined) {
  if (!value) return " ";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function RovProjectsListPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState(0);
  const [page, setPage] = useState(1);
  const [projects, setProjects] = useState<RovProject[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);
  const { showBranchColumn, branchLabel } = useBranchLabels();

  const activeStatus = STATUS_TABS[selectedTab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, selectedTab]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listRovProjects({
        search: debouncedQuery || undefined,
        status: activeStatus === "all" ? undefined : activeStatus,
        page,
        perPage: PER_PAGE,
      });
      setProjects(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
      setProjects([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, activeStatus, page]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const rowMarkup = useMemo(
    () =>
      projects.map((project, index) => (
        <IndexTable.Row id={project.id} key={project.id} position={index}>
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Link
                dataPrimaryLink
                url={`/dashboard/rov/projects/${project.id}`}
              >
                <Text as="span" fontWeight="semibold">
                  {project.name}
                </Text>
              </Link>
              {project.description ? (
                <Text as="span" tone="subdued" variant="bodySm">
                  {project.description.length > 60
                    ? `${project.description.slice(0, 60)}…`
                    : project.description}
                </Text>
              ) : null}
            </BlockStack>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" tone={project.location ? undefined : "subdued"}>
              {project.location ?? " "}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" tone={project.customerName ? undefined : "subdued"}>
              {project.customerName ?? " "}
            </Text>
          </IndexTable.Cell>
          {showBranchColumn ? (
            <IndexTable.Cell>{branchLabel(project.branchId)}</IndexTable.Cell>
          ) : null}
          <IndexTable.Cell>
            <Badge tone={statusTone(project.status)}>
              {formatStatus(project.status)}
            </Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text
              as="span"
              alignment="end"
              numeric
              tone={(project.structureCount ?? 0) > 0 ? undefined : "subdued"}
            >
              {project.structureCount ?? 0}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>{formatDate(project.startDate)}</IndexTable.Cell>
          <IndexTable.Cell>{formatDate(project.endDate)}</IndexTable.Cell>
        </IndexTable.Row>
      )),
    [projects, showBranchColumn, branchLabel],
  );

  const emptyState = useMemo(
    () => (
      <EmptyState
        heading={
          debouncedQuery || activeStatus !== "all"
            ? "No projects match your filters"
            : "No inspection projects yet"
        }
        action={{
          content: "New inspection project",
          onAction: () => router.push("/dashboard/rov/projects/new"),
        }}
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>
          {debouncedQuery || activeStatus !== "all"
            ? "Try a different search term or status tab."
            : "Create your first ROV inspection project to manage structures, media, and client reports."}
        </p>
      </EmptyState>
    ),
    [router, debouncedQuery, activeStatus],
  );

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(page * PER_PAGE, total);

  return (
    <AppPage
      fullWidth
      title="Inspection projects"
      subtitle="Manage ROV inspection jobs, site locations, and project status."
      backAction={{ content: "ROV overview", url: "/dashboard/rov" }}
      primaryAction={{
        content: "New inspection project",
        onAction: () => router.push("/dashboard/rov/projects/new"),
      }}
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <IndexSurface>
          <IndexFilters
            canCreateNewView={false}
            cancelAction={{
              onAction: () => setQuery(""),
              disabled: false,
              loading: false,
            }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search by project, location, or client"
            queryValue={query}
            selected={selectedTab}
            tabs={STATUS_TABS.map((tab) => ({
              id: tab.id,
              content: tab.content,
            }))}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={setSelectedTab}
            setMode={setMode}
          />

          {!loading && total > 0 ? (
            <div className="rov-projects-list__summary">
              <Text as="p" tone="subdued" variant="bodySm">
                Showing {rangeStart} to {rangeEnd} of {total} result
                {total === 1 ? "" : "s"}
              </Text>
            </div>
          ) : null}

          <IndexTable
            emptyState={emptyState}
            headings={[
              { title: "Project" },
              { title: "Site location" },
              { title: "Client" },
              ...(showBranchColumn ? [{ title: "Branch" }] : []),
              { title: "Status" },
              { title: "Structures", alignment: "end" },
              { title: "Start date" },
              { title: "End date" },
            ]}
            itemCount={total}
            loading={loading}
            selectable={false}
            pagination={{
              hasNext: page * PER_PAGE < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "project", plural: "projects" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
