"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { deleteStructure } from "@/lib/rov-api";
import type { ProjectStructure, RovProject } from "@/types/rov";
import { CreateStructureModal } from "./create-structure-modal";
import { EditStructureModal } from "./edit-structure-modal";
import { RovStructureImage } from "./rov-structure-image";

interface ManageStructuresTabProps {
  project: RovProject;
  onUpdated: () => void;
}

function StructureCard({
  structure,
  onEdit,
  onDelete,
  onAnnotate,
}: {
  structure: ProjectStructure;
  onEdit: (structure: ProjectStructure) => void;
  onDelete: (structure: ProjectStructure) => void;
  onAnnotate: (structure: ProjectStructure) => void;
}) {
  const hasDiagram = Boolean(structure.diagramPath);

  return (
    <div className="rov-structure-card">
      <button type="button" className="rov-structure-card__media" onClick={() => onEdit(structure)}>
        <RovStructureImage path={structure.photoPath} alt={structure.name} className="rov-structure-card__photo" emptyClassName="rov-structure-card__photo rov-structure-card__photo--empty" emptyLabel="Add photo" />
      </button>
      <div className="rov-structure-card__body">
        <InlineStack align="space-between" blockAlign="start" gap="300">
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">{structure.name}</Text>
            <Text as="p" tone="subdued" variant="bodySm">{structure.description || "No description"}</Text>
          </BlockStack>
          <Badge tone="info">{`Order ${structure.sort}`}</Badge>
        </InlineStack>
        <div className="rov-structure-card__diagram">
          <button type="button" className="rov-structure-card__diagram-preview" onClick={() => onEdit(structure)}>
            <RovStructureImage path={structure.diagramPath} alt={`${structure.name} diagram`} className="rov-structure-card__diagram-image" emptyClassName="rov-structure-card__diagram-image rov-structure-card__diagram-image--empty" emptyLabel="Add diagram" />
          </button>
          <div className="rov-structure-card__diagram-meta">
            <Text as="p" variant="bodySm" fontWeight="semibold">Annotatable diagram</Text>
            <Badge tone={hasDiagram ? "success" : "attention"}>{hasDiagram ? "Ready to annotate" : "Diagram required"}</Badge>
            <Text as="p" tone="subdued" variant="bodySm">{hasDiagram ? "Open the diagram editor to place inspection pins." : "Upload a diagram in Edit before annotating."}</Text>
          </div>
        </div>
      </div>
      <div className="rov-structure-card__actions">
        <Button variant="primary" disabled={!hasDiagram} onClick={() => onAnnotate(structure)}>Annotate</Button>
        <Button onClick={() => onEdit(structure)}>Edit</Button>
        <Button tone="critical" variant="plain" onClick={() => onDelete(structure)}>Delete</Button>
      </div>
    </div>
  );
}

export function ManageStructuresTab({ project, onUpdated }: ManageStructuresTabProps) {
  const router = useRouter();
  const structures = project.structures ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [editStructure, setEditStructure] = useState<ProjectStructure | null>(null);
  const [deleteStructureTarget, setDeleteStructureTarget] = useState<ProjectStructure | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteStructureTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteStructure(project.id, deleteStructureTarget.id);
      setDeleteStructureTarget(null);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [deleteStructureTarget, onUpdated, project.id]);

  return (
    <BlockStack gap="400">
      {error ? <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner> : null}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center" gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">Structures</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {structures.length === 1
                  ? "1 structure in this project"
                  : `${structures.length} structures in this project`}
                {" · "}
                Add piles, dolphins, or sections, then upload a diagram to annotate.
              </Text>
            </BlockStack>
            <Button variant="primary" onClick={() => setAddOpen(true)}>Add structure</Button>
          </InlineStack>
          {structures.length === 0 ? (
            <EmptyState heading="No structures yet" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png" action={{ content: "Add structure", onAction: () => setAddOpen(true) }}>
              <p>Add piles, dolphins, or sections. Upload a diagram on each structure, then annotate findings.</p>
            </EmptyState>
          ) : (
            <div className="rov-structure-list">
              {structures.map((structure) => (
                <StructureCard key={structure.id} structure={structure} onEdit={setEditStructure} onDelete={setDeleteStructureTarget} onAnnotate={(item) => router.push(`/dashboard/rov/projects/${project.id}/structures/${item.id}/annotate`)} />
              ))}
            </div>
          )}
        </BlockStack>
      </Card>
      <CreateStructureModal open={addOpen} projectId={project.id} onClose={() => setAddOpen(false)} onCreated={onUpdated} />
      <EditStructureModal open={Boolean(editStructure)} projectId={project.id} structure={editStructure} onClose={() => setEditStructure(null)} onSaved={onUpdated} />
      <Modal open={Boolean(deleteStructureTarget)} onClose={() => setDeleteStructureTarget(null)} title="Delete structure?" primaryAction={{ content: "Delete structure", destructive: true, loading: deleting, onAction: () => void handleDelete() }} secondaryActions={[{ content: "Cancel", onAction: () => setDeleteStructureTarget(null) }]}>
        <Modal.Section>
          <Text as="p">This will permanently delete <strong>{deleteStructureTarget?.name}</strong> and all related observations, views, and media for this structure.</Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
