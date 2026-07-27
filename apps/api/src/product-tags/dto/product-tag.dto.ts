export interface CreateProductTagDto {
  name: string;
}

export interface ListProductTagsQuery {
  search?: string;
  page?: number;
  perPage?: number;
}
