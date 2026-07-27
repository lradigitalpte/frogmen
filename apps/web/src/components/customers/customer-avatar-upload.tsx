"use client";

import {
  BlockStack,
  DropZone,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { uploadCustomerAvatar } from "@/lib/customers-api";
import { CustomerAvatar } from "./customer-avatar";

interface CustomerAvatarUploadProps {
  name: string;
  customerId?: string;
  avatarPath?: string | null;
  pendingFile?: File | null;
  disabled?: boolean;
  onPendingFileChange?: (file: File | null) => void;
  onAvatarUploaded?: (avatarPath: string) => void;
}

export function CustomerAvatarUpload({
  name,
  customerId,
  avatarPath,
  pendingFile,
  disabled,
  onPendingFileChange,
  onAvatarUploaded,
}: CustomerAvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const handleDrop = useCallback(
    async (_dropFiles: File[], acceptedFiles: File[]) => {
      const file = acceptedFiles[0];

      if (!file || disabled || uploading) {
        return;
      }

      setError(null);

      if (customerId) {
        setUploading(true);

        try {
          const customer = await uploadCustomerAvatar(customerId, file);
          onAvatarUploaded?.(customer.avatarPath ?? "");
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to upload photo",
          );
        } finally {
          setUploading(false);
        }

        return;
      }

      onPendingFileChange?.(file);
    },
    [
      customerId,
      disabled,
      onAvatarUploaded,
      onPendingFileChange,
      uploading,
    ],
  );

  return (
    <BlockStack gap="400" inlineAlign="center">
      <CustomerAvatar
        avatarPath={avatarPath}
        name={name || "Contact"}
        previewUrl={previewUrl}
        size="xl"
      />

      <div style={{ width: "100%" }}>
        <DropZone
          accept="image/*"
          disabled={disabled || uploading}
          type="image"
          onDrop={handleDrop}
        >
          {uploading ? (
            <InlineStack align="center" blockAlign="center" gap="200">
              <Spinner size="small" />
              <Text as="span" tone="subdued">
                Uploading photo...
              </Text>
            </InlineStack>
          ) : (
            <DropZone.FileUpload
              actionHint="Accepts .jpg, .png, .webp up to 5 MB"
              actionTitle="Add photo"
            />
          )}
        </DropZone>
      </div>

      {!customerId ? (
        <Text as="p" alignment="center" tone="subdued" variant="bodySm">
          Photo uploads after you save the contact.
        </Text>
      ) : null}

      {error ? (
        <Text as="p" alignment="center" tone="critical" variant="bodySm">
          {error}
        </Text>
      ) : null}
    </BlockStack>
  );
}
