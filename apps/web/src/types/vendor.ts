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
  memberSince: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Purchase order activity; only present on list responses. */
  stats?: VendorPurchaseStats;
}

export interface VendorPurchaseStats {
  orderCount: number;
  openOrders: number;
  lastOrderDate: string | null;
  /** Confirmed order totals in the organisation's base currency. */
  spendBase: string;
}

export interface VendorSummary {
  all: number;
  company: number;
  individual: number;
  archived: number;
  withOpenOrders: number;
  openOrders: number;
  spendBase: string;
  spendLast90Base: string;
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
  summary?: VendorSummary;
}
