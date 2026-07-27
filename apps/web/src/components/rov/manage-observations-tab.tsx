"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { deletePoint, listAllPoints, updatePoint } from "@/lib/rov-api";
import {
  draftToUpdateInput,
  draftsEqual,
  pointToDraft,
  type ObservationPointDraft,
} from "./observation-point-form";
import { EditObservationModal } from "./edit-observation-modal";
import { severityLabel } from "@frog1/shared";
import { severityBadgeTone } from "@/lib/rov-severity-ui";
import type { InspectionPoint } from "@/types/rov";

interface ManageObservationsTabProps {
  projectId: string;
}

export function ManageObservationsTab({ projectId }: ManageObservationsTabProps) {
  const [points, setPoints] = useState<InspectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPoint, setEditingPoint] = useState<InspectionPoint | null>(null);
  const [draft, setDraft] = useState<ObservationPointDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<ObservationPointDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionPoint | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAllPoints(projectId);
      setPoints(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load observations");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (point: InspectionPoint) => {
    const nextDraft = pointToDraft(point);
    setModalError(null);
    setEditingPoint(point);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
  };

  const closeEdit = () => {
    const dirty =
      draft !== null && savedDraft !== null && !draftsEqual(draft, savedDraft);
    if (dirty && !confirm("You have unsaved changes. Close without saving?")) {
      return;
    }
    setEditingPoint(null);
    setDraft(null);
    setSavedDraft(null);
    setModalError(null);
  };

  const handleSave = async () => {
    if (!editingPoint || !draft) return;
    const structureId = editingPoint.structureId;
    const viewId = editingPoint.inspectionViewId;
    if (!structureId || !viewId) {
      setModalError("This observation is missing structure or view details.");
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      await updatePoint(
        projectId,
        structureId,
        viewId,
        editingPoint.id,
        draftToUpdateInput(draft),
      );
      await load();
      setEditingPoint(null);
      setDraft(null);
      setSavedDraft(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to save observation");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const structureId = deleteTarget.structureId;
    const viewId = deleteTarget.inspectionViewId;
    if (!structureId || !viewId) {
      setError("This observation is missing structure or view details.");
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await deletePoint(projectId, structureId, viewId, deleteTarget.id);
      if (editingPoint?.id === deleteTarget.id) {
        setEditingPoint(null);
        setDraft(null);
        setSavedDraft(null);
        setModalError(null);
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete observation");
    } finally {
      setDeleting(false);
    }
  };

  const requestDelete = (point: InspectionPoint) => {
    setEditingPoint(null);
    setDraft(null);
    setSavedDraft(null);
    setModalError(null);
    setDeleteTarget(point);
  };

  return (
    <BlockStack gap="400">
      {error ? <Banner tone="critical">{error}</Banner> : null}

      <Card>
        {points.length === 0 && !loading ? (
          <Text as="p" tone="subdued">
            No observations yet. Upload a diagram on the Structures tab, then use
            Annotate to place pins.
          </Text>
        ) : (
          <IndexTable
            resourceName={{ singular: "observation", plural: "observations" }}
            itemCount={points.length}
            headings={[
              { title: "ID" },
              { title: "Structure" },
              { title: "View" },
              { title: "Severity" },
              { title: "Finding" },
              { title: "Description" },
              { title: "Actions" },
            ]}
            loading={loading}
            selectable={false}
          >
            {points.map((point, index) => (
              <IndexTable.Row id={point.id} key={point.id} position={index}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">
                    {point.observationId ?? point.label ?? " "}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{point.structureName ?? " "}</IndexTable.Cell>
                <IndexTable.Cell>{point.viewName ?? " "}</IndexTable.Cell>
                <IndexTable.Cell>
                  {point.severity ? (
                    <Badge tone={severityBadgeTone(point.severity)}>
                      {severityLabel(point.severity)}
                    </Badge>
                  ) : (
                    " "
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>{point.findingType ?? " "}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" truncate>
                    {point.description ?? " "}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <InlineStack gap="200">
                    <Button size="slim" onClick={() => openEdit(point)}>
                      Edit
                    </Button>
                    <Button
                      size="slim"
                      tone="critical"
                      variant="plain"
                      onClick={() => requestDelete(point)}
                    >
                      Delete
                    </Button>
                  </InlineStack>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      <EditObservationModal
        open={editingPoint !== null}
        point={editingPoint}
        draft={draft}
        savedDraft={savedDraft}
        saving={saving}
        error={modalError}
        onDraftChange={setDraft}
        onClose={closeEdit}
        onSave={() => void handleSave()}
        onReset={() => savedDraft && setDraft(savedDraft)}
        onDelete={() => editingPoint && requestDelete(editingPoint)}
      />

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete observation?"
        primaryAction={{
          content: "Delete observation",
          destructive: true,
          loading: deleting,
          onAction: () => void handleDelete(),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteTarget(null),
            disabled: deleting,
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Delete{" "}
            <Text as="span" fontWeight="semibold">
              {deleteTarget?.observationId ?? "this observation"}
            </Text>
            ? This removes the pin and unlinks any attached media. This cannot be
            undone.
          </Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
