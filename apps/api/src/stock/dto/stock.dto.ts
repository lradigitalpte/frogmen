export interface ListStockQuery {
  productId?: string;
  warehouseId?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface AdjustStockDto {
  productId: string;
  warehouseId: string;
  quantity?: string;
  adjustment?: string;
}
