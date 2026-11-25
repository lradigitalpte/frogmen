import { BadRequestException } from "@nestjs/common";

/** Why an expense has no receipt; blank means no reason was given. */
export function parseNoReceiptReason(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new BadRequestException("The no-receipt reason must be text");
  }
  const reason = value.trim();
  if (reason.length > 500) {
    throw new BadRequestException("The no-receipt reason can be up to 500 characters");
  }
  return reason || null;
}
