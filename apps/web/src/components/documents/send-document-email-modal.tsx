"use client";

import { buildDocumentEmailDefaults, type DocumentEmailType } from "@/lib/document-email-templates";
import { formatAppDate } from "@/lib/format-date";
import { getCompanySettings, getDocumentTemplates } from "@/lib/settings-api";
import { cn } from "@/lib/utils";
import { Button, Icon, Modal, SkeletonBodyText, TextField } from "@shopify/polaris";
import { AlertCircleIcon, CheckCircleIcon, FileIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useState } from "react";

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
  onSend: (input: { recipientEmail: string; subject: string; body: string }) => void | Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


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
  const [defaults, setDefaults] = useState<{ subject: string; body: string } | null>(null);
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
        const [templates, company] = await Promise.all([getDocumentTemplates(), getCompanySettings()]);
        if (cancelled) return;
        const built = buildDocumentEmailDefaults(
          documentType,
          templates,
          { ...placeholders, companyName: placeholders.companyName || company.name },
          { subject: initialSubject, body: initialBody },
        );
        setDefaults(built);
        setEmailSubject(built.subject);
        setEmailBody(built.body);
      } catch {
        if (cancelled) return;
        const fallback = { subject: initialSubject ?? "", body: initialBody ?? "" };
        setDefaults(fallback);
        setEmailSubject(fallback.subject);
        setEmailBody(fallback.body);
      } finally {
        if (!cancelled) setTemplatesLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, recipient, documentType, placeholders, initialSubject, initialBody]);

  const recipientsValid = EMAIL_RE.test(emailRecipient.trim());
  const edited = defaults !== null && (emailSubject !== defaults.subject || emailBody !== defaults.body);
  const canSend = recipientsValid && emailSubject.trim() !== "" && emailBody.trim() !== "";

  const resetToTemplate = useCallback(() => {
    if (!defaults) return;
    setEmailSubject(defaults.subject);
    setEmailBody(defaults.body);
  }, [defaults]);

  // Summary chips from whatever the caller provided.
  const facts = [
    placeholders.number ? { label: "Document", value: placeholders.number } : null,
    placeholders.total ? { label: "Total", value: placeholders.total } : null,
    placeholders.outstanding && placeholders.outstanding !== placeholders.total
      ? { label: "Outstanding", value: placeholders.outstanding }
      : null,
    placeholders.dueDate ? { label: "Due", value: formatAppDate(placeholders.dueDate) || placeholders.dueDate } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <Modal
      open={open}
      primaryAction={{
        content: primaryActionLabel,
        loading: loading || !templatesLoaded,
        disabled: !canSend,
        onAction: () =>
          void onSend({
            recipientEmail: emailRecipient.trim(),
            subject: emailSubject.trim(),
            body: emailBody.trim(),
          }),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
      title={title}
      onClose={onClose}
    >
      <Modal.Section>
        <div className="sde">
          {facts.length ? (
            <div className="sde-facts">
              {facts.map((fact) => (
                <span key={fact.label}>
                  <small>{fact.label}</small>
                  <strong>{fact.value}</strong>
                </span>
              ))}
            </div>
          ) : null}

          <div className="sde-compose">
            <div className={cn("sde-row", emailRecipient.trim() && !recipientsValid && "is-bad")}>
              <span className="sde-row__label">To</span>
              <div className="sde-row__field">
                <TextField
                  autoComplete="email"
                  label="To"
                  labelHidden
                  placeholder="customer@company.com"
                  value={emailRecipient}
                  variant="borderless"
                  onChange={setEmailRecipient}
                />
              </div>
              <span className="sde-row__state" title={recipientsValid ? "Looks good" : "Check the address"}>
                {emailRecipient.trim() ? (
                  <Icon source={recipientsValid ? CheckCircleIcon : AlertCircleIcon} tone={recipientsValid ? "success" : "critical"} />
                ) : null}
              </span>
            </div>
            <div className="sde-row">
              <span className="sde-row__label">Subject</span>
              <div className="sde-row__field">
                <TextField
                  autoComplete="off"
                  label="Subject"
                  labelHidden
                  value={emailSubject}
                  variant="borderless"
                  onChange={setEmailSubject}
                />
              </div>
            </div>

            <div className="sde-body">
              {templatesLoaded ? (
                <TextField
                  autoComplete="off"
                  label="Message"
                  labelHidden
                  multiline={9}
                  value={emailBody}
                  variant="borderless"
                  onChange={setEmailBody}
                />
              ) : (
                <div className="sde-body__loading">
                  <SkeletonBodyText lines={5} />
                </div>
              )}
            </div>

            <div className="sde-foot">
              {pdfLabel ? (
                <span className="sde-file">
                  <span className="sde-file__icon">
                    <Icon source={FileIcon} />
                  </span>
                  <span className="sde-file__text">
                    <strong>{pdfLabel}</strong>
                    <small>PDF attached automatically</small>
                  </span>
                </span>
              ) : (
                <span />
              )}
              {edited ? (
                <Button size="slim" variant="plain" onClick={resetToTemplate}>
                  Reset to template
                </Button>
              ) : null}
            </div>
          </div>

          {emailRecipient.trim() && !recipientsValid ? (
            <p className="sde-hint is-bad">That doesn't look like a valid email address.</p>
          ) : (
            <p className="sde-hint">
              The default wording comes from your document templates in Settings.
            </p>
          )}
        </div>
      </Modal.Section>
    </Modal>
  );
}
