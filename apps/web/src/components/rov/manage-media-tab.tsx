"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Modal,
  Text,
  TextField,
} from "@shopify/polaris";
import { Film, ImageIcon, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import { createMedia, deleteMedia, listMedia } from "@/lib/rov-api";
import type { InspectionMedia, ProjectStructure } from "@/types/rov";
import { S3MultipartUploader } from "./s3-multipart-uploader";

interface ManageMediaTabProps {
  projectId: string;
  structures: ProjectStructure[];
}

type MediaFilter = "all" | "image" | "video" | "unlinked";

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return " ";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedAt(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MediaPreview({ item }: { item: InspectionMedia }) {
  const previewUrl = item.thumbnailUrl ?? item.url;

  if (item.mediaType === "video" && item.url) {
    return (
      <div className="rov-media-card__preview">
        <video
          src={item.url}
          className="rov-media-card__media"
          preload="metadata"
          poster={item.thumbnailUrl ?? undefined}
        />
        <span className="rov-media-card__type-icon">
          <Film size={18} />
        </span>
      </div>
    );
  }

  if (previewUrl) {
    return (
      <div className="rov-media-card__preview">
        <img
          src={previewUrl}
          alt={item.fileName}
          className="rov-media-card__media"
        />
      </div>
    );
  }

  return (
    <div className="rov-media-card__preview rov-media-card__preview--empty">
      {item.mediaType === "video" ? (
        <Film size={28} strokeWidth={1.5} />
      ) : (
        <ImageIcon size={28} strokeWidth={1.5} />
      )}
    </div>
  );
}

export function ManageMediaTab({ projectId, structures }: ManageMediaTabProps) {
  const [structureFilter, setStructureFilter] = useState(
    structures[0]?.id ?? "all",
  );
  const [typeFilter, setTypeFilter] = useState<MediaFilter>("all");
  const [displayName, setDisplayName] = useState("");
  const [uploadStructureId, setUploadStructureId] = useState(
    structures[0]?.id ?? "",
  );
  const [media, setMedia] = useState<InspectionMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionMedia | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const structureId =
        structureFilter === "all" ? undefined : structureFilter;
      const data = await listMedia(projectId, structureId);
      setMedia(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [projectId, structureFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!uploadStructureId && structures[0]) {
      setUploadStructureId(structures[0].id);
    }
  }, [structures, uploadStructureId]);

  const filteredMedia = useMemo(() => {
    return media.filter((item) => {
      if (typeFilter === "image") return item.mediaType === "image";
      if (typeFilter === "video") return item.mediaType === "video";
      if (typeFilter === "unlinked") return !item.inspectionPointId;
      return true;
    });
  }, [media, typeFilter]);

  const stats = useMemo(() => {
    const images = media.filter((item) => item.mediaType === "image").length;
    const videos = media.filter((item) => item.mediaType === "video").length;
    const linked = media.filter((item) => item.inspectionPointId).length;
    return {
      total: media.length,
      images,
      videos,
      linked,
      unlinked: media.length - linked,
    };
  }, [media]);

  const structureOptions = useMemo(
    () => [
      { value: "all", label: "All structures", description: "Show media for every structure" },
      ...structures.map((structure) => ({
        value: structure.id,
        label: structure.name,
        description: structure.description ?? "Structure media",
      })),
    ],
    [structures],
  );

  const uploadStructureOptions = useMemo(
    () =>
      structures.map((structure) => ({
        value: structure.id,
        label: structure.name,
        description: "Upload to this structure library",
      })),
    [structures],
  );

  const filterOptions = [
    { value: "all", label: "All media", description: `${stats.total} files` },
    { value: "image", label: "Images", description: `${stats.images} images` },
    { value: "video", label: "Videos", description: `${stats.videos} videos` },
    {
      value: "unlinked",
      label: "Unlinked",
      description: `${stats.unlinked} not attached to observations`,
    },
  ];

  const handleUploaded = useCallback(
    async (result: {
      key: string;
      fileName: string;
      contentType: string;
      size: number;
    }) => {
      if (!uploadStructureId) {
        setError("Select a structure before uploading.");
        return;
      }

      try {
        await createMedia(projectId, {
          structureId: uploadStructureId,
          mediaType: result.contentType.startsWith("video/") ? "video" : "image",
          fileName: displayName.trim() || result.fileName,
          filePath: result.key,
          mimeType: result.contentType,
          fileSize: result.size,
        });
        setDisplayName("");
        if (structureFilter === "all" || structureFilter === uploadStructureId) {
          await load();
        } else {
          setStructureFilter(uploadStructureId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save media");
      }
    },
    [projectId, uploadStructureId, displayName, load, structureFilter],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMedia(projectId, deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <BlockStack gap="400">
      {error ? (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      <div className="rov-media-library__stats">
        <div className="rov-media-library__stat">
          <Text as="p" variant="headingLg" fontWeight="bold">
            {stats.total}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Total files
          </Text>
        </div>
        <div className="rov-media-library__stat">
          <Text as="p" variant="headingLg" fontWeight="bold">
            {stats.images}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Images
          </Text>
        </div>
        <div className="rov-media-library__stat">
          <Text as="p" variant="headingLg" fontWeight="bold">
            {stats.videos}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Videos
          </Text>
        </div>
        <div className="rov-media-library__stat">
          <Text as="p" variant="headingLg" fontWeight="bold">
            {stats.unlinked}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Unlinked
          </Text>
        </div>
      </div>

      <div className="rov-media-library__layout">
        <Card padding="400">
          <BlockStack gap="400">
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Upload size={18} />
                <Text as="h3" variant="headingSm">
                  Upload inspection media
                </Text>
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodySm">
                Add ROV photos or video to the structure library. Link files to
                observations from the Annotate page.
              </Text>
            </BlockStack>

            {structures.length === 0 ? (
              <Text as="p" tone="subdued">
                Add a structure on the Structures tab before uploading media.
              </Text>
            ) : (
              <BlockStack gap="300">
                <AppSelect
                  label="Upload to structure"
                  options={uploadStructureOptions}
                  value={uploadStructureId}
                  onChange={setUploadStructureId}
                />
                <TextField
                  label="Display name"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Optional label (defaults to filename)"
                  autoComplete="off"
                  helpText="Use a clear name inspectors will recognize in reports."
                />
                <div className="rov-media-library__upload-zone">
                  <S3MultipartUploader
                    variant="compact"
                    label="Choose photo or video"
                    helpText="MP4, MOV, WebM, JPG, PNG, WebP · large files upload in chunks"
                    onUploaded={(result) => void handleUploaded(result)}
                    disabled={!uploadStructureId}
                  />
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <BlockStack gap="300">
          <Card padding="400">
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
              <AppSelect
                label="Structure filter"
                options={structureOptions}
                value={structureFilter}
                onChange={setStructureFilter}
              />
              <AppSelect
                label="Show"
                options={filterOptions}
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as MediaFilter)}
              />
            </InlineGrid>
          </Card>

          {loading ? (
            <Card padding="800">
              <Text as="p" tone="subdued" alignment="center">
                Loading media…
              </Text>
            </Card>
          ) : filteredMedia.length === 0 ? (
            <Card>
              <EmptyState
                heading={media.length === 0 ? "No media yet" : "No matching media"}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {media.length === 0
                    ? "Upload ROV footage above, then link it to observation pins while annotating."
                    : "Try a different filter to see more files."}
                </p>
              </EmptyState>
            </Card>
          ) : (
            <div className="rov-media-library__grid">
              {filteredMedia.map((item) => (
                <div key={item.id} className="rov-media-card">
                  <MediaPreview item={item} />
                  <div className="rov-media-card__body">
                    <InlineStack align="space-between" blockAlign="start" gap="200">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold" truncate>
                          {item.fileName}
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          {item.structureName ?? " "} · {formatFileSize(item.fileSize)}
                        </Text>
                      </BlockStack>
                      <Badge tone={item.mediaType === "video" ? "info" : "success"}>
                        {item.mediaType}
                      </Badge>
                    </InlineStack>

                    <InlineStack gap="150" wrap>
                      {item.inspectionPointId ? (
                        <Badge tone="attention">Linked to observation</Badge>
                      ) : (
                        <Badge>Unlinked</Badge>
                      )}
                      <Text as="span" tone="subdued" variant="bodySm">
                        {formatUploadedAt(item.uploadedAt)}
                      </Text>
                    </InlineStack>

                    <InlineStack gap="200">
                      {item.url ? (
                        <Button
                          size="slim"
                          url={item.url}
                          external
                          target="_blank"
                        >
                          Open
                        </Button>
                      ) : null}
                      <Button
                        size="slim"
                        tone="critical"
                        onClick={() => setDeleteTarget(item)}
                      >
                        Delete
                      </Button>
                    </InlineStack>
                  </div>
                </div>
              ))}
            </div>
          )}
        </BlockStack>
      </div>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete media file?"
        primaryAction={{
          content: "Delete file",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteTarget(null),
            disabled: deleting,
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Delete{" "}
            <Text as="span" fontWeight="semibold">
              {deleteTarget?.fileName}
            </Text>
            ? This removes the file from the project library
            {deleteTarget?.inspectionPointId
              ? " and unlinks it from its observation"
              : ""}
            .
          </Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
