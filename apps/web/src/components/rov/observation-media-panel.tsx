"use client";

import { Badge, Button, Text } from "@shopify/polaris";
import { Film, ImageIcon } from "lucide-react";
import type { InspectionMedia } from "@/types/rov";
import {
  S3MultipartUploader,
  type S3UploadResult,
} from "./s3-multipart-uploader";

interface ObservationMediaPanelProps {
  linkedMedia: InspectionMedia[];
  availableMedia: InspectionMedia[];
  onLink: (mediaId: string) => void;
  onUnlink: (mediaId: string) => void;
  onUpload: (result: S3UploadResult) => void;
  linking?: boolean;
  disabled?: boolean;
  variant?: "sidebar" | "wide";
}

function MediaPreview({
  item,
  size = "thumb",
}: {
  item: InspectionMedia;
  size?: "thumb" | "tile" | "large";
}) {
  const previewUrl = item.thumbnailUrl ?? item.url;
  const className = `rov-observation-media__preview rov-observation-media__preview--${size}`;

  if (item.mediaType === "video" && item.url) {
    return (
      <div className={className}>
        <video
          src={item.url}
          controls={size === "large"}
          preload="metadata"
          poster={item.thumbnailUrl ?? undefined}
          className="rov-observation-media__video"
        />
        {size === "thumb" ? (
          <span className="rov-observation-media__type-badge">
            <Film size={12} />
          </span>
        ) : null}
      </div>
    );
  }

  if (previewUrl) {
    return (
      <div className={className}>
        <img
          src={previewUrl}
          alt={item.fileName}
          className="rov-observation-media__image"
        />
      </div>
    );
  }

  return (
    <div className={`${className} rov-observation-media__preview--empty`}>
      {item.mediaType === "video" ? (
        <Film size={size === "thumb" ? 18 : 28} strokeWidth={1.5} />
      ) : (
        <ImageIcon size={size === "thumb" ? 18 : 28} strokeWidth={1.5} />
      )}
    </div>
  );
}

export function ObservationMediaPanel({
  linkedMedia,
  availableMedia,
  onLink,
  onUnlink,
  onUpload,
  linking = false,
  disabled = false,
  variant = "sidebar",
}: ObservationMediaPanelProps) {
  const isWide = variant === "wide";

  return (
    <div
      className={`rov-observation-media${isWide ? " rov-observation-media--wide" : ""}`}
    >
      <div className="rov-observation-media__columns">
        <div className="rov-observation-media__section">
          <Text as="h4" variant="headingSm">
            Upload new
          </Text>
          <S3MultipartUploader
            variant="compact"
            label="Upload photo or video"
            helpText="Attaches directly to this observation."
            disabled={disabled || linking}
            onUploaded={onUpload}
          />
        </div>

        <div className="rov-observation-media__section">
          <Text as="h4" variant="headingSm">
            Add from library
          </Text>
          {availableMedia.length === 0 ? (
            <Text as="p" tone="subdued" variant="bodySm">
              {linkedMedia.length > 0
                ? "All other structure media is already linked."
                : "Upload new footage above, or add files on the Media tab."}
            </Text>
          ) : (
            <div className="rov-observation-media__library">
              {availableMedia.map((item) => (
                <div key={item.id} className="rov-observation-media__library-row">
                  <MediaPreview item={item} size="thumb" />
                  <div className="rov-observation-media__library-copy">
                    <Text as="p" variant="bodySm" fontWeight="medium" truncate>
                      {item.fileName}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {item.mediaType}
                    </Text>
                  </div>
                  <Button
                    size="slim"
                    variant="primary"
                    onClick={() => onLink(item.id)}
                    loading={linking}
                  >
                    Link
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rov-observation-media__section">
        <Text as="h4" variant="headingSm">
          Attached media
        </Text>
        {linkedMedia.length === 0 ? (
          <Text as="p" tone="subdued" variant="bodySm">
            No photos or videos linked to this observation yet.
          </Text>
        ) : (
          <div
            className={
              isWide
                ? "rov-observation-media__filmstrip"
                : "rov-observation-media__linked-grid"
            }
          >
            {linkedMedia.map((item) => (
              <div
                key={item.id}
                className={
                  isWide
                    ? "rov-observation-media__filmstrip-card"
                    : "rov-observation-media__linked-card"
                }
              >
                <MediaPreview item={item} size={isWide ? "tile" : "large"} />
                <div className="rov-observation-media__linked-meta">
                  <Text as="p" variant="bodySm" fontWeight="semibold" truncate>
                    {item.fileName}
                  </Text>
                  <Badge tone="success">{item.mediaType}</Badge>
                </div>
                <Button
                  size="slim"
                  onClick={() => onUnlink(item.id)}
                  disabled={linking}
                >
                  Unlink
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
