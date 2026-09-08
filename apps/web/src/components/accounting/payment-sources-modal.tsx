"use client";

import { BlockStack, Button, InlineStack, Modal, Text, TextField } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { createExpensePaymentSource, deleteExpensePaymentSource, updateExpensePaymentSource, type ExpensePaymentSource } from "@/lib/expenses-api";

export function PaymentSourcesModal({ open, sources, onClose, onChanged }: { open: boolean; sources: ExpensePaymentSource[]; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState<ExpensePaymentSource | null>(null);
  const [name, setName] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!open) { setEditing(null); setName(""); setLastFour(""); } }, [open]);
  async function save() {
    if (!name.trim() || (lastFour && !/^\d{4}$/.test(lastFour))) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), lastFour: lastFour || undefined };
      if (editing) await updateExpensePaymentSource(editing.id, body);
      else await createExpensePaymentSource(body);
      setEditing(null); setName(""); setLastFour(""); onChanged();
    } finally { setSaving(false); }
  }
  return <Modal open={open} onClose={onClose} title="Manage payment sources" secondaryActions={[{ content: "Done", onAction: onClose }]}>
    <Modal.Section><BlockStack gap="400">
      {sources.map((source) => <InlineStack key={source.id} align="space-between" blockAlign="center">
        <Text as="p">{source.name}{source.lastFour ? ` •••• ${source.lastFour}` : ""}</Text>
        <InlineStack gap="200"><Button size="slim" onClick={() => { setEditing(source); setName(source.name); setLastFour(source.lastFour ?? ""); }}>Edit</Button><Button size="slim" tone="critical" onClick={async () => { await deleteExpensePaymentSource(source.id); onChanged(); }}>Delete</Button></InlineStack>
      </InlineStack>)}
      <TextField autoComplete="off" label="Name" value={name} onChange={setName} />
      <TextField autoComplete="off" label="Last four digits (optional)" value={lastFour} onChange={(value) => setLastFour(value.replace(/\D/g, "").slice(0, 4))} />
      <Button variant="primary" loading={saving} disabled={!name.trim() || Boolean(lastFour && lastFour.length !== 4)} onClick={() => void save()}>{editing ? "Save changes" : "Add payment source"}</Button>
    </BlockStack></Modal.Section>
  </Modal>;
}
