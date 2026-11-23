"use client";

import { BlockStack, Modal, Text } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { deleteLead } from "@/lib/leads-api";
import type { Lead } from "@/types/lead";

interface DeleteLeadModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadDeleted: (id: string) => void;
}

export function DeleteLeadModal({ lead, open, onOpenChange, onLeadDeleted }: DeleteLeadModalProps) {
  const { formatBaseMoney } = useOrgCurrency();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  if (!lead) return null;

  async function handleDelete() {
    if (!lead) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteLead(lead.id);
      onLeadDeleted(lead.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the lead");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !deleting && onOpenChange(false)}
      title={`Delete ${lead.name}?`}
      primaryAction={{
        content: "Delete lead",
        destructive: true,
        loading: deleting,
        onAction: () => void handleDelete(),
      }}
      secondaryActions={[{ content: "Cancel", disabled: deleting, onAction: () => onOpenChange(false) }]}
    >
      <Modal.Section>
        <BlockStack gap="200">
          <Text as="p">
            {lead.name} from {lead.company} will be removed from your pipeline, together with the{" "}
            {formatBaseMoney(lead.estimatedValue)} estimated deal value and their contact history.
          </Text>
          {error ? (
            <Text as="p" tone="critical">
              {error}
            </Text>
          ) : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
