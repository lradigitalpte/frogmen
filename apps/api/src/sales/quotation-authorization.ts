export interface QuotationAuthorization {
  state: string;
  customerReference?: string | null;
  customerPoDocumentUrl?: string | null;
  signedOn?: Date | null;
}

export function hasCustomerAuthorization(order: QuotationAuthorization) {
  const hasPurchaseOrder = Boolean(
    order.customerReference?.trim() || order.customerPoDocumentUrl?.trim(),
  );
  const hasDigitalSignature = order.state === "signed" && Boolean(order.signedOn);

  return hasPurchaseOrder || hasDigitalSignature;
}
