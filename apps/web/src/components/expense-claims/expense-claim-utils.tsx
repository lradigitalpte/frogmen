"use client";

import { Badge } from "@shopify/polaris";
import type { ExpenseClaimStatus } from "@/lib/expense-claims-api";

export function formatExpenseClaimDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatExpenseClaimDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatExpenseClaimActor(
  name?: string | null,
  email?: string | null,
) {
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return "—";
}

export function formatExpenseClaimPaymentMethod(method?: string | null) {
  switch (method) {
    case "cash":
      return "Cash";
    case "bank_transfer":
      return "Bank transfer";
    case "wire_transfer":
      return "Wire transfer";
    case "cheque":
      return "Cheque";
    default:
      return method ?? "—";
  }
}

export function ExpenseClaimStatusBadge({ status }: { status: ExpenseClaimStatus }) {
  switch (status) {
    case "draft":
      return <Badge>Draft</Badge>;
    case "submitted":
      return <Badge tone="attention">Submitted</Badge>;
    case "approved":
      return <Badge tone="info">Approved</Badge>;
    case "rejected":
      return <Badge tone="critical">Rejected</Badge>;
    case "reimbursed":
      return <Badge tone="success">Reimbursed</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}
