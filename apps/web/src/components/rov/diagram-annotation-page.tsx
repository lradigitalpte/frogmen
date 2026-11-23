"use client";

import {
  Badge,
  Banner,
  Button,
  ButtonGroup,
  DropZone,
  Icon,
  Modal,
  Select,
  SkeletonBodyText,
  Spinner,
  Text,
} from "@shopify/polaris";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  LocationIcon,
  XIcon,
} from "@shopify/polaris-icons";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import {
  createMedia,
  createPoint,
  deletePoint,
  getRovProject,
  listMedia,
  listPoints,
  listViews,
  updateMedia,
  updatePoint,
  uploadStructureDiagram,
} from "@/lib/rov-api";
import { cn } from "@/lib/utils";
import type {
  InspectionMedia,
  InspectionPoint,
  InspectionSeverity,
  InspectionView,
  ProjectStructure,
  RovProject,
} from "@/types/rov";
import { ObservationMediaPanel } from "./observation-media-panel";
import {
  ObservationPointForm,
  draftToUpdateInput,
  draftsEqual,
  pointToDraft,
  type ObservationPointDraft,
} from "./observation-point-form";
import { RovDiagramCanvas } from "./rov-diagram-canvas";
import { useRovAssetSrc } from "./use-rov-asset-src";

const SEVERITY: Record<InspectionSeverity, { label: string; tone: "critical" | "warning" | "info" }> = {
  major: { label: "Major", tone: "critical" },
  moderate: { label: "Moderate", tone: "warning" },
  minor: { label: "Minor", tone: "info" },
};

function pointTitle(point: InspectionPoint) {
  const label = point.label && point.label !== point.observationId ? point.label : null;
  return point.findingType || label || point.description?.split(/[\r\n]/)[0] || "No details yet";
}

function pointOrder(a: InspectionPoint, b: InspectionPoint) {
  return (a.pointNumber ?? 0) - (b.pointNumber ?? 0) || a.createdAt.localeCompare(b.createdAt);
}

export function DiagramAnnotationPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const structureId = params.structureId as string;
  const searchParams = useSearchParams();
  const focusViewId = searchParams.get("view");
  const focusPointId = searchParams.get("point");
  const focusApplied = useRef(false);
  const { showSuccess, showError } = useToast();

  const [project, setProject] = useState<RovProject | null>(null);
  const [structure, setStructure] = useState<ProjectStructure | null>(null);
  const [views, setViews] = useState<InspectionView[]>([]);
  const [viewId, setViewId] = useState<string>("");
  const [points, setPoints] = useState<InspectionPoint[]>([]);
  const [media, setMedia] = useState<InspectionMedia[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [draft, setDraft] = useState<ObservationPointDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<ObservationPointDraft | null>(null);
  const [savingPoint, setSavingPoint] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [diagramUploading, setDiagramUploading] = useState(false);
  const [replaceDialog, setReplaceDialog] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => [...points].sort(pointOrder), [points]);
  const selectedPoint = points.find((p) => p.id === selectedPointId) ?? null;
  const selectedIndex = selectedPoint ? ordered.findIndex((p) => p.id === selectedPoint.id) : -1;
  const draftDirty = draft !== null && savedDraft !== null && !draftsEqual(draft, savedDraft);

  const linkedMedia = useMemo(() => {
    if (selectedPoint?.media?.length) return selectedPoint.media;
    return media.filter((item) => item.inspectionPointId === selectedPoint?.id);
  }, [media, selectedPoint]);
  const availableMedia = useMemo(() => media.filter((item) => !item.inspectionPointId), [media]);

  const mediaCountFor = useCallback(
    (point: InspectionPoint) => point.media?.length ?? media.filter((m) => m.inspectionPointId === point.id).length,
    [media],
  );

  const counts = useMemo(() => {
    const c = { major: 0, moderate: 0, minor: 0, unrated: 0 };
    for (const p of points) {
      if (p.severity) c[p.severity] += 1;
      else c.unrated += 1;
    }
    return c;
  }, [points]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [proj, viewList, mediaList] = await Promise.all([
        getRovProject(projectId),
        listViews(projectId, structureId),
        listMedia(projectId, structureId),
      ]);
      setProject(proj);
      setStructure(proj.structures?.find((st) => st.id === structureId) ?? null);
      setViews(viewList);
      setViewId(
        (current) =>
          current || (focusViewId && viewList.some((v) => v.id === focusViewId) ? focusViewId : viewList[0]?.id) || "",
      );
      setMedia(mediaList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this structure");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus view only matters on first load
  }, [projectId, structureId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep link: ?view=<id>&point=<id> opens that pin in the editor.
  useEffect(() => {
    if (focusApplied.current || !focusPointId) return;
    if (points.some((p) => p.id === focusPointId)) {
      focusApplied.current = true;
      setSelectedPointId(focusPointId);
      setAddMode(false);
    }
  }, [focusPointId, points]);

  useEffect(() => {
    if (!viewId) return;
    void (async () => {
      try {
        setPoints(await listPoints(projectId, structureId, viewId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load pins");
      }
    })();
  }, [projectId, structureId, viewId]);

  useEffect(() => {
    if (!selectedPointId) {
      setDraft(null);
      setSavedDraft(null);
      return;
    }
    const point = points.find((item) => item.id === selectedPointId);
    if (!point) return;
    const nextDraft = pointToDraft(point);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    // Only re-seed the form when the selected pin changes, not on every points refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- points is read when selectedPointId changes
  }, [selectedPointId]);

  const reloadPoints = useCallback(
    async (activeViewId: string) => {
      setPoints(await listPoints(projectId, structureId, activeViewId));
    },
    [projectId, structureId],
  );

  const refreshMedia = useCallback(async () => {
    setMedia(await listMedia(projectId, structureId));
  }, [projectId, structureId]);

  const confirmDiscard = useCallback(
    (what: string) => !draftDirty || confirm(`You have unsaved changes. Discard them and ${what}?`),
    [draftDirty],
  );

  const handlePlacePin = useCallback(
    async (x: number, y: number) => {
      if (!viewId || placing) return;
      if (!confirmDiscard("add a new pin")) return;
      setPlacing(true);
      try {
        const created = await createPoint(projectId, structureId, viewId, { xCoordinate: x, yCoordinate: y });
        await reloadPoints(viewId);
        const nextDraft = pointToDraft(created);
        setDraft(nextDraft);
        setSavedDraft(nextDraft);
        setSelectedPointId(created.id);
        setAddMode(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not place the pin");
      } finally {
        setPlacing(false);
      }
    },
    [confirmDiscard, placing, viewId, projectId, structureId, reloadPoints],
  );

  const handleMovePin = useCallback(
    async (pointId: string, x: number, y: number) => {
      if (!viewId) return;
      try {
        await updatePoint(projectId, structureId, viewId, pointId, { xCoordinate: x, yCoordinate: y });
        await reloadPoints(viewId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not move the pin");
      }
    },
    [viewId, projectId, structureId, reloadPoints],
  );

  const selectPoint = useCallback(
    (pointId: string | null) => {
      if (pointId === selectedPointId) return;
      if (!confirmDiscard(pointId ? "switch observations" : "close the editor")) return;
      setSelectedPointId(pointId);
      setAddMode(false);
      if (pointId && window.matchMedia("(max-width: 960px)").matches) {
        requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    },
    [confirmDiscard, selectedPointId],
  );

  const handleSavePoint = useCallback(async () => {
    if (!selectedPoint || !viewId || !draft) return;
    setSavingPoint(true);
    setError(null);
    try {
      await updatePoint(projectId, structureId, viewId, selectedPoint.id, draftToUpdateInput(draft));
      await reloadPoints(viewId);
      setSavedDraft(draft);
      showSuccess(`${selectedPoint.observationId ?? "Observation"} saved`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the observation");
    } finally {
      setSavingPoint(false);
    }
  }, [selectedPoint, viewId, draft, projectId, structureId, reloadPoints, showSuccess]);

  const handleDeletePoint = useCallback(async () => {
    if (!selectedPoint || !viewId) return;
    setDeleting(true);
    try {
      await deletePoint(projectId, structureId, viewId, selectedPoint.id);
      setDeleteOpen(false);
      setSelectedPointId(null);
      await Promise.all([reloadPoints(viewId), refreshMedia()]);
      showSuccess(`${selectedPoint.observationId ?? "Observation"} deleted`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not delete the observation");
    } finally {
      setDeleting(false);
    }
  }, [selectedPoint, viewId, projectId, structureId, reloadPoints, refreshMedia, showSuccess, showError]);

  const withMedia = useCallback(
    async (task: () => Promise<unknown>, failure: string) => {
      setMediaBusy(true);
      try {
        await task();
        await refreshMedia();
        if (viewId) await reloadPoints(viewId);
      } catch (err) {
        setError(err instanceof Error ? err.message : failure);
      } finally {
        setMediaBusy(false);
      }
    },
    [refreshMedia, reloadPoints, viewId],
  );

  const handleDiagramDrop = useCallback(
    async (_all: File[], accepted: File[]) => {
      const file = accepted[0];
      if (!file) {
        showError("That file isn't an image. Use PNG, JPG or WebP.");
        return;
      }
      setDiagramUploading(true);
      try {
        await uploadStructureDiagram(projectId, structureId, file);
        showSuccess("Diagram uploaded");
        await load();
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not upload the diagram");
      } finally {
        setDiagramUploading(false);
      }
    },
    [load, projectId, structureId, showError, showSuccess],
  );

  const { src: diagramSrc, failed: diagramFailed } = useRovAssetSrc(structure?.diagramPath);
  const hasDiagram = Boolean(structure?.diagramPath);
  const diagramReady = hasDiagram && !diagramFailed;

  const structures = useMemo(
    () => [...(project?.structures ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)),
    [project],
  );
  const structureIndex = structures.findIndex((s) => s.id === structureId);
  const goToStructure = (id: string) => {
    if (id === structureId || !confirmDiscard("open another structure")) return;
    router.push(`/dashboard/rov/projects/${projectId}/structures/${id}/annotate`);
  };

  const backAction = {
    content: "Back to project",
    onAction: () => router.push(`/dashboard/rov/projects/${projectId}?tab=structures`),
  };

  if (loading && !structure) {
    return (
      <AppPage title="Annotate diagram" backAction={backAction} fullWidth>
        <div className="rov-an">
          <div className="rov-an__grid">
            <div className="ex-surface ex-pad">
              <SkeletonBodyText lines={12} />
            </div>
            <div className="ex-surface ex-pad">
              <SkeletonBodyText lines={6} />
            </div>
          </div>
        </div>
      </AppPage>
    );
  }

  if (!structure) {
    return (
      <AppPage title="Structure not found" backAction={backAction}>
        <Banner tone="critical">
          {error ?? "This structure no longer exists in the project."}
        </Banner>
      </AppPage>
    );
  }

  const activeView = views.find((view) => view.id === viewId) ?? null;
  const prevPoint = selectedIndex > 0 ? ordered[selectedIndex - 1] : null;
  const nextPoint = selectedIndex >= 0 && selectedIndex < ordered.length - 1 ? ordered[selectedIndex + 1] : null;
  const sev = selectedPoint?.severity ? SEVERITY[selectedPoint.severity] : null;

  return (
    <AppPage
      fullWidth
      title={structure.name}
      subtitle={`Annotate findings · ${project?.name ?? "Project"}`}
      backAction={backAction}
      secondaryActions={
        structures.length > 1
          ? [
              {
                content: "Previous structure",
                icon: ChevronLeftIcon,
                disabled: structureIndex <= 0,
                onAction: () => goToStructure(structures[structureIndex - 1].id),
              },
              {
                content: "Next structure",
                icon: ChevronRightIcon,
                disabled: structureIndex < 0 || structureIndex >= structures.length - 1,
                onAction: () => goToStructure(structures[structureIndex + 1].id),
              },
            ]
          : undefined
      }
    >
      <div className="rov-an">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <div className="rov-an__grid">
          {/* ── Diagram stage ── */}
          <div className="rov-an__main">
            <section className="ex-surface rov-an__stage">
              <header className="rov-an__toolbar">
                <div className="rov-an__toolbar-left">
                  {structures.length > 1 ? (
                    <div className="rov-an__picker">
                      <Select
                        label="Structure"
                        labelInline
                        options={structures.map((s, i) => ({ label: `${i + 1}. ${s.name}`, value: s.id }))}
                        value={structureId}
                        onChange={goToStructure}
                      />
                    </div>
                  ) : null}
                  {views.length > 1 ? (
                    <div className="rov-an__picker">
                      <Select
                        label="View"
                        labelInline
                        options={views.map((v) => ({ label: `${v.name} · ${v.viewType.toUpperCase()}`, value: v.id }))}
                        value={viewId}
                        onChange={(id) => {
                          if (!confirmDiscard("switch views")) return;
                          setViewId(id);
                          setSelectedPointId(null);
                        }}
                      />
                    </div>
                  ) : activeView ? (
                    <span className="rov-an__view">
                      View <strong>{activeView.name}</strong>
                      <Badge>{activeView.viewType.toUpperCase()}</Badge>
                    </span>
                  ) : null}
                </div>

                <div className="rov-an__toolbar-right">
                  {diagramReady ? (
                    <>
                      <ButtonGroup variant="segmented">
                        <Button pressed={addMode} icon={LocationIcon} onClick={() => setAddMode(true)}>
                          Add pin
                        </Button>
                        <Button pressed={!addMode} onClick={() => setAddMode(false)}>
                          Select &amp; move
                        </Button>
                      </ButtonGroup>
                      <Button
                        variant="tertiary"
                        loading={diagramUploading}
                        onClick={() => setReplaceDialog(true)}
                      >
                        Replace diagram
                      </Button>
                    </>
                  ) : null}
                </div>
              </header>

              <div className="rov-an__hint" aria-live="polite">
                {!diagramReady ? (
                  hasDiagram ? (
                    <>
                      <Badge tone="critical">Diagram missing</Badge> The saved diagram file can&apos;t be found. Upload it
                      again — existing pins keep their positions.
                    </>
                  ) : (
                    <>
                      <Badge tone="attention">No diagram</Badge> Upload the engineering drawing to start placing pins.
                    </>
                  )
                ) : placing ? (
                  <>
                    <Spinner size="small" /> Placing pin…
                  </>
                ) : addMode ? (
                  <>
                    <Badge tone="info">Add pin</Badge> Click anywhere on the diagram to drop a new observation.
                  </>
                ) : (
                  <>
                    <Badge>Select &amp; move</Badge> Click a pin to edit it, or drag it to a new spot.
                  </>
                )}
              </div>

              {diagramReady ? (
                <RovDiagramCanvas
                  imageSrc={diagramSrc}
                  points={points}
                  selectedPointId={selectedPointId}
                  mode="annotate"
                  addMode={addMode && !placing}
                  emptyLabel="Loading diagram…"
                  onPlacePin={(x, y) => void handlePlacePin(x, y)}
                  onSelectPin={selectPoint}
                  onMovePin={(id, x, y) => void handleMovePin(id, x, y)}
                />
              ) : (
                <div className="rov-an__upload">
                  <DropZone
                    accept="image/*"
                    type="image"
                    allowMultiple={false}
                    disabled={diagramUploading}
                    label="Diagram"
                    labelHidden
                    onDrop={(all, accepted) => void handleDiagramDrop(all, accepted)}
                  >
                    <div className="rov-an__upload-body">
                      {diagramUploading ? (
                        <Spinner size="large" />
                      ) : (
                        <span className="rov-an__upload-icon">
                          <Icon source={ImageIcon} tone="subdued" />
                        </span>
                      )}
                      <Text as="p" variant="headingSm">
                        {diagramUploading ? "Uploading diagram…" : hasDiagram ? "Re-upload the diagram" : "Upload the diagram"}
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Drop a PNG or JPG here, or click to choose a file.
                      </Text>
                      {points.length > 0 ? (
                        <Text as="p" tone="subdued" variant="bodySm">
                          {points.length} pin{points.length === 1 ? "" : "s"} already placed will reappear on top.
                        </Text>
                      ) : null}
                    </div>
                  </DropZone>
                </div>
              )}

              <footer className="rov-an__legend">
                {(["major", "moderate", "minor"] as const).map((key) => (
                  <span key={key}>
                    <i className={`rov-an__swatch is-${key}`} /> {SEVERITY[key].label} <strong>{counts[key]}</strong>
                  </span>
                ))}
                <span>
                  <i className="rov-an__swatch is-none" /> Not rated <strong>{counts.unrated}</strong>
                </span>
              </footer>

              {/* Hidden picker for "Replace diagram" */}
              <div className="rov-an__hidden" aria-hidden>
                <DropZone
                  accept="image/*"
                  type="image"
                  allowMultiple={false}
                  openFileDialog={replaceDialog}
                  onFileDialogClose={() => setReplaceDialog(false)}
                  onDrop={(all, accepted) => void handleDiagramDrop(all, accepted)}
                />
              </div>
            </section>

            {/* ── Observation list ── */}
            <section className="ex-surface">
              <header className="rov-ov__head">
                <div>
                  <h2>Observations</h2>
                  <p>
                    {points.length === 0
                      ? "Nothing logged on this view yet."
                      : `${points.length} on this view · ${media.length - availableMedia.length} of ${media.length} media file${media.length === 1 ? "" : "s"} linked`}
                  </p>
                </div>
              </header>
              {ordered.length === 0 ? (
                <p className="rov-ov__none">
                  {diagramReady
                    ? "Choose Add pin, then click the diagram where you saw something."
                    : "Pins appear here once the diagram is uploaded and you start placing them."}
                </p>
              ) : (
                <ul className="rov-an__list">
                  {ordered.map((point) => {
                    const s = point.severity ? SEVERITY[point.severity] : null;
                    const mc = mediaCountFor(point);
                    return (
                      <li key={point.id}>
                        <button
                          type="button"
                          className={cn("rov-an__row", point.id === selectedPointId && "is-selected")}
                          onClick={() => selectPoint(point.id)}
                        >
                          <b className={cn("rov-an__pin", point.severity ? `is-${point.severity}` : "is-none")}>
                            {point.observationId?.replace(/^O/, "") ?? "•"}
                          </b>
                          <span className="rov-an__row-main">
                            <strong>{point.observationId ?? "Observation"}</strong>
                            <small>{pointTitle(point)}</small>
                          </span>
                          <span className="rov-an__row-meta">
                            {point.depthM ? <small>{point.depthM} m</small> : null}
                            <small>
                              {mc} media
                            </small>
                            {s ? <Badge tone={s.tone}>{s.label}</Badge> : <Badge>Not rated</Badge>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* ── Sidebar editor ── */}
          <aside className="rov-an__side" ref={editorRef}>
            {selectedPoint && draft && savedDraft ? (
              <>
                <section className="ex-surface rov-an__editor">
                  <header className="rov-an__editor-head">
                    <b className={cn("rov-an__pin is-lg", selectedPoint.severity ? `is-${selectedPoint.severity}` : "is-none")}>
                      {selectedPoint.observationId?.replace(/^O/, "") ?? "•"}
                    </b>
                    <span className="rov-an__editor-title">
                      <strong>{selectedPoint.observationId ?? "Observation"}</strong>
                      <span>
                        {sev ? <Badge tone={sev.tone}>{sev.label}</Badge> : <Badge>Not rated</Badge>}
                        {draftDirty ? <Badge tone="attention">Unsaved</Badge> : null}
                      </span>
                    </span>
                    <span className="rov-an__editor-nav">
                      <Button
                        icon={ChevronLeftIcon}
                        accessibilityLabel="Previous observation"
                        variant="tertiary"
                        disabled={!prevPoint}
                        onClick={() => prevPoint && selectPoint(prevPoint.id)}
                      />
                      <Text as="span" tone="subdued" variant="bodySm">
                        {selectedIndex + 1}/{ordered.length}
                      </Text>
                      <Button
                        icon={ChevronRightIcon}
                        accessibilityLabel="Next observation"
                        variant="tertiary"
                        disabled={!nextPoint}
                        onClick={() => nextPoint && selectPoint(nextPoint.id)}
                      />
                      <Button
                        icon={XIcon}
                        accessibilityLabel="Close editor"
                        variant="tertiary"
                        onClick={() => selectPoint(null)}
                      />
                    </span>
                  </header>

                  <div className="rov-an__editor-body">
                    <ObservationPointForm
                      observationId={selectedPoint.observationId}
                      draft={draft}
                      dirty={draftDirty}
                      saving={savingPoint}
                      variant="modal"
                      showHeader={false}
                      showActions={false}
                      showDelete={false}
                      onDraftChange={setDraft}
                      onSave={() => void handleSavePoint()}
                      onCancel={() => savedDraft && setDraft(savedDraft)}
                    />
                  </div>

                  <footer className="rov-an__editor-foot">
                    <Button variant="tertiary" tone="critical" disabled={savingPoint} onClick={() => setDeleteOpen(true)}>
                      Delete
                    </Button>
                    <ButtonGroup>
                      <Button disabled={!draftDirty || savingPoint} onClick={() => setDraft(savedDraft)}>
                        Discard
                      </Button>
                      <Button
                        variant="primary"
                        loading={savingPoint}
                        disabled={!draftDirty}
                        onClick={() => void handleSavePoint()}
                      >
                        Save
                      </Button>
                    </ButtonGroup>
                  </footer>
                </section>

                <section className="ex-surface rov-an__media">
                  <header className="rov-ov__head">
                    <div>
                      <h2>Media</h2>
                      <p>
                        {linkedMedia.length === 0
                          ? "Upload stills or clips, or link footage already in the library."
                          : `${linkedMedia.length} file${linkedMedia.length === 1 ? "" : "s"} attached to ${selectedPoint.observationId ?? "this observation"}`}
                      </p>
                    </div>
                  </header>
                  <div className="rov-an__media-body">
                    <ObservationMediaPanel
                      variant="sidebar"
                      linkedMedia={linkedMedia}
                      availableMedia={availableMedia}
                      onLink={(id) =>
                        void withMedia(() => updateMedia(projectId, id, { inspectionPointId: selectedPoint.id }), "Could not link media")
                      }
                      onUnlink={(id) =>
                        void withMedia(() => updateMedia(projectId, id, { inspectionPointId: null }), "Could not unlink media")
                      }
                      onUpload={(result) =>
                        void withMedia(
                          () =>
                            createMedia(projectId, {
                              structureId,
                              inspectionPointId: selectedPoint.id,
                              mediaType: result.contentType.startsWith("video/") ? "video" : "image",
                              fileName: result.fileName,
                              filePath: result.key,
                              mimeType: result.contentType,
                              fileSize: result.size,
                            }),
                          "Could not upload media",
                        )
                      }
                      linking={mediaBusy}
                    />
                  </div>
                </section>
              </>
            ) : (
              <section className="ex-surface rov-an__guide">
                <header className="rov-ov__head">
                  <div>
                    <h2>How to annotate</h2>
                    <p>Each pin becomes a finding in the client report.</p>
                  </div>
                </header>
                <ol className="rov-an__steps">
                  <li className={cn(diagramReady && "is-done")}>
                    <b>1</b>
                    <span>
                      <strong>Diagram uploaded</strong>
                      <small>{diagramReady ? "Ready to annotate" : "Drop the engineering drawing on the left"}</small>
                    </span>
                  </li>
                  <li className={cn(points.length > 0 && "is-done")}>
                    <b>2</b>
                    <span>
                      <strong>Drop pins</strong>
                      <small>
                        {points.length > 0
                          ? `${points.length} placed — drag to fine-tune`
                          : "Choose Add pin and click where the issue is"}
                      </small>
                    </span>
                  </li>
                  <li className={cn(points.length > 0 && counts.unrated === 0 && "is-done")}>
                    <b>3</b>
                    <span>
                      <strong>Rate and describe</strong>
                      <small>
                        {counts.unrated > 0
                          ? `${counts.unrated} pin${counts.unrated === 1 ? "" : "s"} still need a severity`
                          : "Severity, finding type, depth, notes"}
                      </small>
                    </span>
                  </li>
                  <li className={cn(media.length > 0 && availableMedia.length === 0 && "is-done")}>
                    <b>4</b>
                    <span>
                      <strong>Attach media</strong>
                      <small>
                        {availableMedia.length > 0
                          ? `${availableMedia.length} file${availableMedia.length === 1 ? "" : "s"} not linked yet`
                          : "Stills and ROV clips per finding"}
                      </small>
                    </span>
                  </li>
                </ol>
                {ordered.length > 0 ? (
                  <div className="rov-an__guide-cta">
                    <Button fullWidth onClick={() => selectPoint((ordered.find((p) => !p.severity) ?? ordered[0]).id)}>
                      {counts.unrated > 0 ? "Rate the next pin" : `Open ${ordered[0].observationId ?? "first pin"}`}
                    </Button>
                  </div>
                ) : null}
              </section>
            )}
          </aside>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${selectedPoint?.observationId ?? "observation"}?`}
        primaryAction={{ content: "Delete", destructive: true, loading: deleting, onAction: () => void handleDeletePoint() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p">
            The pin and its finding details are removed. Linked media stays in the project library and can be attached
            to another observation.
          </Text>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
