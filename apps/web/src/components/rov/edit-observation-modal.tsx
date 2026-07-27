"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import {
  ObservationPointForm,
  draftsEqual,
  type ObservationPointDraft,
} from "./observation-point-form";
import { severityLabel } from "@frog1/shared";
import { severityBadgeTone } from "@/lib/rov-severity-ui";
import type { InspectionPoint } from "@/types/rov";

interface EditObservationModalProps {
  open: boolean;
  point: InspectionPoint | null;
  draft: ObservationPointDraft | null;
  savedDraft: ObservationPointDraft | null;
  saving: boolean;
  error: string | null;
  onDraftChange: (draft: ObservationPointDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  onDelete?: () => void;
}

export function EditObservationModal({
  open,
  point,
  draft,
  savedDraft,
  saving,
  error,
  onDraftChange,
  onClose,
  onSave,
  onReset,
  onDelete,
}: EditObservationModalProps) {
  const dirty =
    draft !== null && savedDraft !== null && !draftsEqual(draft, savedDraft);

  const observationLabel = point?.observationId ?? point?.label ?? "Observation";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit observation ${observationLabel}`}
      size="large"
      primaryAction={{
        content: "Save changes",
        onAction: onSave,
        loading: saving,
        disabled: !dirty || saving,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
          disabled: saving,
        },
        ...(dirty
          ? [
              {
                content: "Reset",
                onAction: onReset,
                disabled: saving,
              },
            ]
          : []),
      ]}
    >
      <Modal.Section>
        {point && draft && savedDraft ? (
          <BlockStack gap="500">
            {error ? <Banner tone="critical">{error}</Banner> : null}

            <Box
              background="bg-surface-secondary"
              borderRadius="200"
              padding="300"
            >
              <InlineStack gap="200" wrap blockAlign="center">
                <Badge tone="info">{observationLabel}</Badge>
                {point.structureName ? (
                  <Badge>{point.structureName}</Badge>
                ) : null}
                {point.viewName ? (
                  <Text as="span" tone="subdued" variant="bodySm">
                    {point.viewName}
                    {point.viewType ? ` · ${point.viewType.toUpperCase()}` : ""}
                  </Text>
                ) : null}
                <Badge tone={severityBadgeTone(draft.severity || point.severity)}>
                  {severityLabel(draft.severity || point.severity)}
                </Badge>
              </InlineStack>
            </Box>

            <ObservationPointForm
              variant="modal"
              observationId={point.observationId}
              draft={draft}
              dirty={dirty}
              saving={saving}
              onDraftChange={onDraftChange}
              onSave={onSave}
              onCancel={onReset}
              showHeader={false}
              showActions={false}
              showDelete={Boolean(onDelete)}
              onDelete={onDelete}
            />
          </BlockStack>
        ) : null}
      </Modal.Section>
    </Modal>
  );
}
