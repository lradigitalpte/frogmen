export interface ProductTag {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Live products carrying this tag (from the list endpoint). */
  productCount?: number;
}

export interface ListProductTagsParams {
  search?: string;
  page?: number;
  perPage?: number;
}

export interface PaginatedProductTags {
  data: ProductTag[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}
