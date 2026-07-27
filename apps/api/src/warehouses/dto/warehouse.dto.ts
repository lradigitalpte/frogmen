export interface CreateWarehouseDto {
  name: string;
  code: string;
  street1?: string;
  city?: string;
  zip?: string;
  countryCode?: string;
  isActive?: boolean;
}

export type UpdateWarehouseDto = Partial<CreateWarehouseDto>;

export interface ListWarehousesQuery {
  archived?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
  sortBy?: "name" | "code" | "createdAt";
  sortDir?: "asc" | "desc";
}
