"use client";

import { FormLayout } from "@shopify/polaris";
import { FileText } from "lucide-react";
import { DocumentNotesField } from "@/components/documents/document-notes-field";
import { PurchaseOrderSectionCard } from "@/components/purchasing/purchase-order-section-card";

interface PurchaseOrderVendorTermsFormProps {
  notes: string;
  disabled?: boolean;
  onChange: (notes: string) => void;
}

export function PurchaseOrderVendorTermsForm({
  notes,
  disabled,
  onChange,
}: PurchaseOrderVendorTermsFormProps) {
  return (
    <PurchaseOrderSectionCard
      description="Payment terms, warranty, and delivery notes printed on the PO PDF for your vendor. Default text comes from Settings → Documents."
      icon={FileText}
      title="Vendor terms (on PO PDF)"
      tone="terms"
    >
      <FormLayout>
        <DocumentNotesField
          autoComplete="off"
          disabled={disabled}
          label="Vendor terms"
          labelHidden
          multiline={5}
          onChange={onChange}
          placeholder="Payment terms, warranty, delivery timeline…"
          value={notes}
        />
      </FormLayout>
    </PurchaseOrderSectionCard>
  );
}
