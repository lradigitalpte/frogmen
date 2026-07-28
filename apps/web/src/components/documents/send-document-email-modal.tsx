"use client";

import {
  buildDocumentEmailDefaults,
  type DocumentEmailType,
} from "@/lib/document-email-templates";
import { getCompanySettings, getDocumentTemplates } from "@/lib/settings-api";
import {
  Banner,
  BlockStack,
  Modal,
  TextField,
} from "@shopify/polaris";
import { useEffect, useState } from "react";

export interface SendDocumentEmailModalProps {
  open: boolean;
  title: string;
  pdfLabel?: string;
  loading?: boolean;
  documentType: DocumentEmailType;
  recipient: string;
  placeholders: Record<string, string>;
  initialSubject?: string;
  initialBody?: string;
  primaryActionLabel?: string;
  onClose: () => void;
  onSend: (input: {
    recipientEmail: string;
    subject: string;
    body: string;
  }) => void | Promise<void>;
}

export function SendDocumentEmailModal({
  open,
  title,
  pdfLabel,
  loading = false,
  documentType,
  recipient,
  placeholders,
  initialSubject,
  initialBody,
  primaryActionLabel = "Send email",
  onClose,
  onSend,
}: SendDocumentEmailModalProps) {
  const [emailRecipient, setEmailRecipient] = useState(recipient);
  const [emailSubject, setEmailSubject] = useState(initialSubject ?? "");
  const [emailBody, setEmailBody] = useState(initialBody ?? "");
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  useEffect(() => {
    if (!open) {
      setTemplatesLoaded(false);
      return;
    }

    setEmailRecipient(recipient);

    let cancelled = false;

    void (async () => {
      try {
        const [templates, company] = await Promise.all([
          getDocumentTemplates(),
          getCompanySettings(),
        ]);
        if (cancelled) return;
        const defaults = buildDocumentEmailDefaults(
          documentType,
          templates,
          {
            ...placeholders,
            companyName: placeholders.companyName || company.name,
          },
          {
            subject: initialSubject,
            body: initialBody,
          },
        );
        setEmailSubject(defaults.subject);
        setEmailBody(defaults.body);
        setTemplatesLoaded(true);
      } catch {
        if (cancelled) return;
        setEmailSubject(initialSubject ?? "");
        setEmailBody(initialBody ?? "");
        setTemplatesLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    recipient,
    documentType,
    placeholders,
    initialSubject,
    initialBody,
  ]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      primaryAction={{
        content: primaryActionLabel,
        loading: loading || !templatesLoaded,
        disabled: !emailRecipient.trim() || !emailSubject.trim() || !emailBody.trim(),
        onAction: () =>
          void onSend({
            recipientEmail: emailRecipient.trim(),
            subject: emailSubject.trim(),
            body: emailBody.trim(),
          }),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {pdfLabel ? (
            <Banner tone="info">
              <p>Attached file: {pdfLabel}</p>
            </Banner>
          ) : null}
          <TextField
            autoComplete="email"
            label="Recipient email"
            type="email"
            value={emailRecipient}
            onChange={setEmailRecipient}
          />
          <TextField
            autoComplete="off"
            label="Email subject"
            value={emailSubject}
            onChange={setEmailSubject}
          />
          <TextField
            autoComplete="off"
            label="Email message"
            multiline={8}
            value={emailBody}
            onChange={setEmailBody}
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
