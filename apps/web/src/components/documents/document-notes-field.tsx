"use client";

import { BlockStack, Checkbox, TextField } from "@shopify/polaris";
import { useEffect, useState } from "react";
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

export function DocumentNotesField({ value, onChange, disabled, placeholder = "Type notes shown on the document..." }: Props) {
  const [templates, setTemplates] = useState<DocumentTemplateSettings>({});
  const [useDefaults, setUseDefaults] = useState(true);

  useEffect(() => {
    void getDocumentTemplates().then((result) => {
      setTemplates(result);
      if (!value.trim()) {
        const label = (name: string, text?: string) =>
          text
            ? new RegExp(`^${name}\\s*:`, "i").test(text.trim())
              ? text.trim()
              : `${name}: ${text.trim()}`
            : "";
        const defaults = [
          label("Payment terms", result.defaultPaymentTerms),
          label("Warranty", result.defaultWarrantyNotes),
          label("Delivery", result.defaultDeliveryTerms),
        ].filter(Boolean).join("\n");
        if (defaults) onChange(defaults);
      }
    }).catch(() => undefined);
  }, []);

  const defaultNotes = [
    templates.defaultPaymentTerms,
    templates.defaultWarrantyNotes,
    templates.defaultDeliveryTerms,
  ].filter(Boolean).join("\n");

  return (
    <BlockStack gap="300">
      <Checkbox
        checked={useDefaults}
        disabled={disabled}
        label="Use saved default notes"
        onChange={(checked) => {
          setUseDefaults(checked);
          if (checked && !value.trim()) onChange(defaultNotes);
          if (!checked && value.trim() === defaultNotes.trim()) onChange("");
        }}
      />
      <TextField autoComplete="off" disabled={disabled} label="Notes" labelHidden multiline={5} value={value} placeholder={placeholder} onChange={onChange} />
    </BlockStack>
  );
}
