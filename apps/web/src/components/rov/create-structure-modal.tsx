"use client";

import { Banner, Form, Modal } from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createStructure,
  uploadStructureDiagram,
  uploadStructurePhoto,
} from "@/lib/rov-api";
import type { ProjectStructure } from "@/types/rov";
import {
  nextStructureSort,
  StructureFormFields,
  StructureSavingNote,
  suggestNextStructureName,
  validateStructureForm,
  type StructureFormErrors,
  type StructureFormValues,
} from "./structure-form-fields";

interface CreateStructureModalProps {
  open: boolean;
  projectId: string;
  structures?: ProjectStructure[];
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY: StructureFormValues = { name: "", sort: "0", description: "", photoFile: null, diagramFile: null };

export function CreateStructureModal({
  open,
  projectId,
  structures = [],
  onClose,
  onCreated,
}: CreateStructureModalProps) {
  const nextSort = nextStructureSort(structures);
  const suggestion = useMemo(() => suggestNextStructureName(structures), [structures]);

  const [values, setValues] = useState<StructureFormValues>({ ...EMPTY, sort: String(nextSort) });
  const [sortTouched, setSortTouched] = useState(false);
  const [errors, setErrors] = useState<StructureFormErrors>({});
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const saving = stage !== null;

  // Keep the default order in step with the list (it refreshes after each create).
  useEffect(() => {
    if (!sortTouched) setValues((v) => ({ ...v, sort: String(nextSort) }));
  }, [nextSort, sortTouched]);

  const set = useCallback(<K extends keyof StructureFormValues>(key: K, value: StructureFormValues[K]) => {
    if (key === "sort") setSortTouched(true);
    setValues((v) => ({ ...v, [key]: value }));
    if (key === "name" || key === "sort") setErrors((e) => ({ ...e, [key]: undefined }));
  }, []);

  const reset = useCallback(() => {
    setValues({ ...EMPTY, sort: String(nextSort) });
    setSortTouched(false);
    setErrors({});
    setError(null);
  }, [nextSort]);

  const handleClose = useCallback(() => {
    if (saving) return;
    reset();
    setAdded([]);
    onClose();
  }, [onClose, reset, saving]);

  const submit = useCallback(
    async (createAnother: boolean) => {
      if (saving) return;
      const found = validateStructureForm(values, structures);
      setErrors(found);
      if (found.name || found.sort) return;

      const name = values.name.trim();
      setError(null);
      try {
        setStage(`Creating ${name}…`);
        const structure = await createStructure(projectId, {
          name,
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
        onCreated();
        if (createAnother) {
          setAdded((list) => [...list, name]);
          setValues({ ...EMPTY, sort: String(Number.parseInt(values.sort, 10) + 1) });
          setSortTouched(false);
          setErrors({});
        } else {
          setStage(null);
          reset();
          setAdded([]);
          onClose();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create the structure");
      } finally {
        setStage(null);
      }
    },
    [onClose, onCreated, projectId, reset, saving, structures, values],
  );

  const notice = (
    <>
      {error ? (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}
      {added.length > 0 && !error ? (
        <Banner tone="success" onDismiss={() => setAdded([])}>
          {added.length === 1
            ? `${added[0]} added. Fill in the next one, or close when you're done.`
            : `${added.length} structures added (${added.join(", ")}). Fill in the next one, or close when you're done.`}
        </Banner>
      ) : null}
      <StructureSavingNote stage={stage} />
    </>
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add structure"
      size="large"
      primaryAction={{
        content: "Add structure",
        loading: saving,
        onAction: () => void submit(false),
      }}
      secondaryActions={[
        { content: "Add & start another", disabled: saving, onAction: () => void submit(true) },
        { content: added.length > 0 ? "Done" : "Cancel", disabled: saving, onAction: handleClose },
      ]}
    >
      <Modal.Section>
        <Form onSubmit={() => void submit(false)} implicitSubmit>
          <StructureFormFields
            values={values}
            errors={errors}
            disabled={saving}
            suggestion={suggestion}
            onChange={set}
            notice={notice}
          />
        </Form>
      </Modal.Section>
    </Modal>
  );
}
