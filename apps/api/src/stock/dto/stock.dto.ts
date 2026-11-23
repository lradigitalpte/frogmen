export interface ListStockQuery {
  productId?: string;
  warehouseId?: string;
  search?: string;
  /** all | in_stock | low_stock | out_of_stock | serialized | bulk */
  status?: string;
  /** recent | name | qty_asc | qty_desc */
  sort?: string;
  page?: number;
  perPage?: number;
}

export interface AdjustStockDto {
  productId: string;
  warehouseId: string;
  quantity?: string;
  adjustment?: string;
}
