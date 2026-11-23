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
import { cn } from "@/lib/utils";
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
  index,
  onEdit,
  onDelete,
  onAnnotate,
}: {
  structure: ProjectStructure;
  index: number;
  onEdit: (structure: ProjectStructure) => void;
  onDelete: (structure: ProjectStructure) => void;
  onAnnotate: (structure: ProjectStructure) => void;
}) {
  const hasDiagram = Boolean(structure.diagramPath);
  const findings = structure.findingCount ?? 0;
  const majors = structure.majorCount ?? 0;
  const moderates = structure.moderateCount ?? 0;
  const minors = structure.minorCount ?? 0;
  const media = structure.mediaCount ?? 0;

  return (
    <article className="rov-sc">
      <button type="button" className="rov-sc__photo" onClick={() => onEdit(structure)} aria-label={`Edit ${structure.name} photo`}>
        <RovStructureImage
          path={structure.photoPath}
          alt={structure.name}
          className="rov-sc__img"
          emptyClassName="rov-sc__img rov-sc__img--empty"
          emptyLabel="Add a surface photo"
        />
        <span className="rov-sc__index">#{index + 1}</span>
      </button>

      <div className="rov-sc__body">
        <div className="rov-sc__head">
          <div>
            <h3>{structure.name}</h3>
            <p>{structure.description || "No description"}</p>
          </div>
          {majors > 0 ? <Badge tone="critical">{`${majors} major`}</Badge> : null}
        </div>

        <div className="rov-sc__stats">
          <span>
            <strong>{findings}</strong> finding{findings === 1 ? "" : "s"}
          </span>
          <span>
            <strong>{media}</strong> media
          </span>
          {findings > 0 ? (
            <span className="rov-sc__sev" aria-label={`${majors} major, ${moderates} moderate, ${minors} minor`}>
              <i className="rov-ov__dot is-major" />
              {majors}
              <i className="rov-ov__dot is-moderate" />
              {moderates}
              <i className="rov-ov__dot is-minor" />
              {minors}
            </span>
          ) : null}
        </div>

        <button type="button" className={cn("rov-sc__diagram", !hasDiagram && "is-missing")} onClick={() => (hasDiagram ? onAnnotate(structure) : onEdit(structure))}>
          <RovStructureImage
            path={structure.diagramPath}
            alt={`${structure.name} diagram`}
            className="rov-sc__diagram-img"
            emptyClassName="rov-sc__diagram-img rov-sc__diagram-img--empty"
            emptyLabel={hasDiagram ? "Preview unavailable" : "No diagram"}
          />
          <span>
            <strong>{hasDiagram ? "Engineering diagram" : "Diagram needed"}</strong>
            <small>
              {hasDiagram
                ? findings > 0
                  ? `${findings} pin${findings === 1 ? "" : "s"} placed · open to add more`
                  : "Ready. Open it to place inspection pins"
                : "Upload a diagram to start annotating"}
            </small>
          </span>
        </button>
      </div>

      <footer className="rov-sc__actions">
        {hasDiagram ? (
          <Button variant="primary" onClick={() => onAnnotate(structure)}>
            Annotate
          </Button>
        ) : (
          <Button variant="primary" onClick={() => onEdit(structure)}>
            Upload diagram
          </Button>
        )}
        <Button onClick={() => onEdit(structure)}>Edit</Button>
        <Button variant="plain" onClick={() => onDelete(structure)}>
          Delete
        </Button>
      </footer>
    </article>
  );
}

export function ManageStructuresTab({ project, onUpdated }: ManageStructuresTabProps) {
  const router = useRouter();
  const structures = project.structures ?? [];
  const missingDiagrams = structures.filter((item) => !item.diagramPath).length;
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
                {structures.length === 0
                  ? "Add the piles, dolphins or sections you're inspecting."
                  : `${structures.length} structure${structures.length === 1 ? "" : "s"}${
                      missingDiagrams > 0 ? ` · ${missingDiagrams} still need${missingDiagrams === 1 ? "s" : ""} a diagram` : " · all ready to annotate"
                    }`}
              </Text>
            </BlockStack>
            <Button variant="primary" onClick={() => setAddOpen(true)}>Add structure</Button>
          </InlineStack>
          {structures.length === 0 ? (
            <EmptyState heading="No structures yet" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png" action={{ content: "Add structure", onAction: () => setAddOpen(true) }}>
              <p>Add piles, dolphins, or sections. Upload a diagram on each structure, then annotate findings.</p>
            </EmptyState>
          ) : (
            <div className="rov-sc-grid">
              {structures.map((structure, index) => (
                <StructureCard key={structure.id} index={index} structure={structure} onEdit={setEditStructure} onDelete={setDeleteStructureTarget} onAnnotate={(item) => router.push(`/dashboard/rov/projects/${project.id}/structures/${item.id}/annotate`)} />
              ))}
            </div>
          )}
        </BlockStack>
      </Card>
      <CreateStructureModal open={addOpen} projectId={project.id} structures={structures} onClose={() => setAddOpen(false)} onCreated={onUpdated} />
      <EditStructureModal open={Boolean(editStructure)} projectId={project.id} structure={editStructure} structures={structures} onClose={() => setEditStructure(null)} onSaved={onUpdated} />
      <Modal open={Boolean(deleteStructureTarget)} onClose={() => setDeleteStructureTarget(null)} title="Delete structure?" primaryAction={{ content: "Delete structure", destructive: true, loading: deleting, onAction: () => void handleDelete() }} secondaryActions={[{ content: "Cancel", onAction: () => setDeleteStructureTarget(null) }]}>
        <Modal.Section>
          <Text as="p">This will permanently delete <strong>{deleteStructureTarget?.name}</strong> and all related observations, views, and media for this structure.</Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
