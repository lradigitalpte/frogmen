"use client";

import {
  Banner,
  BlockStack,
  Card,
  IndexTable,
  Text,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { listReports } from "@/lib/rov-api";
import type { InspectionReport } from "@/types/rov";

export function RovReportsHubPage() {
  const router = useRouter();
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listReports();
      setReports(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppPage
      title="Inspection reports"
      subtitle="All ROV inspection reports across projects."
    >
      <BlockStack gap="400">
        {error ? <Banner tone="critical">{error}</Banner> : null}

        <Card>
          {reports.length === 0 && !loading ? (
            <Text as="p" tone="subdued">
              No reports yet. Create a report from a project&apos;s Reports tab.
            </Text>
          ) : (
            <IndexTable
              resourceName={{ singular: "report", plural: "reports" }}
              itemCount={reports.length}
              headings={[
                { title: "Title" },
                { title: "Project" },
                { title: "Status" },
                { title: "Shared" },
              ]}
              loading={loading}
              selectable={false}
            >
              {reports.map((report, index) => (
                <IndexTable.Row
                  id={report.id}
                  key={report.id}
                  position={index}
                  onClick={() =>
                    router.push(
                      `/dashboard/rov/projects/${report.rovProjectId}?tab=reports`,
                    )
                  }
                >
                  <IndexTable.Cell>
                    {report.title ?? "Untitled report"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{report.projectName ?? " "}</IndexTable.Cell>
                  <IndexTable.Cell>{report.status}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {report.sharedLinkHash ? "Yes" : "No"}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </AppPage>
  );
}
