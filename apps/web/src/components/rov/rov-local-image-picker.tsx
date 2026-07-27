"use client";

import { Button, Icon, Text } from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { useEffect, useRef, useState } from "react";

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
}

export function RovLocalImagePicker({
  label,
  helpText,
  file,
  onChange,
  disabled,
}: RovLocalImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="rov-local-image-picker">
      <div className="rov-local-image-picker__header">
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {label}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {helpText}
        </Text>
      </div>

      {previewUrl ? (
        <div className="rov-local-image-picker__preview">
          <img src={previewUrl} alt={label} />
          <div className="rov-local-image-picker__file-meta">
            <Text as="span" variant="bodySm" fontWeight="medium">
              {file?.name}
            </Text>
            {file ? (
              <Text as="span" tone="subdued" variant="bodySm">
                {formatFileSize(file.size)}
              </Text>
            ) : null}
          </div>
          <div className="rov-local-image-picker__actions">
            <Button
              size="slim"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              size="slim"
              tone="critical"
              variant="plain"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="rov-local-image-picker__add"
          aria-label={`Add ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Icon source={PlusIcon} tone="subdued" />
          <Text as="span" tone="subdued" variant="bodySm">
            Add image
          </Text>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (next) onChange(next);
        }}
      />
    </div>
  );
}
