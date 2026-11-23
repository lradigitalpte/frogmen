"use client";

import { Banner, Form, Modal } from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import {
  updateStructure,
  uploadStructureDiagram,
  uploadStructurePhoto,
} from "@/lib/rov-api";
import type { ProjectStructure } from "@/types/rov";
import {
  StructureFormFields,
  StructureSavingNote,
  validateStructureForm,
  type StructureFormErrors,
  type StructureFormValues,
} from "./structure-form-fields";

interface EditStructureModalProps {
  open: boolean;
  projectId: string;
  structure: ProjectStructure | null;
  structures?: ProjectStructure[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditStructureModal({
  open,
  projectId,
  structure,
  structures = [],
  onClose,
  onSaved,
}: EditStructureModalProps) {
  const [values, setValues] = useState<StructureFormValues>({
    name: "",
    sort: "0",
    description: "",
    photoFile: null,
    diagramFile: null,
  });
  const [errors, setErrors] = useState<StructureFormErrors>({});
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = stage !== null;

  useEffect(() => {
    if (!structure) return;
    setValues({
      name: structure.name,
      sort: String(structure.sort ?? 0),
      description: structure.description ?? "",
      photoFile: null,
      diagramFile: null,
    });
    setErrors({});
    setError(null);
  }, [structure]);

  const set = useCallback(<K extends keyof StructureFormValues>(key: K, value: StructureFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (key === "name" || key === "sort") setErrors((e) => ({ ...e, [key]: undefined }));
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;
    setError(null);
    onClose();
  }, [onClose, saving]);

  const handleSave = useCallback(async () => {
    if (!structure || saving) return;
    const found = validateStructureForm(values, structures, structure.id);
    setErrors(found);
    if (found.name || found.sort) return;

    setError(null);
    try {
      setStage("Saving details…");
      await updateStructure(projectId, structure.id, {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        sort: Number.parseInt(values.sort, 10),
      });
      if (values.photoFile) {
        setStage("Uploading surface photo…");
        await uploadStructurePhoto(projectId, structure.id, values.photoFile);
      }
      if (values.diagramFile) {
        setStage("Uploading diagram…");
        await uploadStructureDiagram(projectId, structure.id, values.diagramFile);
      }
      onSaved();
      setStage(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the structure");
    } finally {
      setStage(null);
    }
  }, [onClose, onSaved, projectId, saving, structure, structures, values]);

  if (!structure) return null;

  const notice = (
    <>
      {error ? (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}
      {values.diagramFile && structure.diagramPath ? (
        <Banner tone="warning">
          Existing finding pins stay at the same positions. Replace the diagram only with a drawing of the same layout.
        </Banner>
      ) : null}
      <StructureSavingNote stage={stage} />
    </>
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Edit ${structure.name}`}
      size="large"
      primaryAction={{
        content: "Save changes",
        loading: saving,
        onAction: () => void handleSave(),
      }}
      secondaryActions={[{ content: "Cancel", disabled: saving, onAction: handleClose }]}
    >
      <Modal.Section>
        <Form onSubmit={() => void handleSave()} implicitSubmit>
          <StructureFormFields
            values={values}
            errors={errors}
            disabled={saving}
            current={{ photoPath: structure.photoPath, diagramPath: structure.diagramPath }}
            onChange={set}
            notice={notice}
          />
        </Form>
      </Modal.Section>
    </Modal>
  );
}
