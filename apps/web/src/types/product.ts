export type ProductType = "goods" | "service";

export type ProductEquipmentRole =
  | "main_equipment"
  | "component"
  | "general";

export type ProductUsageType = "for_sale" | "operations";

export interface ProductSummary {
  id: string;
  name: string;
  sku: string | null;
}

export interface Product {
  id: string;
  organizationId: string;
  parentId: string | null;
  equipmentRole: ProductEquipmentRole;
  usageType: ProductUsageType;
  isRovEquipment: boolean;
  type: ProductType;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  images: string[];
  costPrice: string | null;
  sellingPrice: string | null;
  priceCurrencyId: string | null;
  isStorable: boolean;
  trackSerial: boolean;
  weight: string | null;
  volume: string | null;
  isActive: boolean;
  categoryId: string | null;
  defaultWarrantyPolicyId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProductDetail extends Product {
  parent: ProductSummary | null;
  subProducts: Product[];
}

export interface InitialProductStockInput {
  warehouseId: string;
  serialNumbers?: string[];
  quantity?: string;
}

export interface CreateProductInput {
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
  initialStock?: InitialProductStockInput;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export interface ListProductsParams {
  type?: ProductType;
  parentId?: string;
  rootOnly?: boolean;
  archived?: boolean;
  forSaleOnly?: boolean;
  usageType?: ProductUsageType;
  isRovEquipment?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
  sortBy?: "name" | "sku" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface PaginatedProducts {
  data: Product[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export type ProductTab =
  | "all"
  | "goods"
  | "service"
  | "for_sale"
  | "operations"
  | "rov"
  | "archived";

export type ProductUnitStatus = "in_stock" | "assigned" | "sold" | "scrapped";

export interface ProductUnit {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  serialNumber: string;
  parentUnitId: string | null;
  status: ProductUnitStatus;
  linkedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  warehouseName?: string;
  warehouseCode?: string;
}

export interface ProductUnitDetail extends ProductUnit {
  productName: string;
  productSku: string | null;
  parentUnit: {
    id: string;
    serialNumber: string;
    productId: string;
    productName: string;
  } | null;
  childUnits: Array<{
    id: string;
    serialNumber: string;
    productId: string;
    productName: string;
    status: ProductUnitStatus;
    linkedAt: string | null;
  }>;
}

export interface PaginatedProductUnits {
  data: ProductUnit[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface LinkableProductUnit {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  productSku: string | null;
  warehouseName?: string;
  status: ProductUnitStatus;
  parentUnitId: string | null;
  isSubProduct: boolean;
}

export interface PaginatedLinkableUnits {
  data: LinkableProductUnit[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductStockLevel {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  quantity: string;
}

export interface ProductStock {
  trackSerial: boolean;
  levels: ProductStockLevel[];
}

export interface StockOverviewRow {
  id: string | null;
  productId: string;
  productName: string;
  productSku: string | null;
  productType: ProductType;
  trackSerial: boolean;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  quantity: string;
  kind: "bulk" | "serialized";
  serialSummary?: string | null;
  updatedAt: string;
}

export interface PaginatedStock {
  data: StockOverviewRow[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}
