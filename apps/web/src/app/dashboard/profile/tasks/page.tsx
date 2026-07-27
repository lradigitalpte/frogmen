"use client";

import { BlockStack, Card, Text } from "@shopify/polaris";
import { AppPage } from "@/components/layout/page";

export default function ProfileTasksPage() {
  return (
    <AppPage
      title="Assigned tasks"
      subtitle="Tasks assigned to you across projects, inspections, and operations."
    >
      <Card>
        <BlockStack gap="300">
          <Text as="p" tone="subdued">
            Your assigned tasks will appear here. This will include follow-ups,
            inspection actions, approvals, and other work items routed to you.
          </Text>
        </BlockStack>
      </Card>
    </AppPage>
  );
}
