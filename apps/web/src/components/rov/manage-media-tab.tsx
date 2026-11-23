"use client";

import {
  Badge,
  Button,
  Icon,
  Modal,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import { ImageIcon, PlayIcon, SearchIcon, UploadIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/providers/toast-provider";
import { createMedia, deleteMedia, listAllPoints, listMedia, updateMedia } from "@/lib/rov-api";
import { cn } from "@/lib/utils";
import type { InspectionMedia, InspectionPoint, InspectionSeverity, ProjectStructure } from "@/types/rov";
import { S3MultipartUploader } from "./s3-multipart-uploader";

interface ManageMediaTabProps {
  projectId: string;
  structures: ProjectStructure[];
  onChanged?: () => void;
}

type Filter = "all" | "image" | "video" | "unlinked" | "linked";
type Sort = "newest" | "oldest" | "name" | "largest";

const SORTS = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Name A–Z", value: "name" },
  { label: "Largest first", value: "largest" },
];

const SEVERITY: Record<InspectionSeverity, { label: string; tone: "critical" | "warning" | "info" }> = {
  major: { label: "Major", tone: "critical" },
  moderate: { label: "Moderate", tone: "warning" },
  minor: { label: "Minor", tone: "info" },
};

const UNLINKED = "__none";

function formatSize(bytes: number | null | undefined) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Upload keys are random hashes; show something a person can read. */
function looksHashed(name: string) {
  return /^[a-f0-9]{24,}\.[a-z0-9]+$/i.test(name);
}

function displayName(item: InspectionMedia) {
  if (!looksHashed(item.fileName)) return item.fileName;
  const ext = item.fileName.split(".").pop()?.toUpperCase();
  return `${item.mediaType === "video" ? "Video" : "Photo"} ${ext ? `(${ext})` : ""}`.trim();
}

function Thumb({ item, large }: { item: InspectionMedia; large?: boolean }) {
  const src = item.thumbnailUrl ?? item.url;
  if (item.mediaType === "video" && item.url) {
    return (
      <video
        className="rov-md__media"
        src={item.url}
        poster={item.thumbnailUrl ?? undefined}
        preload="metadata"
        controls={large}
        muted={!large}
        playsInline
      />
    );
  }
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="rov-md__media" src={src} alt={item.fileName} />;
  }
  return (
    <span className="rov-md__media rov-md__media--empty">
      <Icon source={item.mediaType === "video" ? PlayIcon : ImageIcon} tone="subdued" />
    </span>
  );
}

export function ManageMediaTab({ projectId, structures, onChanged }: ManageMediaTabProps) {
  const { showSuccess, showError } = useToast();
  const [media, setMedia] = useState<InspectionMedia[]>([]);
  const [points, setPoints] = useState<InspectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [structureFilter, setStructureFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStructureId, setUploadStructureId] = useState(structures[0]?.id ?? "");
  const [uploadName, setUploadName] = useState("");

  const [preview, setPreview] = useState<InspectionMedia | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionMedia | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, p] = await Promise.all([listMedia(projectId), listAllPoints(projectId)]);
      setMedia(m);
      setPoints(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load media");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!uploadStructureId && structures[0]) setUploadStructureId(structures[0].id);
  }, [structures, uploadStructureId]);

  useEffect(() => {
    setRenameValue(preview?.fileName ?? "");
  }, [preview]);

  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);

  const pointOptionsFor = useCallback(
    (structureId: string) => [
      { label: "Not linked", value: UNLINKED },
      ...points
        .filter((p) => p.structureId === structureId)
        .map((p) => ({
          label: [p.observationId ?? "Observation", p.findingType, p.severity ? SEVERITY[p.severity].label : "Not rated"]
            .filter(Boolean)
            .join(" · "),
          value: p.id,
        })),
    ],
    [points],
  );

  const stats = useMemo(() => {
    let images = 0;
    let videos = 0;
    let linked = 0;
    let bytes = 0;
    for (const m of media) {
      if (m.mediaType === "video") videos += 1;
      else if (m.mediaType === "image") images += 1;
      if (m.inspectionPointId) linked += 1;
      bytes += m.fileSize ?? 0;
    }
    const covered = new Set(media.map((m) => m.inspectionPointId).filter(Boolean)).size;
    return { total: media.length, images, videos, linked, unlinked: media.length - linked, bytes, covered };
  }, [media]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = media.filter((m) => {
      if (filter === "image" && m.mediaType !== "image") return false;
      if (filter === "video" && m.mediaType !== "video") return false;
      if (filter === "unlinked" && m.inspectionPointId) return false;
      if (filter === "linked" && !m.inspectionPointId) return false;
      if (structureFilter !== "all" && m.structureId !== structureFilter) return false;
      if (!q) return true;
      const point = m.inspectionPointId ? pointById.get(m.inspectionPointId) : null;
      return [m.fileName, m.structureName, point?.observationId, point?.findingType]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    return rows.sort((a, b) => {
      if (sort === "oldest") return a.uploadedAt.localeCompare(b.uploadedAt);
      if (sort === "name") return displayName(a).localeCompare(displayName(b));
      if (sort === "largest") return (b.fileSize ?? 0) - (a.fileSize ?? 0);
      return b.uploadedAt.localeCompare(a.uploadedAt);
    });
  }, [filter, media, pointById, query, sort, structureFilter]);

  const replaceItem = (updated: InspectionMedia) => {
    setMedia((list) => list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    setPreview((p) => (p && p.id === updated.id ? { ...p, ...updated } : p));
  };

  const handleLink = async (item: InspectionMedia, value: string) => {
    const pointId = value === UNLINKED ? null : value;
    if (pointId === item.inspectionPointId) return;
    setBusyId(item.id);
    try {
      const updated = await updateMedia(projectId, item.id, { inspectionPointId: pointId });
      replaceItem({ ...item, ...updated, inspectionPointId: pointId });
      const obs = pointId ? pointById.get(pointId)?.observationId ?? "observation" : null;
      showSuccess(obs ? `Linked to ${obs}` : "Unlinked");
      onChanged?.();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not update the link");
    } finally {
      setBusyId(null);
    }
  };

  const handleRename = async () => {
    if (!preview) return;
    const name = renameValue.trim();
    if (!name || name === preview.fileName) return;
    setBusyId(preview.id);
    try {
      const updated = await updateMedia(projectId, preview.id, { fileName: name });
      replaceItem({ ...preview, ...updated, fileName: name });
      showSuccess("Name updated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not rename the file");
    } finally {
      setBusyId(null);
    }
  };

  const handleUploaded = useCallback(
    async (result: { key: string; fileName: string; contentType: string; size: number }) => {
      if (!uploadStructureId) {
        showError("Choose a structure before uploading.");
        return;
      }
      try {
        await createMedia(projectId, {
          structureId: uploadStructureId,
          mediaType: result.contentType.startsWith("video/") ? "video" : "image",
          fileName: uploadName.trim() || result.fileName,
          filePath: result.key,
          mimeType: result.contentType,
          fileSize: result.size,
        });
        setUploadName("");
        showSuccess(`${uploadName.trim() || result.fileName} uploaded`);
        await load();
        onChanged?.();
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not save the upload");
      }
    },
    [load, onChanged, projectId, showError, showSuccess, uploadName, uploadStructureId],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMedia(projectId, deleteTarget.id);
      showSuccess(`${displayName(deleteTarget)} deleted`);
      if (preview?.id === deleteTarget.id) setPreview(null);
      setDeleteTarget(null);
      await load();
      onChanged?.();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not delete the file");
    } finally {
      setDeleting(false);
    }
  };

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: stats.total },
    { id: "image", label: "Photos", count: stats.images },
    { id: "video", label: "Videos", count: stats.videos },
    { id: "linked", label: "Linked", count: stats.linked },
    { id: "unlinked", label: "Not linked", count: stats.unlinked },
  ];
  const isFiltered = filter !== "all" || structureFilter !== "all" || query.trim() !== "";
  const linkedPct = stats.total ? Math.round((stats.linked / stats.total) * 100) : 0;
  const structureSelect = structures.map((s) => ({ label: s.name, value: s.id }));

  const previewPoint = preview?.inspectionPointId ? pointById.get(preview.inspectionPointId) : null;

  return (
    <div className="rov-md">
      {error ? (
        <div className="ac-error">
          {error}{" "}
          <button className="st-link" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}

      {/* ── Summary + upload ── */}
      <section className="rov-ob__summary rov-md__summary">
        <div className="rov-ob__summary-main">
          <span className="rov-ob__summary-label">Media library</span>
          <strong>{loading && media.length === 0 ? "…" : stats.total}</strong>
          <small>
            {stats.total === 0
              ? "No files yet"
              : `${stats.images} photo${stats.images === 1 ? "" : "s"} · ${stats.videos} video${stats.videos === 1 ? "" : "s"}${
                  formatSize(stats.bytes) ? ` · ${formatSize(stats.bytes)}` : ""
                }`}
          </small>
        </div>
        <div className="rov-ob__summary-bar">
          <div className="rov-md__linkline">
            <span>Linked to findings</span>
            <strong>
              {stats.linked}/{stats.total}
            </strong>
          </div>
          <div className="rov-ob__bar">
            <b className="is-linked" style={{ width: `${linkedPct}%` }} />
          </div>
          <small className="rov-md__note">
            {stats.total === 0
              ? "Upload ROV stills and clips, then attach them to observations."
              : stats.unlinked > 0
                ? `${stats.unlinked} file${stats.unlinked === 1 ? "" : "s"} not attached to a finding yet`
                : `Every file is attached · ${stats.covered} of ${points.length} finding${points.length === 1 ? "" : "s"} have media`}
          </small>
        </div>
        <div className="rov-md__upload-cta">
          <Button
            variant="primary"
            icon={UploadIcon}
            disabled={structures.length === 0}
            onClick={() => setUploadOpen((v) => !v)}
          >
            {uploadOpen ? "Hide upload" : "Upload media"}
          </Button>
        </div>
      </section>

      {uploadOpen ? (
        <section className="ex-surface rov-md__upload">
          {structures.length === 0 ? (
            <p className="rov-ov__none">Add a structure on the Structures tab before uploading media.</p>
          ) : (
            <>
              <div className="rov-md__upload-fields">
                <Select
                  label="Structure"
                  options={structureSelect}
                  value={uploadStructureId}
                  onChange={setUploadStructureId}
                />
                <TextField
                  label="Name"
                  value={uploadName}
                  onChange={setUploadName}
                  placeholder="Optional, e.g. Pile 1 splash zone"
                  helpText="Shown in the report. Leave empty to keep the file name."
                  autoComplete="off"
                />
              </div>
              <div className="rov-md__upload-zone">
                <S3MultipartUploader
                  variant="compact"
                  label="Choose photo or video"
                  helpText="MP4, MOV, WebM, JPG, PNG, WebP · large files upload in chunks"
                  onUploaded={(result) => void handleUploaded(result)}
                  disabled={!uploadStructureId}
                />
              </div>
              <p className="rov-md__upload-hint">
                Tip: to upload straight onto a finding, open it on the diagram (Annotate) and use its Media panel.
              </p>
            </>
          )}
        </section>
      ) : null}

      {/* ── Library ── */}
      <section className="ex-surface">
        <div className="st-toolbar rov-ob__toolbar">
          <div className="iv-filters" role="tablist" aria-label="Filter media">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={cn("iv-filter", filter === f.id && "is-active")}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span>{f.count}</span>
              </button>
            ))}
          </div>
          <div className="st-toolbar__controls">
            <TextField
              label="Search media"
              labelHidden
              autoComplete="off"
              placeholder="Search name, finding…"
              prefix={<Icon source={SearchIcon} tone="subdued" />}
              value={query}
              onChange={setQuery}
              clearButton
              onClearButtonClick={() => setQuery("")}
            />
            {structures.length > 1 ? (
              <Select
                label="Structure"
                labelHidden
                options={[{ label: "All structures", value: "all" }, ...structureSelect]}
                value={structureFilter}
                onChange={setStructureFilter}
              />
            ) : null}
            <Select label="Sort" labelHidden options={SORTS} value={sort} onChange={(v) => setSort(v as Sort)} />
          </div>
        </div>

        {loading && media.length === 0 ? (
          <div className="ex-pad">
            <SkeletonBodyText lines={6} />
          </div>
        ) : media.length === 0 ? (
          <div className="ex-empty">
            <span className="ex-empty__icon">
              <Icon source={ImageIcon} />
            </span>
            <strong>No media yet</strong>
            <p>Upload ROV photos and video, then attach each file to the finding it shows.</p>
            {structures.length > 0 ? (
              <Button variant="primary" onClick={() => setUploadOpen(true)}>
                Upload media
              </Button>
            ) : null}
          </div>
        ) : visible.length === 0 ? (
          <div className="ex-empty">
            <strong>No files match</strong>
            <p>Try another filter or clear the search.</p>
            {isFiltered ? (
              <Button
                onClick={() => {
                  setFilter("all");
                  setStructureFilter("all");
                  setQuery("");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className={cn("rov-md__grid", loading && "st-dim")}>
            {visible.map((item) => {
              const point = item.inspectionPointId ? pointById.get(item.inspectionPointId) : null;
              const sev = point?.severity ? SEVERITY[point.severity] : null;
              const meta = [
                structures.length > 1 ? item.structureName : null,
                formatSize(item.fileSize),
                formatDuration(item.duration),
              ].filter(Boolean);
              return (
                <article className="rov-md__card" key={item.id}>
                  <button
                    type="button"
                    className="rov-md__thumb"
                    onClick={() => setPreview(item)}
                    aria-label={`Preview ${displayName(item)}`}
                  >
                    <Thumb item={item} />
                    <span className="rov-md__type">{item.mediaType === "video" ? "Video" : "Photo"}</span>
                    {point ? (
                      <span className={cn("rov-md__pin rov-an__pin", point.severity ? `is-${point.severity}` : "is-none")}>
                        {point.observationId?.replace(/^O/, "") ?? "•"}
                      </span>
                    ) : null}
                  </button>
                  <div className="rov-md__body">
                    <button type="button" className="rov-md__name" onClick={() => setPreview(item)} title={item.fileName}>
                      {displayName(item)}
                    </button>
                    <small className="rov-md__meta">
                      {[...meta, formatWhen(item.uploadedAt)].join(" · ")}
                    </small>
                    <div className="rov-md__link">
                      {point ? (
                        <span className="rov-md__linked">
                          <span>
                            Linked to <strong>{point.observationId ?? "observation"}</strong>
                          </span>
                          {sev ? <Badge tone={sev.tone}>{sev.label}</Badge> : <Badge>Not rated</Badge>}
                        </span>
                      ) : (
                        <Badge tone="attention">Not linked</Badge>
                      )}
                    </div>
                    <div className="rov-md__actions">
                      <Select
                        label="Linked finding"
                        labelHidden
                        disabled={busyId === item.id}
                        options={pointOptionsFor(item.structureId)}
                        value={item.inspectionPointId ?? UNLINKED}
                        onChange={(v) => void handleLink(item, v)}
                      />
                      <Button size="slim" variant="plain" tone="critical" onClick={() => setDeleteTarget(item)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {media.length > 0 ? (
          <p className="pl-foot rov-ob__foot">
            Showing {visible.length} of {media.length} file{media.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </section>

      {/* ── Preview ── */}
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? displayName(preview) : "Preview"}
        size="large"
        primaryAction={
          preview?.url ? { content: "Open original", url: preview.url, external: true } : undefined
        }
        secondaryActions={[
          {
            content: "Delete",
            destructive: true,
            onAction: () => preview && setDeleteTarget(preview),
          },
        ]}
      >
        {preview ? (
          <>
            <div className="rov-md__stage">
              <Thumb item={preview} large />
            </div>
            <Modal.Section>
              <div className="rov-md__details">
                <div className="rov-md__rename">
                  <TextField
                    label="Name"
                    value={renameValue}
                    onChange={setRenameValue}
                    autoComplete="off"
                    connectedRight={
                      <Button
                        disabled={!renameValue.trim() || renameValue.trim() === preview.fileName}
                        loading={busyId === preview.id}
                        onClick={() => void handleRename()}
                      >
                        Save
                      </Button>
                    }
                  />
                </div>
                <Select
                  label="Linked finding"
                  disabled={busyId === preview.id}
                  options={pointOptionsFor(preview.structureId)}
                  value={preview.inspectionPointId ?? UNLINKED}
                  onChange={(v) => void handleLink(preview, v)}
                  helpText={
                    previewPoint
                      ? `Shown with ${previewPoint.observationId ?? "this finding"} in the client report.`
                      : "Attach it to the finding it shows."
                  }
                />
                <dl className="rov-md__facts">
                  <div>
                    <dt>Structure</dt>
                    <dd>{preview.structureName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{preview.mimeType ?? preview.mediaType}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatSize(preview.fileSize) ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Uploaded</dt>
                    <dd>
                      {formatWhen(preview.uploadedAt)}
                      {preview.uploaderName ? ` · ${preview.uploaderName}` : ""}
                    </dd>
                  </div>
                </dl>
              </div>
            </Modal.Section>
          </>
        ) : null}
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget ? displayName(deleteTarget) : "file"}?`}
        primaryAction={{ content: "Delete file", destructive: true, loading: deleting, onAction: () => void handleDelete() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteTarget(null), disabled: deleting }]}
      >
        <Modal.Section>
          <Text as="p">
            The file is removed from the project library
            {deleteTarget?.inspectionPointId
              ? ` and from ${pointById.get(deleteTarget.inspectionPointId)?.observationId ?? "its observation"}`
              : ""}
            .
          </Text>
        </Modal.Section>
      </Modal>
    </div>
  );
}
