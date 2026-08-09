"use client";

import type { ReactNode } from "react";
import { BlockStack, Text } from "@shopify/polaris";
import type { LucideIcon } from "lucide-react";

type PurchaseOrderSectionTone =
  | "vendor"
  | "terms"
  | "charges"
  | "margin"
  | "default";

interface PurchaseOrderSectionCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  tone?: PurchaseOrderSectionTone;
  children: ReactNode;
}

export function PurchaseOrderSectionCard({
  title,
  description,
  icon: Icon,
  tone = "default",
  children,
}: PurchaseOrderSectionCardProps) {
  const iconClass =
    tone === "default"
      ? "po-section-card__icon"
      : `po-section-card__icon po-section-card__icon--${tone}`;

  return (
    <div className="po-section-card">
      <div className="po-section-card__header">
        <div className={iconClass}>
          <Icon aria-hidden size={18} strokeWidth={1.75} />
        </div>
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {title}
          </Text>
          {description ? (
            <Text as="p" tone="subdued" variant="bodySm">
              {description}
            </Text>
          ) : null}
        </BlockStack>
      </div>
      <div className="po-section-card__body">{children}</div>
    </div>
  );
}
