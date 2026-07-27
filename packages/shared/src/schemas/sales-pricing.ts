import { z } from "zod";

const adjustmentPercentSchema = z
  .number()
  .min(-100, "Adjustment cannot be less than -100%")
  .max(100, "Adjustment cannot exceed 100%");

export const updateSalesPricingSchema = z.object({
  localAdjustmentPercent: adjustmentPercentSchema,
  nonLocalAdjustmentPercent: adjustmentPercentSchema,
  defaultVatRatePercent: z.number().min(0).max(100),
  vatRates: z
    .array(z.number().min(0).max(100))
    .min(1)
    .max(12)
    .transform((rates) => [...new Set(rates)].sort((a, b) => a - b)),
});

export type UpdateSalesPricingInput = z.infer<typeof updateSalesPricingSchema>;
