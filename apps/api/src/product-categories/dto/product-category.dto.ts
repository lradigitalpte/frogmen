export interface CreateProductCategoryDto {
  name: string;
}

export interface ListProductCategoriesQuery {
  search?: string;
  page?: number;
  perPage?: number;
}
