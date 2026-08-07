export type ProductUnitStatus = "in_stock" | "assigned" | "sold" | "scrapped";

export type RemoveProductUnitReason = "scrapped" | "sold";

export interface CreateProductUnitDto {
  serialNumber: string;
  warehouseId: string;
  notes?: string;
  parentUnitId?: string;
}

export interface RemoveProductUnitDto {
  reason?: RemoveProductUnitReason;
}

export interface UpdateProductUnitDto {
  warehouseId?: string;
  status?: ProductUnitStatus;
  notes?: string;
}

export interface LinkProductUnitDto {
  parentUnitId: string;
}

export interface ListProductUnitsQuery {
  warehouseId?: string;
  status?: ProductUnitStatus;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface ListLinkableUnitsQuery {
  parentProductId: string;
  search?: string;
  page?: number;
  perPage?: number;
}
