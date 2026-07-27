"use client";

import { useState } from "react";
import { Building2, ChevronRight, FileText } from "lucide-react";
import { ReportProjectMap, reportLocationLabel } from "./report-project-map";
import { ReportBodyContent } from "./report-body-content";
import {
  countStructureSeverity,
  parseCoordinates,
  structurePreviewUrl,
  type StructurePayload,
} from "./report-utils";
import type { PublicReportPayload } from "@/types/rov";

interface ReportHomeTabProps {
  report: PublicReportPayload["report"];
  project: NonNullable<PublicReportPayload["project"]>;
  severityCounts: PublicReportPayload["severityCounts"];
  structures: StructurePayload[];
  onSiteMapClick: (url: string) => void;
  onOpenMap: (structureIndex: number) => void;
}

export function ReportHomeTab({
  report,
  project,
  severityCounts,
  structures,
  onSiteMapClick,
  onOpenMap,
}: ReportHomeTabProps) {
  const [summaryMoreOpen, setSummaryMoreOpen] = useState(false);
  const [fullReportOpen, setFullReportOpen] = useState(false);
  const coords = parseCoordinates(project.latitude, project.longitude);
  const summary = report.summary?.trim() ?? "";
  const summaryNeedsToggle = summary.length > 320;

  return (
    <div className="client-report__tab-panel">
      <div className="client-report__home-grid">
        <div className="client-report__card client-report__map-card">
          <ReportProjectMap
            latitude={project.latitude}
            longitude={project.longitude}
            siteMapUrl={project.siteMapUrl}
            projectName={project.name}
            onSiteMapClick={onSiteMapClick}
          />
          <div className="client-report__map-foot">
            <span>
              {reportLocationLabel(project.latitude, project.longitude, project.siteMapUrl)}
            </span>
            {coords ? (
              <span className="client-report__coords">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            ) : project.siteMapUrl ? (
              <span className="client-report__coords">Site map on file</span>
            ) : null}
          </div>
        </div>

        <div className="client-report__card client-report__project-card">
          <p className="client-report__project-eyebrow">Underwater Visual Inspection</p>
          <h2 className="client-report__project-name">{project.name}</h2>
          <p className="client-report__project-sub">
            {structures.length} structure{structures.length === 1 ? "" : "s"} inspected
          </p>
          <div className="client-report__home-stats">
            <div className="client-report__home-stat client-report__home-stat--major">
              <strong>{severityCounts.major}</strong>
              <span>Major</span>
            </div>
            <div className="client-report__home-stat client-report__home-stat--moderate">
              <strong>{severityCounts.moderate}</strong>
              <span>Moderate</span>
            </div>
            <div className="client-report__home-stat client-report__home-stat--minor">
              <strong>{severityCounts.minor}</strong>
              <span>Minor</span>
            </div>
          </div>
        </div>
      </div>

      {summary || report.fullReport ? (
        <div className="client-report__card client-report__summary-card">
          <div className="client-report__card-head">
            <FileText size={18} className="client-report__card-head-icon" />
            <h2>Report Summary</h2>
          </div>
          <div className="client-report__summary-body">
            {summary ? (
              <>
                <p
                  className={
                    summaryMoreOpen
                      ? "client-report__summary-text"
                      : "client-report__summary-text client-report__summary-text--clamped"
                  }
                >
                  {summary}
                </p>
                {summaryNeedsToggle ? (
                  <button
                    type="button"
                    className="client-report__summary-toggle"
                    onClick={() => setSummaryMoreOpen((open) => !open)}
                  >
                    {summaryMoreOpen ? "Show less" : "Show more"}
                  </button>
                ) : null}
              </>
            ) : null}
            {report.fullReport ? (
              <>
                <button
                  type="button"
                  className="client-report__summary-toggle"
                  onClick={() => setFullReportOpen((open) => !open)}
                >
                  {fullReportOpen ? "Hide full report" : "Read full report"}
                </button>
                {fullReportOpen ? (
                  <div className="client-report__summary-full">
                    <ReportBodyContent content={report.fullReport} />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {structures.length > 0 ? (
        <section className="client-report__structures-section">
          <div className="client-report__structures-head">
            <h2>Structures Inspected</h2>
            <span className="client-report__count-badge">{structures.length}</span>
          </div>
          <div className="client-report__structures-grid">
            {structures.map((structure, index) => {
              const counts = countStructureSeverity(structure);
              const preview = structurePreviewUrl(structure);
              return (
                <button
                  key={structure.id}
                  type="button"
                  className="client-report__card client-report__structure-card"
                  onClick={() => onOpenMap(index)}
                >
                  <div className="client-report__structure-card-media">
                    {preview ? (
                      <img src={preview} alt="" />
                    ) : (
                      <div className="client-report__structure-card-placeholder">
                        <Building2 size={22} />
                      </div>
                    )}
                  </div>
                  <div className="client-report__structure-card-body">
                    <div className="client-report__structure-card-top">
                      <h3>{structure.name}</h3>
                      <ChevronRight size={16} />
                    </div>
                    {structure.description ? (
                      <p>{structure.description}</p>
                    ) : null}
                    <div className="client-report__structure-badges">
                      {counts.major ? (
                        <span className="client-report__structure-badge client-report__structure-badge--major">
                          {counts.major} major
                        </span>
                      ) : null}
                      {counts.moderate ? (
                        <span className="client-report__structure-badge client-report__structure-badge--moderate">
                          {counts.moderate} mod
                        </span>
                      ) : null}
                      {counts.minor ? (
                        <span className="client-report__structure-badge client-report__structure-badge--minor">
                          {counts.minor} minor
                        </span>
                      ) : null}
                      <span className="client-report__structure-views">
                        {structure.views.length} view{structure.views.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
