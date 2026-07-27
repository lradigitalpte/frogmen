"use client";

import type { ReactNode } from "react";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";
import type { PageProps } from "@shopify/polaris";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <BlockStack gap="100">
      <Text as="h1" variant="headingLg">
        {title}
      </Text>
      {subtitle ? (
        <Text as="p" tone="subdued">
          {subtitle}
        </Text>
      ) : null}
    </BlockStack>
  );
}

interface PageSectionProps {
  children: React.ReactNode;
}

export function PageSection({ children }: PageSectionProps) {
  return (
    <Layout>
      <Layout.Section>
        <Card>{children}</Card>
      </Layout.Section>
    </Layout>
  );
}

interface IndexSurfaceProps {
  children: ReactNode;
}

/** White card wrapper for IndexFilters + IndexTable list pages */
export function IndexSurface({ children }: IndexSurfaceProps) {
  return <div className="app-index-surface">{children}</div>;
}

interface AppPageProps {
  title: string;
  subtitle?: string;
  fullWidth?: boolean;
  backAction?: PageProps["backAction"];
  titleMetadata?: PageProps["titleMetadata"];
  primaryAction?: PageProps["primaryAction"];
  secondaryActions?: PageProps["secondaryActions"];
  children: ReactNode;
}

export function AppPage({
  title,
  subtitle,
  fullWidth = true,
  backAction,
  titleMetadata,
  primaryAction,
  secondaryActions,
  children,
}: AppPageProps) {
  return (
    <Page
      backAction={backAction}
      fullWidth={fullWidth}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      subtitle={subtitle}
      title={title}
      titleMetadata={titleMetadata}
    >
      {children}
    </Page>
  );
}