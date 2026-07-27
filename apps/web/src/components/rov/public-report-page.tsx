"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Home,
  ImageIcon,
  Map,
  Video,
} from "lucide-react";
import { RovDiagramCanvas } from "@/components/rov/rov-diagram-canvas";
import { getPublicReport, getPublicReportPdfUrl } from "@/lib/rov-api";
import type { PublicReportPayload } from "@/types/rov";
import { ReportHeader } from "./report-header";
import { ReportHomeTab } from "./report-home-tab";
import { ReportObservationTable } from "./report-observation-table";
import { ReportLightbox, ReportPlanViewModal } from "./report-modals";
import { ReportStructureGallery } from "./report-structure-gallery";
import { ReportTabIntro } from "./report-tab-intro";
import { formatReportDateRange, ReportBodyContent } from "./report-body-content";
import {
  collectProjectMedia,
  projectHasObservations,
  type ReportTab,
} from "./report-utils";

const TABS: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "Home", icon: <Home size={16} /> },
  { id: "map", label: "Inspection Map", icon: <Map size={16} /> },
  { id: "images", label: "Inspection Images", icon: <ImageIcon size={16} /> },
  { id: "observations", label: "Observations", icon: <ClipboardList size={16} /> },
  { id: "data", label: "Inspection Data", icon: <Video size={16} /> },
  { id: "conclusions", label: "Conclusions", icon: <CheckCircle2 size={16} /> },
];

interface PublicReportPageProps {
  hash: string;
}

export function PublicReportPage({ hash }: PublicReportPageProps) {
  const [payload, setPayload] = useState<PublicReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>("home");
  const [activeStructureIdx, setActiveStructureIdx] = useState(0);
  const [activeViewIdx, setActiveViewIdx] = useState(0);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [planViewOpen, setPlanViewOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getPublicReport(hash);
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report not found");
    }
  }, [hash]);

  useEffect(() => {
    void load();
  }, [load]);

  const project = payload?.project ?? null;
  const structures = project?.structures ?? [];
  const activeStructure = structures[activeStructureIdx] ?? null;
  const activeView = activeStructure?.views[activeViewIdx] ?? activeStructure?.views[0] ?? null;
  const viewPoints = activeView?.points ?? [];
  const allMedia = useMemo(() => collectProjectMedia(project), [project]);

  const goToMapTab = (structureIndex = 0) => {
    setActiveStructureIdx(structureIndex);
    setActiveViewIdx(0);
    setActivePinId(null);
    setActiveTab("map");
  };

  if (error) {
    return (
      <div className="client-report client-report--centered">
        <div className="client-report__empty">
          <h1>Report unavailable</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="client-report client-report--centered">
        <div className="client-report__loading">
          <div className="client-report__loading-bar" />
          <div className="client-report__loading-bar client-report__loading-bar--short" />
          <p>Loading inspection report…</p>
        </div>
      </div>
    );
  }

  const { report, severityCounts } = payload;
  const dateRange = formatReportDateRange(project?.startDate, project?.endDate);
  const totalObservations = severityCounts.major + severityCounts.moderate + severityCounts.minor;
  const diagramImageUrl =
    activeStructure?.diagramUrl ??
    activeStructure?.photoUrl ??
    null;

  return (
    <div className="client-report">
      <ReportHeader
        title={report.title ?? "Inspection Report"}
        customerName={project?.customer?.name}
        location={project?.location}
        dateRange={dateRange}
        planViewUrl={project?.planViewUrl}
        onPlanViewOpen={() => setPlanViewOpen(true)}
      />

      <nav className="client-report__nav no-print">
        <div className="client-report__nav-inner">
          <div className="client-report__nav-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={
                  activeTab === tab.id
                    ? "client-report__nav-tab client-report__nav-tab--active"
                    : "client-report__nav-tab"
                }
                onClick={() => {
                  setActiveTab(tab.id);
                  setActivePinId(null);
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="client-report__nav-pdf">
            {report.clientCanDownload ? (
              <a
                className="client-report__btn client-report__btn--primary client-report__btn--pdf"
                href={getPublicReportPdfUrl(hash)}
              >
                <Download size={14} />
                PDF
              </a>
            ) : (
              <span className="client-report__pdf-disabled">PDF disabled</span>
            )}
          </div>
        </div>
      </nav>

      <main className="client-report__main">
        {activeTab === "home" && project ? (
          <ReportHomeTab
            report={report}
            project={project}
            severityCounts={severityCounts}
            structures={structures}
            onSiteMapClick={setLightboxUrl}
            onOpenMap={goToMapTab}
          />
        ) : null}

        {activeTab === "images" ? (
          <div className="client-report__tab-panel">
            <ReportTabIntro
              title="Inspection Images"
              description="Surface photos and structure previews from this inspection."
              count={structures.length}
              countLabel={structures.length === 1 ? "structure" : "structures"}
            />
            {structures.length > 0 ? (
              <ReportStructureGallery
                structures={structures}
                onOpenImage={setLightboxUrl}
                onOpenMap={goToMapTab}
              />
            ) : (
              <EmptyState
                title="No structures in this project"
                detail="Add structures to the ROV project to display inspection images here."
              />
            )}
          </div>
        ) : null}

        {activeTab === "map" ? (
          <div className="client-report__tab-panel">
            <ReportTabIntro
              title="Inspection Map"
              description="Annotated diagrams with observation pins. Select a structure and view to explore findings."
              count={totalObservations}
              countLabel={totalObservations === 1 ? "observation" : "observations"}
            />
            {structures.length > 0 ? (
              <>
                <div className="client-report__pill-tabs">
                  {structures.map((structure, index) => (
                    <button
                      key={structure.id}
                      type="button"
                      className={
                        activeStructureIdx === index
                          ? "client-report__pill client-report__pill--active"
                          : "client-report__pill"
                      }
                      onClick={() => {
                        setActiveStructureIdx(index);
                        setActiveViewIdx(0);
                        setActivePinId(null);
                      }}
                    >
                      {structure.name}
                    </button>
                  ))}
                </div>

                {activeStructure ? (
                  <>
                    {activeStructure.views.length > 1 ? (
                      <div className="client-report__view-tabs">
                        {activeStructure.views.map((view, index) => (
                          <button
                            key={view.id}
                            type="button"
                            className={
                              activeViewIdx === index
                                ? "client-report__view-tab client-report__view-tab--active"
                                : "client-report__view-tab"
                            }
                            onClick={() => {
                              setActiveViewIdx(index);
                              setActivePinId(null);
                            }}
                          >
                            {view.name}
                            <span>{view.viewType}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="client-report__map-layout">
                      <div className="client-report__card client-report__diagram-card">
                        {diagramImageUrl ? (
                          <>
                            <RovDiagramCanvas
                              imageSrc={diagramImageUrl}
                              points={activeStructure.diagramUrl ? viewPoints : []}
                              selectedPointId={activePinId}
                              mode="view"
                              onSelectPin={(id) =>
                                setActivePinId((current) => (current === id ? null : id))
                              }
                            />
                            {activeStructure.diagramUrl ? (
                              <div className="client-report__legend">
                                <span><i className="client-report__legend-dot client-report__legend-dot--major" /> Major</span>
                                <span><i className="client-report__legend-dot client-report__legend-dot--moderate" /> Moderate</span>
                                <span><i className="client-report__legend-dot client-report__legend-dot--minor" /> Minor</span>
                              </div>
                            ) : (
                              <div className="client-report__diagram-fallback-note">
                                Showing structure photo   upload a diagram to enable pin annotations.
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="client-report__diagram-empty">
                            No diagram uploaded for {activeStructure.name}
                          </p>
                        )}
                      </div>

                      <div className="client-report__card client-report__obs-panel">
                        <div className="client-report__obs-panel-head">
                          <p>{activeView?.name ?? "Observations"}</p>
                          <span>
                            {viewPoints.length} observation{viewPoints.length === 1 ? "" : "s"} ·
                            Click a row or pin to expand media
                          </span>
                        </div>
                        <ReportObservationTable
                          points={viewPoints}
                          activePinId={activePinId}
                          onTogglePin={setActivePinId}
                          onOpenLightbox={setLightboxUrl}
                          variant="compact"
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <EmptyState title="No inspection structures added yet." />
            )}
          </div>
        ) : null}

        {activeTab === "observations" ? (
          <div className="client-report__tab-panel">
            <ReportTabIntro
              title="Observations"
              description="All recorded findings across structures and inspection views."
              count={totalObservations}
              countLabel={totalObservations === 1 ? "observation" : "observations"}
            />
            {projectHasObservations(project) ? (
              structures.map((structure) =>
                structure.views.map((view) =>
                  view.points.length > 0 ? (
                    <div key={`${structure.id}-${view.id}`} className="client-report__card client-report__obs-section">
                      <div className="client-report__obs-section-head">
                        <span className="client-report__structure-chip">{structure.name}</span>
                        <span className="client-report__view-chip">{view.name}</span>
                        <span className="client-report__view-type">{view.viewType}</span>
                        <span className="client-report__obs-count">
                          {view.points.length} observation{view.points.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <ReportObservationTable
                        points={view.points}
                        activePinId={activePinId}
                        onTogglePin={setActivePinId}
                        onOpenLightbox={setLightboxUrl}
                        variant="full"
                        showDiveLocation
                      />
                    </div>
                  ) : null,
                ),
              )
            ) : (
              <EmptyState title="No observations recorded." />
            )}
          </div>
        ) : null}

        {activeTab === "data" ? (
          <div className="client-report__tab-panel">
            <ReportTabIntro
              title="Inspection Data"
              description="Videos and images captured during the inspection, grouped by structure."
              count={allMedia.length}
              countLabel={allMedia.length === 1 ? "file" : "files"}
            />
            {allMedia.length > 0 ? (
              structures.map((structure) => {
                const structureMedia = allMedia.filter((item) => item.structure.id === structure.id);
                if (structureMedia.length === 0) return null;
                return (
                  <section key={structure.id} className="client-report__data-section">
                    <div className="client-report__data-section-head">
                      <h3>{structure.name}</h3>
                      <span>{structureMedia.length} file{structureMedia.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="client-report__media-grid client-report__media-grid--data">
                      {structureMedia.map(({ media, point }) => (
                        <div key={media.id} className="client-report__card client-report__data-card">
                          {media.mediaType === "video" && media.url ? (
                            <video src={media.url} controls preload="metadata" />
                          ) : media.url ? (
                            <button
                              type="button"
                              className="client-report__data-image-btn"
                              onClick={() => setLightboxUrl(media.url!)}
                            >
                              <img src={media.url} alt={media.fileName} />
                            </button>
                          ) : null}
                          <div className="client-report__data-card-body">
                            <p>{media.fileName}</p>
                            {point ? (
                              <span>Linked to {point.observationId ?? `Point ${point.pointNumber}`}</span>
                            ) : null}
                            <div className="client-report__data-card-actions">
                              <span>{media.mediaType}</span>
                              {media.url ? (
                                <>
                                  <a href={media.url} target="_blank" rel="noopener noreferrer">
                                    View
                                  </a>
                                  <a href={media.url} download={media.fileName}>
                                    Download
                                  </a>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })
            ) : (
              <EmptyState
                title="No inspection media uploaded yet."
                detail="Videos and images linked to observations will appear here."
              />
            )}
          </div>
        ) : null}

        {activeTab === "conclusions" ? (
          <div className="client-report__tab-panel client-report__conclusions">
            <ReportTabIntro
              title="Conclusions"
              description="Severity overview and final assessment for this inspection."
            />
            <div className="client-report__card client-report__severity-banner">
              <div className="client-report__severity-banner-cell client-report__severity-banner-cell--major">
                <strong>{severityCounts.major}</strong>
                <span>Major</span>
                <small>Observations</small>
              </div>
              <div className="client-report__severity-banner-cell client-report__severity-banner-cell--moderate">
                <strong>{severityCounts.moderate}</strong>
                <span>Moderate</span>
                <small>Observations</small>
              </div>
              <div className="client-report__severity-banner-cell client-report__severity-banner-cell--minor">
                <strong>{severityCounts.minor}</strong>
                <span>Minor</span>
                <small>Observations</small>
              </div>
            </div>

            <div className="client-report__card client-report__severity-legend">
              <h3>Severity Reference</h3>
              <div className="client-report__severity-legend-item client-report__severity-legend-item--major">
                <strong>Major</strong>
                <p>Structural integrity risk   requires immediate attention and remediation.</p>
              </div>
              <div className="client-report__severity-legend-item client-report__severity-legend-item--moderate">
                <strong>Moderate</strong>
                <p>Monitored defect   schedule repair within the next maintenance cycle.</p>
              </div>
              <div className="client-report__severity-legend-item client-report__severity-legend-item--minor">
                <strong>Minor</strong>
                <p>Low-risk observation   record and review at next scheduled inspection.</p>
              </div>
            </div>

            {report.conclusions ? (
              <div className="client-report__card client-report__section">
                <div className="client-report__card-head">
                  <CheckCircle2 size={18} className="client-report__card-head-icon client-report__card-head-icon--green" />
                  <h2>Conclusions</h2>
                </div>
                <ReportBodyContent content={report.conclusions} />
              </div>
            ) : null}

            {report.recommendations ? (
              <div className="client-report__card client-report__section">
                <h2>Recommendations</h2>
                <ReportBodyContent content={report.recommendations} />
              </div>
            ) : null}
          </div>
        ) : null}
      </main>

      <footer className="client-report__footer">
        <p>{project?.name ?? report.title}</p>
        <p>FrogmenDash ROV Inspection Platform</p>
      </footer>

      <ReportPlanViewModal
        open={planViewOpen}
        imageUrl={project?.planViewUrl ?? null}
        onClose={() => setPlanViewOpen(false)}
      />
      <ReportLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="client-report__card client-report__empty-state">
      <div className="client-report__empty-state-icon" aria-hidden>
        <FileText size={28} />
      </div>
      <p>{title}</p>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}
