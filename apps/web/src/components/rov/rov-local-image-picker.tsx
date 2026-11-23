"use client";

import { Badge, Button, DropZone, Icon, Text } from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { RovStructureImage } from "./rov-structure-image";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface RovLocalImagePickerProps {
  label: string;
  helpText: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  /** Image already saved on the record (edit mode). */
  currentPath?: string | null;
  /** Small tag next to the label, e.g. "Needed for pins". */
  tag?: { content: string; tone?: "info" | "attention" | "success" };
}

export function RovLocalImagePicker({
  label,
  helpText,
  file,
  onChange,
  disabled,
  currentPath,
  tag,
}: RovLocalImagePickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleDrop = useCallback(
    (_all: File[], accepted: File[], rejectedFiles: File[]) => {
      setRejected(rejectedFiles.length > 0 && accepted.length === 0);
      if (accepted[0]) onChange(accepted[0]);
    },
    [onChange],
  );

  const hasCurrent = Boolean(currentPath);
  const showing = previewUrl ? "new" : hasCurrent ? "current" : "empty";

  return (
    <div className="rov-ip">
      <div className="rov-ip__head">
        <span className="rov-ip__label">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {label}
          </Text>
          {tag ? <Badge tone={tag.tone}>{tag.content}</Badge> : null}
        </span>
        <Text as="p" tone="subdued" variant="bodySm">
          {helpText}
        </Text>
      </div>

      <div className={cn("rov-ip__zone", showing !== "empty" && "has-image")}>
        <DropZone
          accept="image/*"
          type="image"
          allowMultiple={false}
          disabled={disabled}
          label={label}
          labelHidden
          openFileDialog={dialogOpen}
          onFileDialogClose={() => setDialogOpen(false)}
          onDrop={handleDrop}
          variableHeight
        >
          {showing === "new" && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={label} className="rov-ip__img" src={previewUrl} />
          ) : showing === "current" ? (
            <RovStructureImage
              path={currentPath}
              alt={label}
              className="rov-ip__img"
              emptyClassName="rov-ip__img rov-ip__img--broken"
              emptyLabel="Saved image can't be shown — upload a new one"
            />
          ) : (
            <div className="rov-ip__empty">
              <span className="rov-ip__icon">
                <Icon source={ImageIcon} tone="subdued" />
              </span>
              <Text as="span" variant="bodySm" fontWeight="semibold">
                Add image
              </Text>
              <Text as="span" tone="subdued" variant="bodySm">
                or drop a PNG or JPG here
              </Text>
            </div>
          )}
        </DropZone>
      </div>

      {showing !== "empty" ? (
        <div className="rov-ip__meta">
          <span className="rov-ip__file">
            {showing === "new" && file ? (
              <>
                <Badge tone="info">New</Badge>
                <Text as="span" variant="bodySm" truncate>
                  {file.name}
                </Text>
                <Text as="span" tone="subdued" variant="bodySm">
                  {formatFileSize(file.size)}
                </Text>
              </>
            ) : (
              <Text as="span" tone="subdued" variant="bodySm">
                Current image
              </Text>
            )}
          </span>
          <span className="rov-ip__actions">
            <Button size="slim" disabled={disabled} onClick={() => setDialogOpen(true)}>
              Replace
            </Button>
            {showing === "new" ? (
              <Button size="slim" variant="plain" tone="critical" disabled={disabled} onClick={() => onChange(null)}>
                {hasCurrent ? "Undo" : "Remove"}
              </Button>
            ) : null}
          </span>
        </div>
      ) : null}

      {rejected ? (
        <Text as="p" tone="critical" variant="bodySm">
          That file isn&apos;t an image. Use PNG, JPG or WebP.
        </Text>
      ) : null}
    </div>
  );
}
