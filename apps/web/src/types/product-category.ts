export interface ProductCategory {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListProductCategoriesParams {
  search?: string;
  page?: number;
  perPage?: number;
}

export interface PaginatedProductCategories {
  data: ProductCategory[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}
