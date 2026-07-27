"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  Text,
} from "@shopify/polaris";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { AppSelect } from "@/components/ui/app-select";
import {
  createPoint,
  createMedia,
  deletePoint,
  getRovProject,
  listMedia,
  listPoints,
  listViews,
  updateMedia,
  updatePoint,
} from "@/lib/rov-api";
import {
  ObservationPointForm,
  draftToUpdateInput,
  draftsEqual,
  pointToDraft,
  type ObservationPointDraft,
} from "./observation-point-form";
import { ObservationMediaPanel } from "./observation-media-panel";
import { RovDiagramCanvas } from "./rov-diagram-canvas";
import { useRovAssetSrc } from "./use-rov-asset-src";
import type {
  InspectionMedia,
  InspectionPoint,
  InspectionView,
  ProjectStructure,
} from "@/types/rov";

export function DiagramAnnotationPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const structureId = params.structureId as string;

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

  const selectedPoint = points.find((p) => p.id === selectedPointId) ?? null;
  const activeView = views.find((view) => view.id === viewId) ?? null;
  const draftDirty =
    draft !== null && savedDraft !== null && !draftsEqual(draft, savedDraft);

  const viewOptions = useMemo(
    () =>
      views.map((view) => ({
        value: view.id,
        label: view.name,
        description: view.viewType.toUpperCase(),
      })),
    [views],
  );

  const linkedMedia = useMemo(() => {
    if (selectedPoint?.media?.length) {
      return selectedPoint.media;
    }
    return media.filter((item) => item.inspectionPointId === selectedPoint?.id);
  }, [media, selectedPoint]);

  const availableMedia = useMemo(
    () => media.filter((item) => !item.inspectionPointId),
    [media],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const project = await getRovProject(projectId);
      const s = project.structures?.find((st) => st.id === structureId) ?? null;
      setStructure(s);

      const viewList = await listViews(projectId, structureId);
      setViews(viewList);
      setViewId((current) => current || viewList[0]?.id || "");

      const mediaList = await listMedia(projectId, structureId);
      setMedia(mediaList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load annotation data");
    } finally {
      setLoading(false);
    }
  }, [projectId, structureId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!viewId) return;
    void (async () => {
      try {
        const pointList = await listPoints(projectId, structureId, viewId);
        setPoints(pointList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load points");
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
      const pointList = await listPoints(projectId, structureId, activeViewId);
      setPoints(pointList);
    },
    [projectId, structureId],
  );

  const refreshMedia = useCallback(async () => {
    const mediaList = await listMedia(projectId, structureId);
    setMedia(mediaList);
  }, [projectId, structureId]);

  const handlePlacePin = useCallback(
    async (x: number, y: number) => {
      if (!viewId) return;
      try {
        const created = await createPoint(projectId, structureId, viewId, {
          xCoordinate: x,
          yCoordinate: y,
        });
        await reloadPoints(viewId);
        const nextDraft = pointToDraft(created);
        setDraft(nextDraft);
        setSavedDraft(nextDraft);
        setSelectedPointId(created.id);
        setAddMode(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to place pin");
      }
    },
    [viewId, projectId, structureId, reloadPoints],
  );

  const handleMovePin = useCallback(
    async (pointId: string, x: number, y: number) => {
      if (!viewId) return;
      try {
        await updatePoint(projectId, structureId, viewId, pointId, {
          xCoordinate: x,
          yCoordinate: y,
        });
        await reloadPoints(viewId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move pin");
      }
    },
    [viewId, projectId, structureId, reloadPoints],
  );

  const selectPoint = useCallback(
    (pointId: string | null) => {
      if (pointId === selectedPointId) return;
      if (
        draftDirty &&
        !confirm("You have unsaved changes. Discard them and switch observations?")
      ) {
        return;
      }
      setSelectedPointId(pointId);
      setAddMode(false);
    },
    [draftDirty, selectedPointId],
  );

  const handleSavePoint = useCallback(async () => {
    if (!selectedPoint || !viewId || !draft) return;
    setSavingPoint(true);
    setError(null);
    try {
      await updatePoint(
        projectId,
        structureId,
        viewId,
        selectedPoint.id,
        draftToUpdateInput(draft),
      );
      await reloadPoints(viewId);
      setSavedDraft(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save observation");
    } finally {
      setSavingPoint(false);
    }
  }, [selectedPoint, viewId, draft, projectId, structureId, reloadPoints]);

  const handleCancelPointEdit = useCallback(() => {
    if (savedDraft) {
      setDraft(savedDraft);
    }
  }, [savedDraft]);

  const handleDeletePoint = useCallback(async () => {
    if (!selectedPoint || !viewId) return;
    if (!confirm("Delete this observation pin?")) return;
    try {
      await deletePoint(projectId, structureId, viewId, selectedPoint.id);
      setSelectedPointId(null);
      await reloadPoints(viewId);
      await refreshMedia();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete point");
    }
  }, [selectedPoint, viewId, projectId, structureId, reloadPoints, refreshMedia]);

  const handleLinkMedia = useCallback(
    async (mediaId: string) => {
      if (!selectedPoint) return;
      setMediaBusy(true);
      try {
        await updateMedia(projectId, mediaId, {
          inspectionPointId: selectedPoint.id,
        });
        await refreshMedia();
        if (viewId) await reloadPoints(viewId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to link media");
      } finally {
        setMediaBusy(false);
      }
    },
    [selectedPoint, projectId, viewId, reloadPoints, refreshMedia],
  );

  const handleUploadMedia = useCallback(
    async (result: {
      key: string;
      fileName: string;
      contentType: string;
      size: number;
    }) => {
      if (!selectedPoint) return;
      setMediaBusy(true);
      try {
        await createMedia(projectId, {
          structureId,
          inspectionPointId: selectedPoint.id,
          mediaType: result.contentType.startsWith("video/") ? "video" : "image",
          fileName: result.fileName,
          filePath: result.key,
          mimeType: result.contentType,
          fileSize: result.size,
        });
        await refreshMedia();
        if (viewId) await reloadPoints(viewId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload media");
      } finally {
        setMediaBusy(false);
      }
    },
    [selectedPoint, projectId, structureId, viewId, reloadPoints, refreshMedia],
  );

  const handleUnlinkMedia = useCallback(
    async (mediaId: string) => {
      if (!selectedPoint || !viewId) return;
      setMediaBusy(true);
      try {
        await updateMedia(projectId, mediaId, {
          inspectionPointId: null,
        });
        await refreshMedia();
        await reloadPoints(viewId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unlink media");
      } finally {
        setMediaBusy(false);
      }
    },
    [selectedPoint, projectId, viewId, reloadPoints, refreshMedia],
  );

  const { src: diagramSrc, failed: diagramFailed } = useRovAssetSrc(
    structure?.diagramPath,
  );
  const hasDiagram = Boolean(structure?.diagramPath);

  if (loading) {
    return (
      <AppPage title="Annotate diagram" subtitle="Loading...">
        <Text as="p" tone="subdued">
          Loading...
        </Text>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={`Annotate: ${structure?.name ?? "Structure"}`}
      subtitle="Place pins on the diagram, capture findings, and link ROV photos or video."
      backAction={{
        content: "Back to project",
        onAction: () =>
          router.push(`/dashboard/rov/projects/${projectId}?tab=structures`),
      }}
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {!hasDiagram ? (
          <Banner tone="warning">
            Upload an engineering diagram on the Structures tab before annotating.
          </Banner>
        ) : diagramFailed ? (
          <Banner tone="critical">
            Could not load the diagram image. Try re-uploading it from the
            Structures tab.
          </Banner>
        ) : null}

        <div className="rov-annotate-layout">
          <div className="rov-annotate-layout__main">
            <Card padding="400">
              <BlockStack gap="300">
                <div className="rov-annotate-toolbar">
                  <div style={{ minWidth: 240, flex: 1 }}>
                    {views.length > 1 ? (
                      <AppSelect
                        label="Inspection view"
                        options={viewOptions}
                        value={viewId}
                        onChange={(id) => {
                          if (
                            draftDirty &&
                            !confirm(
                              "You have unsaved changes. Discard them and switch views?",
                            )
                          ) {
                            return;
                          }
                          setViewId(id);
                          setSelectedPointId(null);
                        }}
                      />
                    ) : activeView ? (
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Inspection view
                        </Text>
                        <Text as="p" tone="subdued">
                          {activeView.name} · {activeView.viewType.toUpperCase()}
                        </Text>
                      </BlockStack>
                    ) : null}
                  </div>
                  <ButtonGroup>
                    <Button pressed={addMode} onClick={() => setAddMode(true)}>
                      Add pin
                    </Button>
                  </ButtonGroup>
                  {selectedPoint ? (
                    <Badge tone="info">
                      {selectedPoint.observationId ?? "Selected pin"}
                    </Badge>
                  ) : null}
                </div>

                <RovDiagramCanvas
                  imageSrc={diagramSrc}
                  points={points}
                  selectedPointId={selectedPointId}
                  mode="annotate"
                  addMode={addMode && hasDiagram && !diagramFailed}
                  emptyLabel={
                    hasDiagram && !diagramFailed ? "Loading diagram..." : "No diagram"
                  }
                  onPlacePin={(x, y) => void handlePlacePin(x, y)}
                  onSelectPin={selectPoint}
                  onMovePin={(id, x, y) => void handleMovePin(id, x, y)}
                />
              </BlockStack>
            </Card>

            {selectedPoint && draft && savedDraft ? (
              <Card padding="400">
                <ObservationPointForm
                  observationId={selectedPoint.observationId}
                  draft={draft}
                  dirty={draftDirty}
                  saving={savingPoint}
                  onDraftChange={setDraft}
                  onSave={() => void handleSavePoint()}
                  onCancel={handleCancelPointEdit}
                  onDelete={() => void handleDeletePoint()}
                />
              </Card>
            ) : (
              <Card padding="400">
                <div className="rov-annotate-empty">
                  <Text as="h3" variant="headingSm">
                    No pin selected
                  </Text>
                  <Text as="p" tone="subdued">
                    Enable Add pin and click the diagram, or select an existing
                    observation to edit its details.
                  </Text>
                </div>
              </Card>
            )}
          </div>

          <div className="rov-annotate-layout__sidebar">
            {selectedPoint ? (
              <Card padding="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Media for {selectedPoint.observationId ?? "observation"}
                  </Text>
                  <ObservationMediaPanel
                    variant="sidebar"
                    linkedMedia={linkedMedia}
                    availableMedia={availableMedia}
                    onLink={(id) => void handleLinkMedia(id)}
                    onUnlink={(id) => void handleUnlinkMedia(id)}
                    onUpload={(result) => void handleUploadMedia(result)}
                    linking={mediaBusy}
                    disabled={!selectedPoint}
                  />
                </BlockStack>
              </Card>
            ) : (
              <Card padding="400">
                <div className="rov-annotate-empty">
                  <Text as="h3" variant="headingSm">
                    Observation media
                  </Text>
                  <Text as="p" tone="subdued">
                    Select a pin to upload photos, link library footage, or
                    review attached media.
                  </Text>
                </div>
              </Card>
            )}
          </div>
        </div>
      </BlockStack>
    </AppPage>
  );
}
