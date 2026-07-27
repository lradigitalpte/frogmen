"use client";

import { Avatar } from "@shopify/polaris";
import {
  getCustomerAvatarUrl,
  getCustomerInitials,
} from "@/lib/avatar";

interface CustomerAvatarProps {
  name: string;
  avatarPath?: string | null;
  previewUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}

export function CustomerAvatar({
  name,
  avatarPath,
  previewUrl,
  size = "md",
}: CustomerAvatarProps) {
  const source =
    previewUrl?.trim() || getCustomerAvatarUrl(avatarPath) || undefined;

  return (
    <Avatar
      customer
      accessibilityLabel={name}
      initials={getCustomerInitials(name)}
      name={name}
      size={size}
      {...(source ? { source } : {})}
    />
  );
}
