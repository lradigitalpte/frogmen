"use client";

import {
  Banner,
  BlockStack,
  Card,
  Checkbox,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createReport,
  generateShareLink,
  listAllPoints,
  listReports,
  updateReport,
} from "@/lib/rov-api";
import type { InspectionReport } from "@/types/rov";
import { ReportPublishSidebar } from "./report-publish-sidebar";

interface ManageReportsTabProps {
  projectId: string;
  projectName: string;
  clientName?: string | null;
  location?: string | null;
  structureCount?: number;
}

export function ManageReportsTab({
  projectId,
  projectName,
  clientName,
  location,
  structureCount = 0,
}: ManageReportsTabProps) {
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [fullReport, setFullReport] = useState("");
  const [conclusions, setConclusions] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [clientCanDownload, setClientCanDownload] = useState(true);
  const [clientCanPrint, setClientCanPrint] = useState(false);
  const [observationCount, setObservationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        title,
        summary,
        fullReport,
        conclusions,
        recommendations,
        clientCanDownload,
        clientCanPrint,
      }),
    [
      title,
      summary,
      fullReport,
      conclusions,
      recommendations,
      clientCanDownload,
      clientCanPrint,
    ],
  );

  const dirty = currentSnapshot !== savedSnapshot;

  const checklist = useMemo(
    () => [
      { label: "Report title", done: title.trim().length > 0 },
      { label: "Executive summary", done: summary.trim().length > 0 },
      { label: "Full report", done: fullReport.trim().length > 0 },
      { label: "Conclusions", done: conclusions.trim().length > 0 },
      { label: "Recommendations", done: recommendations.trim().length > 0 },
      { label: "Share link generated", done: Boolean(shareUrl) },
    ],
    [title, summary, fullReport, conclusions, recommendations, shareUrl],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reports, points] = await Promise.all([
        listReports(projectId),
        listAllPoints(projectId),
      ]);
      setObservationCount(points.length);

      const existing = reports[0] ?? null;
      setReport(existing);
      if (existing) {
        const next = {
          title: existing.title ?? "",
          summary: existing.summary ?? "",
          fullReport: existing.fullReport ?? "",
          conclusions: existing.conclusions ?? "",
          recommendations: existing.recommendations ?? "",
          clientCanDownload: existing.clientCanDownload,
          clientCanPrint: existing.clientCanPrint,
        };
        setTitle(next.title);
        setSummary(next.summary);
        setFullReport(next.fullReport);
        setConclusions(next.conclusions);
        setRecommendations(next.recommendations);
        setClientCanDownload(next.clientCanDownload);
        setClientCanPrint(next.clientCanPrint);
        setSavedSnapshot(JSON.stringify(next));
        if (existing.sharedLinkHash) {
          setShareUrl(`${window.location.origin}/report/${existing.sharedLinkHash}`);
        }
      } else {
        const defaultTitle = `${projectName} – Inspection Report`;
        setTitle(defaultTitle);
        setSavedSnapshot(
          JSON.stringify({
            title: defaultTitle,
            summary: "",
            fullReport: "",
            conclusions: "",
            recommendations: "",
            clientCanDownload: true,
            clientCanPrint: false,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [projectId, projectName]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        summary,
        fullReport,
        conclusions,
        recommendations,
        clientCanDownload,
        clientCanPrint,
      };

      const saved = report
        ? await updateReport(report.id, payload)
        : await createReport(projectId, payload);

      setReport(saved);
      setSavedSnapshot(currentSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  }, [
    report,
    projectId,
    title,
    summary,
    fullReport,
    conclusions,
    recommendations,
    clientCanDownload,
    clientCanPrint,
    currentSnapshot,
  ]);

  const handleShare = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      let current = report;
      if (!current || dirty) {
        const payload = {
          title,
          summary,
          fullReport,
          conclusions,
          recommendations,
          clientCanDownload,
          clientCanPrint,
        };
        current = current
          ? await updateReport(current.id, payload)
          : await createReport(projectId, payload);
        setReport(current);
        setSavedSnapshot(currentSnapshot);
      }

      const updated = await generateShareLink(current.id);
      setReport(updated);
      setShareUrl(`${window.location.origin}/report/${updated.sharedLinkHash}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate share link");
    } finally {
      setSaving(false);
    }
  }, [
    report,
    dirty,
    title,
    summary,
    fullReport,
    conclusions,
    recommendations,
    clientCanDownload,
    clientCanPrint,
    projectId,
    currentSnapshot,
  ]);

  if (loading) {
    return (
      <Card padding="600">
        <Text as="p" tone="subdued" alignment="center">
          Loading report…
        </Text>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      {error ? (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      <div className="rov-report-builder">
        <div className="rov-report-builder__editor">
          <Card padding="400">
            <BlockStack gap="500">
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">
                  Write the client report
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Your text appears at the top of the shared link. Structures,
                  diagrams, and observations are added automatically from the
                  project.
                </Text>
              </BlockStack>

              <TextField
                label="Report title"
                value={title}
                onChange={setTitle}
                autoComplete="off"
              />

              <TextField
                label="Executive summary"
                value={summary}
                onChange={setSummary}
                multiline={4}
                autoComplete="off"
                helpText="Scope, key findings, and overall condition."
              />

              <TextField
                label="Full report"
                value={fullReport}
                onChange={setFullReport}
                multiline={14}
                autoComplete="off"
                helpText="Main narrative. Use blank lines between paragraphs."
              />

              <TextField
                label="Conclusions"
                value={conclusions}
                onChange={setConclusions}
                multiline={4}
                autoComplete="off"
              />

              <TextField
                label="Recommendations"
                value={recommendations}
                onChange={setRecommendations}
                multiline={4}
                autoComplete="off"
              />

              <BlockStack gap="200">
                <Text as="h4" variant="headingSm">
                  Client access
                </Text>
                <Checkbox
                  label="Allow PDF download on shared report"
                  checked={clientCanDownload}
                  onChange={setClientCanDownload}
                />
                <Checkbox
                  label="Allow browser print on shared report"
                  checked={clientCanPrint}
                  onChange={setClientCanPrint}
                />
              </BlockStack>
            </BlockStack>
          </Card>
        </div>

        <div className="rov-report-builder__sidebar">
          <ReportPublishSidebar
            projectName={projectName}
            clientName={clientName}
            location={location}
            structureCount={structureCount}
            observationCount={observationCount}
            reportStatus={report?.status ?? null}
            dirty={dirty}
            saving={saving}
            shareUrl={shareUrl}
            checklist={checklist}
            clientCanDownload={clientCanDownload}
            clientCanPrint={clientCanPrint}
            onSave={() => void handleSave()}
            onShare={() => void handleShare()}
            hasReport={Boolean(report)}
          />
        </div>
      </div>
    </BlockStack>
  );
}
