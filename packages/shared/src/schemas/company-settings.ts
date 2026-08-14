import { z } from "zod";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined);
}

export const companyProfileSchema = z.object({
  tagline: optionalText(255),
  address: optionalText(500),
  city: optionalText(120),
  country: optionalText(120),
  phone: optionalText(50),
  email: optionalText(255),
  replyToEmail: z.string().trim().email("Enter a valid reply-to email").max(320).optional().or(z.literal("")),
  website: optionalText(255),
  taxId: optionalText(100),
  alertEmails: z
    .array(z.string().trim().email("Enter a valid alert email address").max(320))
    .max(20, "Add no more than 20 alert email addresses")
    .optional(),
});

export const updateCompanySettingsSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(255),
  baseCurrencyId: z.string().uuid("Select a valid currency"),
  catalogCurrencyId: z.string().uuid("Select a valid currency").optional().nullable(),
  defaultWarehouseId: z.string().uuid("Select a valid warehouse").optional().nullable(),
  companyProfile: companyProfileSchema.optional(),
});

export type CompanyProfileSettings = z.infer<typeof companyProfileSchema>;
export type UpdateCompanySettingsInput = z.infer<
  typeof updateCompanySettingsSchema
>;

export interface CompanySettingsResponse {
  name: string;
  logoUrl: string | null;
  baseCurrencyId: string | null;
  baseCurrencyCode: string | null;
  catalogCurrencyId: string | null;
  catalogCurrencyCode: string | null;
  defaultWarehouseId: string | null;
  companyProfile: Required<CompanyProfileSettings>;
}

export const DEFAULT_COMPANY_PROFILE: Required<CompanyProfileSettings> = {
  tagline: "",
  address: "",
  city: "",
  country: "",
  phone: "",
  email: "",
  replyToEmail: "",
  website: "",
  taxId: "",
  alertEmails: [],
};

export function parseOrgCompanyProfile(
  metadata: string | null | undefined,
): CompanyProfileSettings {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata) as {
      companyProfile?: CompanyProfileSettings;
    };
    return parsed.companyProfile ?? {};
  } catch {
    return {};
  }
}

export function parseOrgDefaultWarehouseId(
  metadata: string | null | undefined,
): string | null {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as {
      defaultWarehouseId?: string | null;
    };
    return parsed.defaultWarehouseId ?? null;
  } catch {
    return null;
  }
}

export function parseOrgCatalogCurrencyId(
  metadata: string | null | undefined,
): string | null {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as {
      catalogCurrencyId?: string | null;
    };
    return parsed.catalogCurrencyId ?? null;
  } catch {
    return null;
  }
}

export function resolveCatalogCurrencyId(
  baseCurrencyId: string | null | undefined,
  catalogCurrencyId?: string | null,
) {
  return catalogCurrencyId ?? baseCurrencyId ?? null;
}

export function resolveCompanyProfile(
  settings: CompanyProfileSettings = {},
): Required<CompanyProfileSettings> {
  return {
    tagline: settings.tagline ?? DEFAULT_COMPANY_PROFILE.tagline,
    address: settings.address ?? DEFAULT_COMPANY_PROFILE.address,
    city: settings.city ?? DEFAULT_COMPANY_PROFILE.city,
    country: settings.country ?? DEFAULT_COMPANY_PROFILE.country,
    phone: settings.phone ?? DEFAULT_COMPANY_PROFILE.phone,
    email: settings.email ?? DEFAULT_COMPANY_PROFILE.email,
    replyToEmail: settings.replyToEmail ?? DEFAULT_COMPANY_PROFILE.replyToEmail,
    website: settings.website ?? DEFAULT_COMPANY_PROFILE.website,
    taxId: settings.taxId ?? DEFAULT_COMPANY_PROFILE.taxId,
    alertEmails: settings.alertEmails ?? DEFAULT_COMPANY_PROFILE.alertEmails,
  };
}
