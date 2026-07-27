export interface ConfiguredLineItem {
  id: string;
  productId: string;
  productUnitId?: string;
  serialNumber?: string;
  name: string;
  sku: string;
  quantity: number;
  baseUnitPrice: number;
  unitPrice: number;
  unitCost: number;
  discountPercent: number;
  taxRatePercent: number;
  availableQuantity?: number;
}
