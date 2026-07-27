import { z } from "zod";
import {
  COUNTRY_CODES,
  countryHasStates,
  getStatesForCountry,
  type State,
} from "../locations";

export const customerAccountTypeSchema = z.enum(["individual", "company"]);

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined);
}

function optionalEmail() {
  return z
    .string()
    .trim()
    .max(255)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined)
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: "Invalid email address",
    });
}

const countryCodeSchema = z
  .string()
  .trim()
  .length(2, "Country must be a 2-letter code")
  .transform((value) => value.toUpperCase())
  .refine((value) => COUNTRY_CODES.has(value), {
    message: "Invalid country",
  });

const optionalCountryCodeSchema = z
  .union([countryCodeSchema, z.literal("")])
  .optional()
  .transform((value) => value || undefined);

const optionalStateCodeSchema = z
  .string()
  .trim()
  .max(10)
  .optional()
  .or(z.literal(""))
  .transform((value) => value || undefined);

function validateCountryState(
  data: { countryCode?: string; stateCode?: string },
  ctx: z.RefinementCtx,
) {
  if (data.stateCode && !data.countryCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stateCode"],
      message: "Select a country before choosing a state",
    });
    return;
  }

  if (!data.countryCode || !data.stateCode) {
    return;
  }

  if (!countryHasStates(data.countryCode)) {
    return;
  }

  const valid = getStatesForCountry(data.countryCode).some(
    (state: State) => state.code === data.stateCode,
  );

  if (!valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stateCode"],
      message: "Invalid state for selected country",
    });
  }
}

const customerCoreFields = {
  accountType: customerAccountTypeSchema,
  name: z.string().trim().min(1, "Name is required").max(255),
  email: optionalEmail(),
  phone: optionalText(50),
  mobile: optionalText(50),
  website: optionalText(255),
  taxId: optionalText(100),
  reference: optionalText(100),
  jobTitle: optionalText(150),
  street1: optionalText(255),
  street2: optionalText(255),
  city: optionalText(120),
  zip: optionalText(30),
  countryCode: optionalCountryCodeSchema,
  stateCode: optionalStateCodeSchema,
};

export const createCustomerSchema = z
  .object({
    ...customerCoreFields,
    parentId: z.string().uuid().optional(),
    defaultCurrencyId: z.string().uuid().optional(),
    creditLimit: z.coerce.number().min(0).optional(),
    creditApproved: z.boolean().optional(),
    isLocal: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(validateCountryState);

export const updateCustomerSchema = z
  .object({
    accountType: customerAccountTypeSchema.optional(),
    name: z.string().trim().min(1, "Name is required").max(255).optional(),
    email: optionalEmail(),
    phone: optionalText(50),
    mobile: optionalText(50),
    website: optionalText(255),
    taxId: optionalText(100),
    reference: optionalText(100),
    jobTitle: optionalText(150),
    street1: optionalText(255),
    street2: optionalText(255),
    city: optionalText(120),
    zip: optionalText(30),
    countryCode: optionalCountryCodeSchema,
    stateCode: optionalStateCodeSchema,
    parentId: z.string().uuid().optional(),
    defaultCurrencyId: z.string().uuid().optional(),
    creditLimit: z.coerce.number().min(0).optional(),
    creditApproved: z.boolean().optional(),
    isLocal: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(validateCountryState);

export const listCustomersQuerySchema = z.object({
  accountType: customerAccountTypeSchema.optional(),
  archived: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === true || value === "true"),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["name", "email", "createdAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const customerFormSchema = z
  .object({
    accountType: customerAccountTypeSchema,
    name: z.string().trim().min(1, "Name is required").max(255),
    email: z
      .string()
      .trim()
      .max(255)
      .refine((value) => !value || z.string().email().safeParse(value).success, {
        message: "Invalid email address",
      }),
    phone: z.string().trim().max(50),
    mobile: z.string().trim().max(50),
    website: z.string().trim().max(255),
    taxId: z.string().trim().max(100),
    reference: z.string().trim().max(100),
    jobTitle: z.string().trim().max(150),
    street1: z.string().trim().max(255),
    street2: z.string().trim().max(255),
    city: z.string().trim().max(120),
    zip: z.string().trim().max(30),
    countryCode: z.string().trim(),
    stateCode: z.string().trim().max(10),
    isLocal: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.countryCode) {
      return;
    }

    validateCountryState(
      {
        countryCode: data.countryCode.toUpperCase(),
        stateCode: data.stateCode || undefined,
      },
      ctx,
    );

    if (
      data.countryCode &&
      !COUNTRY_CODES.has(data.countryCode.toUpperCase())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["countryCode"],
        message: "Invalid country",
      });
    }
  });

export type CustomerAccountType = z.infer<typeof customerAccountTypeSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export function emptyCustomerForm(
  accountType: CustomerAccountType = "individual",
): CustomerFormValues {
  return {
    accountType,
    name: "",
    email: "",
    phone: "",
    mobile: "",
    website: "",
    taxId: "",
    reference: "",
    jobTitle: "",
    street1: "",
    street2: "",
    city: "",
    zip: "",
    countryCode: "",
    stateCode: "",
    isLocal: false,
  };
}

export function formValuesToInput(
  values: CustomerFormValues,
): CreateCustomerInput {
  return createCustomerSchema.parse({
    ...values,
    countryCode: values.countryCode || undefined,
    stateCode: values.stateCode || undefined,
    email: values.email || undefined,
    phone: values.phone || undefined,
    mobile: values.mobile || undefined,
    website: values.website || undefined,
    taxId: values.taxId || undefined,
    reference: values.reference || undefined,
    jobTitle: values.jobTitle || undefined,
    street1: values.street1 || undefined,
    street2: values.street2 || undefined,
    city: values.city || undefined,
    zip: values.zip || undefined,
  });
}

export function getZodFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".");

    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}

export function formatZodError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Validation failed";
}
