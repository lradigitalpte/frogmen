"use client";

import type { ReactNode } from "react";
import { BlockStack, Card, Text } from "@shopify/polaris";

interface QuotationFormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function QuotationFormSection({
  title,
  description,
  children,
}: QuotationFormSectionProps) {
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {title}
          </Text>
          {description ? (
            <Text as="p" tone="subdued">
              {description}
            </Text>
          ) : null}
        </BlockStack>
        {children}
      </BlockStack>
    </Card>
  );
}
