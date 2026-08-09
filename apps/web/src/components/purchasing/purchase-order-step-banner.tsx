"use client";

import { Text } from "@shopify/polaris";
import type { LucideIcon } from "lucide-react";

interface PurchaseOrderStepBannerProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function PurchaseOrderStepBanner({
  icon: Icon,
  title,
  description,
}: PurchaseOrderStepBannerProps) {
  return (
    <div className="po-step-banner">
      <div className="po-step-banner__icon">
        <Icon aria-hidden size={20} strokeWidth={1.75} />
      </div>
      <div>
        <Text as="p" fontWeight="semibold" variant="bodyMd">
          {title}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {description}
        </Text>
      </div>
    </div>
  );
}
