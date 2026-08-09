export type ProductType = "goods" | "service";

export type ProductEquipmentRole =
  | "main_equipment"
  | "component"
  | "general";

export type ProductUsageType = "for_sale" | "operations";

export interface InitialProductStockDto {
  warehouseId: string;
  serialNumbers?: string[];
  quantity?: string;
}

export interface CreateProductDto {
  type: ProductType;
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  costPrice?: string;
  sellingPrice?: string;
  priceCurrencyId?: string;
  parentId?: string;
  equipmentRole?: ProductEquipmentRole;
  usageType?: ProductUsageType;
  isRovEquipment?: boolean;
  isStorable?: boolean;
  trackSerial?: boolean;
  weight?: string;
  volume?: string;
  isActive?: boolean;
  tags?: string[];
  categoryId?: string;
  defaultWarrantyPolicyId?: string | null;
  initialStock?: InitialProductStockDto;
}

export type UpdateProductDto = Partial<CreateProductDto>;

export interface ListProductsQuery {
  type?: ProductType;
  parentId?: string;
  rootOnly?: boolean;
  archived?: boolean;
  forSaleOnly?: boolean;
  usageType?: ProductUsageType;
  isRovEquipment?: boolean;
  /** Attach availableQuantity (sellable on-hand) to each product. */
  includeStock?: boolean;
  /** Only return products with sellable stock (services/non-storable always included). */
  inStockOnly?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
  sortBy?: "name" | "sku" | "createdAt";
  sortDir?: "asc" | "desc";
}
