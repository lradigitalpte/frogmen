export interface CreateWarrantyPolicyDto {
  name: string;
  description?: string;
  durationMonths?: number;
  isActive?: boolean;
}

export interface UpdateWarrantyPolicyDto {
  name?: string;
  description?: string;
  durationMonths?: number;
  isActive?: boolean;
}

export interface ListWarrantyPoliciesQuery {
  search?: string;
  activeOnly?: boolean | string;
  page?: number;
  perPage?: number;
}
