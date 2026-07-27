"use client";

import { Icon, Spinner, Text } from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  removeProjectPlanView,
  removeProjectSiteMap,
  uploadProjectPlanView,
  uploadProjectSiteMap,
} from "@/lib/rov-api";
import { useRovAssetSrc } from "./use-rov-asset-src";

type ProjectImageKind = "plan-view" | "site-map";

interface RovProjectImageUploadProps {
  projectId?: string;
  kind: ProjectImageKind;
  ariaLabel: string;
  imagePath: string | null;
  pendingFile?: File | null;
  disabled?: boolean;
  onImagePathChange?: (path: string | null) => void;
  onPendingFileChange?: (file: File | null) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RovProjectImageUpload({
  projectId,
  kind,
  ariaLabel,
  imagePath,
  pendingFile,
  disabled,
  onImagePathChange,
  onPendingFileChange,
}: RovProjectImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState(imagePath);

  useEffect(() => {
    setLocalPath(imagePath);
  }, [imagePath]);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const { src: savedImageSrc } = useRovAssetSrc(localPath);
  const displayUrl = previewUrl ?? savedImageSrc;
  const displayName = pendingFile?.name ?? localPath?.split("/").pop() ?? "";
  const displaySize = pendingFile ? formatFileSize(pendingFile.size) : null;

  const uploadFile = useCallback(
    async (file: File) => {
      if (!projectId || disabled || uploading) return;

      setUploading(true);
      setError(null);

      try {
        const updated =
          kind === "plan-view"
            ? await uploadProjectPlanView(projectId, file)
            : await uploadProjectSiteMap(projectId, file);
        const path =
          kind === "plan-view" ? updated.planViewPath : updated.siteMapPath;
        setLocalPath(path);
        onImagePathChange?.(path);
        onPendingFileChange?.(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [
      disabled,
      kind,
      onImagePathChange,
      onPendingFileChange,
      projectId,
      uploading,
    ],
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || disabled || uploading) return;

      if (projectId) {
        void uploadFile(file);
        return;
      }

      onPendingFileChange?.(file);
    },
    [disabled, onPendingFileChange, projectId, uploadFile, uploading],
  );

  const handleRemove = useCallback(async () => {
    if (disabled || uploading) return;

    if (pendingFile) {
      onPendingFileChange?.(null);
      return;
    }

    if (!projectId || !localPath) return;

    setUploading(true);
    setError(null);

    try {
      if (kind === "plan-view") {
        await removeProjectPlanView(projectId);
      } else {
        await removeProjectSiteMap(projectId);
      }
      setLocalPath(null);
      onImagePathChange?.(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove image");
    } finally {
      setUploading(false);
    }
  }, [
    disabled,
    kind,
    localPath,
    onImagePathChange,
    onPendingFileChange,
    pendingFile,
    projectId,
    uploading,
  ]);

  return (
    <div className="rov-project-image-upload">
      {displayUrl ? (
        <div className="rov-project-image-upload__preview">
          <div className="rov-project-image-upload__toolbar">
            <button
              type="button"
              className="rov-project-image-upload__icon-btn"
              aria-label="Remove image"
              disabled={disabled || uploading}
              onClick={() => void handleRemove()}
            >
              ×
            </button>
            {displayName ? (
              <div className="rov-project-image-upload__meta">
                <span>{displayName}</span>
                {displaySize ? <span>{displaySize}</span> : null}
              </div>
            ) : null}
          </div>

          <img
            src={displayUrl}
            alt={ariaLabel}
            className="rov-project-image-upload__image"
          />

          <button
            type="button"
            className="rov-project-image-upload__edit-btn"
            aria-label="Replace image"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            ✎
          </button>

          {uploading ? (
            <div className="rov-project-image-upload__overlay">
              <Spinner size="small" />
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="rov-project-image-upload__add"
          aria-label={ariaLabel}
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Spinner size="small" />
          ) : (
            <Icon source={PlusIcon} tone="subdued" />
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileSelect}
      />

      {!projectId && !displayUrl ? (
        <Text as="p" tone="subdued" variant="bodySm">
          Saves when you create the project.
        </Text>
      ) : null}

      {error ? (
        <Text as="p" tone="critical" variant="bodySm">
          {error}
        </Text>
      ) : null}
    </div>
  );
}
