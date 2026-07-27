import { cn } from "@/lib/utils";

export type StatusBadgeVariant =
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "neutral";

const variantStyles: Record<StatusBadgeVariant, string> = {
  success: "bg-frogmen-emerald/15 text-frogmen-emerald-dark",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-secondary/15 text-secondary",
  neutral: "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  className?: string;
}

export function StatusBadge({
  children,
  variant = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Invoice / payment status labels */
export function invoiceStatusVariant(status: string): StatusBadgeVariant {
  if (status === "Paid") return "success";
  if (status === "Overdue") return "destructive";
  if (status === "Pending" || status === "Due Soon") return "info";
  return "neutral";
}

/** Alert hub status labels */
export function alertStatusVariant(status: string): StatusBadgeVariant {
  if (status === "Overdue" || status === "Credit Risk") return "destructive";
  if (status === "Due Soon") return "info";
  return "neutral";
}

/** Quotation workflow states */
export function quotationStateVariant(state: string): StatusBadgeVariant {
  if (state === "confirmed") return "success";
  if (state === "sent") return "info";
  if (state === "cancelled") return "destructive";
  return "neutral";
}

export function quotationStateLabel(state: string): string {
  switch (state) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent to Customer";
    case "confirmed":
      return "Confirmed Order";
    case "cancelled":
      return "Cancelled";
    default:
      return state;
  }
}

/** Sales order invoicing progress */
export function orderInvoiceStatusVariant(status?: string | null): StatusBadgeVariant {
  if (status === "invoiced") return "success";
  if (status === "partial") return "info";
  if (status === "to_invoice") return "warning";
  return "neutral";
}

export function orderInvoiceStatusLabel(status?: string | null): string {
  switch (status) {
    case "invoiced":
      return "Invoiced";
    case "partial":
      return "Partially Invoiced";
    case "to_invoice":
      return "To Invoice";
    default:
      return "Not Ready";
  }
}

/** Invoice lifecycle (draft / posted / paid / cancelled) */
export function invoiceLifecycleVariant(status: string): StatusBadgeVariant {
  if (status === "paid") return "success";
  if (status === "posted") return "info";
  if (status === "cancelled") return "destructive";
  return "neutral";
}

export function invoiceLifecycleLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "posted":
      return "Posted / Unpaid";
    case "draft":
      return "Draft";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/** Customer payment states */
export function paymentStateVariant(state: string): StatusBadgeVariant {
  if (state === "paid") return "success";
  if (state === "in_process") return "info";
  return "neutral";
}

export function paymentStateLabel(state: string): string {
  switch (state) {
    case "paid":
      return "Paid";
    case "in_process":
      return "In Process";
    case "draft":
      return "Draft";
    default:
      return state;
  }
}

/** Purchase order workflow states */
export function purchaseOrderStateVariant(state: string): StatusBadgeVariant {
  if (state === "confirmed") return "success";
  if (state === "cancelled") return "destructive";
  return "neutral";
}

export function purchaseOrderStateLabel(state: string): string {
  switch (state) {
    case "draft":
      return "Draft";
    case "confirmed":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    default:
      return state;
  }
}

/** Purchase order receipt progress */
export function purchaseReceiptStatusVariant(status?: string | null): StatusBadgeVariant {
  if (status === "received") return "success";
  if (status === "partial") return "info";
  if (status === "to_receive") return "warning";
  return "neutral";
}

export function purchaseReceiptStatusLabel(status?: string | null): string {
  switch (status) {
    case "received":
      return "Received";
    case "partial":
      return "Partially Received";
    case "to_receive":
      return "To Receive";
    case "none":
      return "Not Ready";
    default:
      return status ?? " ";
  }
}

/** Serialized product unit lifecycle */
export function productUnitStatusVariant(status: string): StatusBadgeVariant {
  if (status === "in_stock") return "success";
  if (status === "assigned") return "info";
  if (status === "sold") return "neutral";
  if (status === "scrapped") return "destructive";
  return "neutral";
}

export function productUnitStatusLabel(status: string): string {
  switch (status) {
    case "in_stock":
      return "In stock";
    case "assigned":
      return "Assigned";
    case "sold":
      return "Sold";
    case "scrapped":
      return "Scrapped";
    default:
      return status.replace(/_/g, " ");
  }
}
