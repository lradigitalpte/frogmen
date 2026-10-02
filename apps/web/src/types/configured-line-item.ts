export interface ConfiguredLineItem {
  id: string;
  productId: string;
  productUnitId?: string;
  serialNumber?: string;
  /** Dropship placeholder serial / supplier reference (no warehouse unit). */
  supplyReference?: string;
  name: string;
  details?: string | null;
  sku: string;
  quantity: number;
  baseUnitPrice: number;
  unitPrice: number;
  unitCost: number;
  discountPercent: number;
  /** Fixed currency discount; when > 0 it takes priority over discountPercent. */
  discountAmount?: number;
  taxRatePercent: number;
  availableQuantity?: number | null;
  isStorable?: boolean;
  productType?: string;
}
