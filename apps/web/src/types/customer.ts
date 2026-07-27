export type {
  CreateCustomerInput,
  CustomerAccountType,
  CustomerFormValues,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "@frog1/shared";

export {
  customerFormSchema,
  emptyCustomerForm,
  formValuesToInput,
  formatZodError,
  getZodFieldErrors,
} from "@frog1/shared";

export interface Customer {
  id: string;
  organizationId: string;
  accountType: import("@frog1/shared").CustomerAccountType;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  taxId: string | null;
  reference: string | null;
  jobTitle: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  countryCode: string | null;
  stateCode: string | null;
  parentId: string | null;
  defaultCurrencyId: string | null;
  creditLimit: string;
  creditApproved: boolean;
  isLocal: boolean;
  avatarPath: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListCustomersParams {
  accountType?: import("@frog1/shared").CustomerAccountType;
  archived?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
  sortBy?: "name" | "email" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface PaginatedCustomers {
  data: Customer[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface CustomerStats {
  totalAccounts: number;
  corporateAccounts: number;
  registeredThisMonth: number;
  totalCreditLine: string;
  approvedCreditAccounts: number;
}

export type CustomerTab = "all" | "individual" | "company" | "archived";
