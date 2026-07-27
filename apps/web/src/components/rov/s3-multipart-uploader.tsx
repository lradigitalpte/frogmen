"use client";

import { Button, Text } from "@shopify/polaris";
import { useCallback, useRef, useState } from "react";
import {
  s3AbortUpload,
  s3CompleteUpload,
  s3CreateUpload,
  s3UploadPart,
} from "@/lib/rov-api";

const CHUNK_SIZE = 10 * 1024 * 1024;

export interface S3UploadResult {
  key: string;
  fileName: string;
  contentType: string;
  size: number;
}

interface S3MultipartUploaderProps {
  onUploaded: (result: S3UploadResult) => void;
  disabled?: boolean;
  variant?: "default" | "compact";
  label?: string;
  helpText?: string;
}

export function S3MultipartUploader({
  onUploaded,
  disabled,
  variant = "default",
  label = "Upload photo or video",
  helpText,
}: S3MultipartUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setProgress(0);
      setError(null);

      let key = "";
      let uploadId = "";

      try {
        const created = await s3CreateUpload(file.name, file.type);
        key = created.key;
        uploadId = created.uploadId;

        const totalParts = Math.ceil(file.size / CHUNK_SIZE);
        const parts: Array<{ PartNumber: number; ETag: string }> = [];

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          const start = (partNumber - 1) * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          const { etag } = await s3UploadPart(key, uploadId, partNumber, chunk);
          parts.push({ PartNumber: partNumber, ETag: etag });
          setProgress(Math.round((partNumber / totalParts) * 100));
        }

        await s3CompleteUpload(key, uploadId, parts);
        onUploaded({
          key,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        });
        setProgress(100);
      } catch (err) {
        if (key && uploadId) {
          await s3AbortUpload(key, uploadId).catch(() => undefined);
        }
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onUploaded],
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/gif"
      disabled={disabled || uploading}
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void uploadFile(file);
      }}
    />
  );

  const progressBar = uploading ? (
    <div className="rov-media-upload__progress">
      <div className="rov-media-upload__progress-track">
        <div
          className="rov-media-upload__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <Text as="p" tone="subdued" variant="bodySm">
        Uploading… {progress}%
      </Text>
    </div>
  ) : null;

  if (variant === "compact") {
    return (
      <div className="rov-media-upload rov-media-upload--compact">
        {input}
        <Button
          fullWidth
          disabled={disabled || uploading}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {label}
        </Button>
        {helpText ? (
          <Text as="p" tone="subdued" variant="bodySm">
            {helpText}
          </Text>
        ) : null}
        {progressBar}
        {error ? (
          <Text as="p" tone="critical" variant="bodySm">
            {error}
          </Text>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rov-media-upload">
      {input}
      <Button
        disabled={disabled || uploading}
        loading={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
      {helpText ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {helpText}
        </Text>
      ) : null}
      {progressBar}
      {error ? (
        <Text as="p" tone="critical" variant="bodySm">
          {error}
        </Text>
      ) : null}
    </div>
  );
}
