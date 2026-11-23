"use client";

import { BlockStack, Checkbox, TextField } from "@shopify/polaris";
import { useEffect, useRef, useState } from "react";
import type { DocumentTemplateSettings } from "@frog1/shared";
import { getDocumentTemplates } from "@/lib/settings-api";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  label?: string;
  labelHidden?: boolean;
  multiline?: number;
}

/** Prefix each default with its label unless the saved text already starts with it. */
function labelled(name: string, text?: string) {
  const trimmed = text?.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase().startsWith(`${name.toLowerCase()}:`) ? trimmed : `${name}: ${trimmed}`;
}

function buildDefaults(templates: DocumentTemplateSettings) {
  return [
    labelled("Payment terms", templates.defaultPaymentTerms),
    labelled("Warranty", templates.defaultWarrantyNotes),
    labelled("Delivery", templates.defaultDeliveryTerms),
  ]
    .filter(Boolean)
    .join("\n");
}

export function DocumentNotesField({ value, onChange, disabled, placeholder = "Type notes shown on the document..." }: Props) {
  const [defaultNotes, setDefaultNotes] = useState("");
  // Only tick the box when the field starts empty (new document) or already matches the defaults.
  const [useDefaults, setUseDefaults] = useState(!value.trim());
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    void getDocumentTemplates()
      .then((result) => {
        const defaults = buildDefaults(result);
        setDefaultNotes(defaults);
        const current = valueRef.current.trim();
        if (!current) {
          if (defaults) onChange(defaults);
          setUseDefaults(Boolean(defaults));
        } else {
          setUseDefaults(current === defaults.trim());
        }
      })
      .catch(() => undefined);
    // Load once; onChange identity changes on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BlockStack gap="300">
      <Checkbox
        checked={useDefaults}
        disabled={disabled || !defaultNotes}
        helpText={defaultNotes ? undefined : "No default notes saved yet. Add them in Settings → Documents."}
        label="Use saved default notes"
        onChange={(checked) => {
          setUseDefaults(checked);
          if (checked) {
            // Replace empty text, or append the defaults below what was typed.
            const current = value.trim();
            onChange(current && current !== defaultNotes.trim() ? `${current}\n${defaultNotes}` : defaultNotes);
          } else if (value.trim() === defaultNotes.trim()) {
            onChange("");
          }
        }}
      />
      <TextField
        autoComplete="off"
        disabled={disabled}
        label="Notes"
        labelHidden
        multiline={5}
        placeholder={placeholder}
        value={value}
        onChange={(next) => {
          onChange(next);
          if (useDefaults && next.trim() !== defaultNotes.trim()) setUseDefaults(false);
        }}
      />
    </BlockStack>
  );
}
