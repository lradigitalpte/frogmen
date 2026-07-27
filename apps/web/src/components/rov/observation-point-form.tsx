"use client";

import {
  BlockStack,
  Button,
  ButtonGroup,
  Divider,
  FormLayout,
  Text,
  TextField,
} from "@shopify/polaris";
import { AppSelect } from "@/components/ui/app-select";
import type { InspectionPoint, InspectionSeverity } from "@/types/rov";

const SEVERITY_OPTIONS = [
  { value: "", label: "Not set", description: "No severity assigned" },
  { value: "major", label: "Major", description: "Requires immediate action" },
  { value: "moderate", label: "Moderate", description: "Monitor and plan repair" },
  { value: "minor", label: "Minor", description: "Low priority finding" },
] as const;

export interface ObservationPointDraft {
  severity: string;
  findingType: string;
  diveLocation: string;
  depthM: string;
  dimensionMm: string;
  description: string;
  recommendations: string;
}

export function pointToDraft(point: InspectionPoint): ObservationPointDraft {
  return {
    severity: point.severity ?? "",
    findingType: point.findingType ?? "",
    diveLocation: point.diveLocation ?? "",
    depthM: point.depthM ?? "",
    dimensionMm: point.dimensionMm ?? "",
    description: point.description ?? "",
    recommendations: point.recommendations ?? "",
  };
}

export function draftToUpdateInput(draft: ObservationPointDraft) {
  return {
    severity: (draft.severity || null) as InspectionSeverity | null,
    findingType: draft.findingType || null,
    diveLocation: draft.diveLocation || null,
    depthM: draft.depthM || null,
    dimensionMm: draft.dimensionMm || null,
    description: draft.description || null,
    recommendations: draft.recommendations || null,
  };
}

export function draftsEqual(
  a: ObservationPointDraft,
  b: ObservationPointDraft,
): boolean {
  return (
    a.severity === b.severity &&
    a.findingType === b.findingType &&
    a.diveLocation === b.diveLocation &&
    a.depthM === b.depthM &&
    a.dimensionMm === b.dimensionMm &&
    a.description === b.description &&
    a.recommendations === b.recommendations
  );
}

interface ObservationPointFormProps {
  observationId: string | null;
  draft: ObservationPointDraft;
  dirty: boolean;
  saving?: boolean;
  variant?: "page" | "modal";
  showHeader?: boolean;
  onDraftChange: (draft: ObservationPointDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
  showActions?: boolean;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text as="p" variant="headingSm">
      {children}
    </Text>
  );
}

export function ObservationPointForm({
  observationId,
  draft,
  dirty,
  saving,
  variant = "page",
  showHeader = true,
  onDraftChange,
  onSave,
  onCancel,
  onDelete,
  showDelete = true,
  showActions = true,
}: ObservationPointFormProps) {
  const isModal = variant === "modal";

  const patch = (partial: Partial<ObservationPointDraft>) => {
    onDraftChange({ ...draft, ...partial });
  };

  return (
    <BlockStack gap={isModal ? "500" : "400"}>
      {showHeader ? (
        <BlockStack gap="100">
          <Text as="h3" variant="headingMd">
            Edit inspection point
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Fill in the finding details, then save when you are done.
          </Text>
        </BlockStack>
      ) : null}

      <BlockStack gap="300">
        <SectionLabel>Finding</SectionLabel>
        <FormLayout>
          {!isModal ? (
            <TextField
              label="Observation ID"
              value={observationId ?? " "}
              readOnly
              autoComplete="off"
            />
          ) : null}
          <FormLayout.Group>
            <AppSelect
              label="Severity"
              options={[...SEVERITY_OPTIONS]}
              value={draft.severity}
              onChange={(value) => patch({ severity: value })}
            />
            <TextField
              label="Finding type"
              value={draft.findingType}
              onChange={(value) => patch({ findingType: value })}
              placeholder="Corrosion, marine growth…"
              autoComplete="off"
            />
          </FormLayout.Group>
          <TextField
            label="Dive location"
            value={draft.diveLocation}
            onChange={(value) => patch({ diveLocation: value })}
            placeholder="Station #684, Pile 1A…"
            autoComplete="off"
          />
          <FormLayout.Group>
            <TextField
              label="Depth (m)"
              value={draft.depthM}
              onChange={(value) => patch({ depthM: value })}
              type="number"
              autoComplete="off"
            />
            <TextField
              label="Dimension (mm)"
              value={draft.dimensionMm}
              onChange={(value) => patch({ dimensionMm: value })}
              placeholder="67.00 x 28.18"
              autoComplete="off"
            />
          </FormLayout.Group>
        </FormLayout>
      </BlockStack>

      {isModal ? <Divider /> : null}

      <BlockStack gap="300">
        <SectionLabel>Details</SectionLabel>
        <FormLayout>
          <TextField
            label="Description"
            value={draft.description}
            onChange={(value) => patch({ description: value })}
            multiline={isModal ? 5 : 4}
            autoComplete="off"
            helpText="Describe what was observed on the structure."
          />
          <TextField
            label="Recommendations"
            value={draft.recommendations}
            onChange={(value) => patch({ recommendations: value })}
            multiline={isModal ? 4 : 3}
            autoComplete="off"
            helpText="Suggested repair, monitoring, or follow-up action."
          />
        </FormLayout>
      </BlockStack>

      {showActions ? (
        <ButtonGroup>
          <Button variant="primary" loading={saving} disabled={!dirty || saving} onClick={onSave}>
            Save changes
          </Button>
          <Button disabled={saving || !dirty} onClick={onCancel}>
            Cancel
          </Button>
        </ButtonGroup>
      ) : null}

      {showDelete && onDelete ? (
        <Button tone="critical" disabled={saving} onClick={onDelete}>
          Delete observation
        </Button>
      ) : null}
    </BlockStack>
  );
}
