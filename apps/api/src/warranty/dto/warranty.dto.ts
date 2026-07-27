export interface ListWarrantiesQuery {
  search?: string;
  status?: "active" | "expired" | "voided";
  productId?: string;
  productUnitId?: string;
  expiringSoon?: boolean | string;
  page?: number;
  perPage?: number;
}

export interface CreateWarrantyDto {
  policyId: string;
  soldAt: string;
  endsAt?: string;
  notes?: string;
  invoiceLineId?: string;
  productId?: string;
  productUnitId?: string;
  productName?: string;
  serialNumber?: string;
  customerId?: string;
  customerName?: string;
  quantity?: number;
}

export interface SearchSalesQuery {
  search?: string;
  page?: number;
  perPage?: number;
}
