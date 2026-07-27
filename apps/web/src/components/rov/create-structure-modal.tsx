"use client";

import {
  Banner,
  BlockStack,
  Box,
  Divider,
  FormLayout,
  Modal,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import {
  createStructure,
  uploadStructureDiagram,
  uploadStructurePhoto,
} from "@/lib/rov-api";
import { RovLocalImagePicker } from "./rov-local-image-picker";

interface CreateStructureModalProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateStructureModal({
  open,
  projectId,
  onClose,
  onCreated,
}: CreateStructureModalProps) {
  const [name, setName] = useState("");
  const [sort, setSort] = useState("0");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [diagramFile, setDiagramFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setSort("0");
    setDescription("");
    setPhotoFile(null);
    setDiagramFile(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const submit = useCallback(
    async (createAnother: boolean) => {
      if (!name.trim()) {
        setError("Structure name is required");
        return;
      }

      const sortValue = Number.parseInt(sort, 10);
      if (Number.isNaN(sortValue) || sortValue < 0) {
        setError("Display order must be 0 or greater");
        return;
      }

      setSaving(true);
      setError(null);

      try {
        const structure = await createStructure(projectId, {
          name: name.trim(),
          description: description.trim() || undefined,
          sort: sortValue,
        });

        if (photoFile) {
          await uploadStructurePhoto(projectId, structure.id, photoFile);
        }
        if (diagramFile) {
          await uploadStructureDiagram(projectId, structure.id, diagramFile);
        }

        onCreated();

        if (createAnother) {
          resetForm();
          return;
        }

        handleClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create structure");
      } finally {
        setSaving(false);
      }
    },
    [
      description,
      diagramFile,
      handleClose,
      name,
      onCreated,
      photoFile,
      projectId,
      resetForm,
      sort,
    ],
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create project structure"
      size="large"
      primaryAction={{
        content: "Create",
        loading: saving,
        onAction: () => void submit(false),
      }}
      secondaryActions={[
        {
          content: "Create & create another",
          loading: saving,
          onAction: () => void submit(true),
        },
        {
          content: "Cancel",
          onAction: handleClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="500">
          {error ? (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}

          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Structure details
            </Text>
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  label="Structure name"
                  value={name}
                  onChange={setName}
                  autoComplete="off"
                  placeholder="e.g. PILE_1, Dolphin_West, Mooring_Pile_2"
                  requiredIndicator
                />
                <TextField
                  label="Display order"
                  type="number"
                  value={sort}
                  onChange={setSort}
                  autoComplete="off"
                  helpText="Lower number = displayed first."
                  min={0}
                />
              </FormLayout.Group>

              <TextField
                label="Description"
                value={description}
                onChange={setDescription}
                multiline={3}
                autoComplete="off"
                placeholder="Optional notes about this pile, pontoon, or section"
              />
            </FormLayout>
          </BlockStack>

          <Divider />

          <BlockStack gap="300">
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">
                Images
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Optional   you can also add or replace these after creating the
                structure.
              </Text>
            </BlockStack>

            <Box
              background="bg-surface-secondary"
              borderColor="border"
              borderWidth="025"
              borderRadius="300"
              padding="400"
            >
              <div className="rov-structure-modal__upload-grid">
                <RovLocalImagePicker
                  label="Surface photo"
                  helpText="Above-water photo shown in the inspection gallery."
                  file={photoFile}
                  onChange={setPhotoFile}
                  disabled={saving}
                />
                <RovLocalImagePicker
                  label="Annotatable diagram"
                  helpText="Engineering drawing where inspection pins are plotted."
                  file={diagramFile}
                  onChange={setDiagramFile}
                  disabled={saving}
                />
              </div>
            </Box>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
