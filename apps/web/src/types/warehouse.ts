export interface Warehouse {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  street1: string | null;
  city: string | null;
  zip: string | null;
  countryCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateWarehouseInput {
  name: string;
  code: string;
  street1?: string;
  city?: string;
  zip?: string;
  countryCode?: string;
  isActive?: boolean;
}

export type UpdateWarehouseInput = Partial<CreateWarehouseInput>;

export interface ListWarehousesParams {
  archived?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
  sortBy?: "name" | "code" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface PaginatedWarehouses {
  data: Warehouse[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export type WarehouseTab = "all" | "archived";
