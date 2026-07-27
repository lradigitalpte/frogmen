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
import { useCallback, useEffect, useState } from "react";
import {
  updateStructure,
  uploadStructureDiagram,
  uploadStructurePhoto,
} from "@/lib/rov-api";
import type { ProjectStructure } from "@/types/rov";
import { RovLocalImagePicker } from "./rov-local-image-picker";
import { RovStructureImage } from "./rov-structure-image";

interface EditStructureModalProps {
  open: boolean;
  projectId: string;
  structure: ProjectStructure | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditStructureModal({
  open,
  projectId,
  structure,
  onClose,
  onSaved,
}: EditStructureModalProps) {
  const [name, setName] = useState("");
  const [sort, setSort] = useState("0");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [diagramFile, setDiagramFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!structure) return;
    setName(structure.name);
    setSort(String(structure.sort ?? 0));
    setDescription(structure.description ?? "");
    setPhotoFile(null);
    setDiagramFile(null);
    setError(null);
  }, [structure]);

  const handleClose = useCallback(() => {
    setPhotoFile(null);
    setDiagramFile(null);
    setError(null);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!structure) return;

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
      await updateStructure(projectId, structure.id, {
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

      onSaved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save structure");
    } finally {
      setSaving(false);
    }
  }, [
    description,
    diagramFile,
    handleClose,
    name,
    onSaved,
    photoFile,
    projectId,
    sort,
    structure,
  ]);

  if (!structure) return null;

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
      secondaryActions={[
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
                Replace the surface photo or annotatable diagram. Upload a new
                file if the current image is missing or broken.
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
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Current surface photo
                  </Text>
                  <RovStructureImage
                    path={structure.photoPath}
                    alt={`${structure.name} photo`}
                    className="rov-structure-modal__preview"
                  />
                  <RovLocalImagePicker
                    label="Replace surface photo"
                    helpText="Above-water photo shown in the inspection gallery."
                    file={photoFile}
                    onChange={setPhotoFile}
                    disabled={saving}
                  />
                </BlockStack>

                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Current annotatable diagram
                  </Text>
                  <RovStructureImage
                    path={structure.diagramPath}
                    alt={`${structure.name} diagram`}
                    className="rov-structure-modal__preview"
                  />
                  <RovLocalImagePicker
                    label="Replace diagram"
                    helpText="Engineering drawing used for annotation pins."
                    file={diagramFile}
                    onChange={setDiagramFile}
                    disabled={saving}
                  />
                </BlockStack>
              </div>
            </Box>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
