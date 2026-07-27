import { convertAmount } from "./money";

/** Convert a payment amount in payment currency to invoice/document currency. */
export function convertPaymentToInvoiceAmount(
  paymentAmount: number,
  ratePaymentToInvoice: number,
) {
  return convertAmount(paymentAmount, ratePaymentToInvoice);
}
