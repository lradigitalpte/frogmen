export interface ProductTag {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
