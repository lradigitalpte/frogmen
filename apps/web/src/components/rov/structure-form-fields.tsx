"use client";

import { Badge, Button, Text, TextField } from "@shopify/polaris";
import type { ReactNode } from "react";
import type { ProjectStructure } from "@/types/rov";
import { RovLocalImagePicker } from "./rov-local-image-picker";

export interface StructureFormValues {
  name: string;
  sort: string;
  description: string;
  photoFile: File | null;
  diagramFile: File | null;
}

export interface StructureFormErrors {
  name?: string;
  sort?: string;
}

/** Next name in a numbered series, e.g. PILE_2 → PILE_3, P-09 → P-10. */
export function suggestNextStructureName(structures: ProjectStructure[]): string | null {
  if (structures.length === 0) return null;
  const last = [...structures].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)).at(-1);
  const match = last?.name.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  const taken = new Set(structures.map((s) => s.name.trim().toLowerCase()));
  let n = Number.parseInt(match[2], 10);
  for (let i = 0; i < 50; i++) {
    n += 1;
    const candidate = `${match[1]}${String(n).padStart(match[2].length, "0")}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return null;
}

export function nextStructureSort(structures: ProjectStructure[]): number {
  if (structures.length === 0) return 0;
  return Math.max(...structures.map((s) => s.sort ?? 0)) + 1;
}

export function validateStructureForm(
  values: StructureFormValues,
  siblings: ProjectStructure[],
  selfId?: string,
): StructureFormErrors {
  const errors: StructureFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = "Enter a structure name";
  else if (siblings.some((s) => s.id !== selfId && s.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = `This project already has a structure called “${name}”`;
  }
  const sort = Number.parseInt(values.sort, 10);
  if (values.sort.trim() === "" || Number.isNaN(sort) || sort < 0) errors.sort = "Use 0 or higher";
  return errors;
}

interface StructureFormFieldsProps {
  values: StructureFormValues;
  errors: StructureFormErrors;
  disabled?: boolean;
  suggestion?: string | null;
  current?: { photoPath?: string | null; diagramPath?: string | null };
  onChange: <K extends keyof StructureFormValues>(key: K, value: StructureFormValues[K]) => void;
  notice?: ReactNode;
}

export function StructureFormFields({
  values,
  errors,
  disabled,
  suggestion,
  current,
  onChange,
  notice,
}: StructureFormFieldsProps) {
  const showSuggestion = suggestion && values.name.trim() === "";

  return (
    <div className="rov-sf">
      {notice}

      <section className="rov-sf__section">
        <div className="rov-sf__row">
          <TextField
            label="Structure name"
            value={values.name}
            onChange={(v) => onChange("name", v)}
            autoComplete="off"
            autoFocus
            disabled={disabled}
            error={errors.name}
            placeholder={suggestion ?? "e.g. PILE_1, Dolphin_West"}
            requiredIndicator
            helpText={
              showSuggestion ? (
                <span className="rov-sf__suggest">
                  Next in sequence:{" "}
                  <Button variant="plain" onClick={() => onChange("name", suggestion)}>
                    {suggestion}
                  </Button>
                </span>
              ) : (
                "Use the label from the drawing so findings are easy to trace."
              )
            }
          />
          <TextField
            label="Order"
            type="number"
            value={values.sort}
            onChange={(v) => onChange("sort", v)}
            autoComplete="off"
            disabled={disabled}
            error={errors.sort}
            helpText="Lower shows first"
            min={0}
          />
        </div>
        <TextField
          label="Description"
          value={values.description}
          onChange={(v) => onChange("description", v)}
          multiline={2}
          maxHeight={160}
          autoComplete="off"
          disabled={disabled}
          placeholder="Optional: material, depth, access notes…"
        />
      </section>

      <section className="rov-sf__section">
        <div className="rov-sf__heading">
          <Text as="h3" variant="headingSm">
            Images
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            Optional · can be added later from the structure card
          </Text>
        </div>
        <div className="rov-sf__images">
          <RovLocalImagePicker
            label="Surface photo"
            helpText="Above-water photo shown on the card and in the report."
            file={values.photoFile}
            onChange={(f) => onChange("photoFile", f)}
            currentPath={current?.photoPath}
            disabled={disabled}
          />
          <RovLocalImagePicker
            label="Diagram"
            helpText="Engineering drawing where you drop finding pins."
            file={values.diagramFile}
            onChange={(f) => onChange("diagramFile", f)}
            currentPath={current?.diagramPath}
            disabled={disabled}
            tag={{ content: "Needed for pins", tone: "info" }}
          />
        </div>
      </section>
    </div>
  );
}

export function StructureSavingNote({ stage }: { stage: string | null }) {
  if (!stage) return null;
  return (
    <p className="rov-sf__stage">
      <Badge tone="info">Saving</Badge> {stage}
    </p>
  );
}
