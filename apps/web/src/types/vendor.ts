export type {
  CreateVendorInput,
  UpdateVendorInput,
  ListVendorsQuery,
  VendorFormValues,
  VendorAccountType,
} from "@frog1/shared";

export {
  vendorFormSchema,
  emptyVendorForm,
  vendorFormValuesToInput,
  formatZodError,
  getZodFieldErrors,
} from "@frog1/shared";

export interface Vendor {
  id: string;
  organizationId: string;
  accountType: import("@frog1/shared").VendorAccountType;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  taxId: string | null;
  reference: string | null;
  contactName: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  countryCode: string | null;
  stateCode: string | null;
  defaultCurrencyId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListVendorsParams {
  accountType?: import("@frog1/shared").VendorAccountType;
  archived?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
  sortBy?: "name" | "email" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface PaginatedVendors {
  data: Vendor[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}
