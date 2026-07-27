import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { currencies, organizations, type Database } from "@frog1/db";
import {
  parseOrgCatalogCurrencyId,
  parseOrgDefaultWarehouseId,
  parseOrgCompanyProfile,
  parseOrgDocumentTemplates,
  parseOrgSalesPricing,
  resolveCatalogCurrencyId,
  resolveCompanyProfile,
  resolveDocumentTemplates,
  resolveSalesPricingSettings,
  type CompanyProfileSettings,
  type DocumentTemplateSettings,
  type SalesPricingSettings,
  type UpdateCompanySettingsInput,
  type UpdateDocumentTemplatesInput,
  type UpdateSalesPricingInput,
} from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { UploadsService } from "../uploads/uploads.service";

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly uploadsService: UploadsService,
  ) {}

  private parseOrgMetadata(metadata: string | null) {
    if (!metadata) {
      return {} as Record<string, unknown>;
    }

    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  }

  buildLogoUrl(organizationId: string, logoPath: string | null) {
    if (!logoPath) {
      return null;
    }

    const fileName = logoPath.split("/").pop();
    if (!fileName) {
      return null;
    }

    return `/api/v1/files/org-logos/${organizationId}/${fileName}`;
  }

  async getCompany(organizationId: string) {
    const [org] = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        logo: organizations.logo,
        metadata: organizations.metadata,
        baseCurrencyId: organizations.baseCurrencyId,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error("Organization not found");
    }

    let baseCurrencyCode: string | null = null;
    if (org.baseCurrencyId) {
      const [currency] = await this.db
        .select({ code: currencies.code })
        .from(currencies)
        .where(eq(currencies.id, org.baseCurrencyId))
        .limit(1);
      baseCurrencyCode = currency?.code ?? null;
    }

    const storedCatalogCurrencyId = parseOrgCatalogCurrencyId(org.metadata);
    const catalogCurrencyId = resolveCatalogCurrencyId(
      org.baseCurrencyId,
      storedCatalogCurrencyId,
    );
    const defaultWarehouseId = parseOrgDefaultWarehouseId(org.metadata);

    let catalogCurrencyCode: string | null = null;
    if (catalogCurrencyId) {
      const [currency] = await this.db
        .select({ code: currencies.code })
        .from(currencies)
        .where(eq(currencies.id, catalogCurrencyId))
        .limit(1);
      catalogCurrencyCode = currency?.code ?? null;
    }

    const companyProfile = resolveCompanyProfile(
      parseOrgCompanyProfile(org.metadata),
    );

    return {
      name: org.name,
      logoUrl: this.buildLogoUrl(organizationId, org.logo),
      baseCurrencyId: org.baseCurrencyId,
      baseCurrencyCode,
      catalogCurrencyId,
      catalogCurrencyCode,
      defaultWarehouseId,
      companyProfile,
    };
  }

  async updateCompany(
    organizationId: string,
    input: UpdateCompanySettingsInput,
  ) {
    const metadata = this.parseOrgMetadata(
      (
        await this.db
          .select({ metadata: organizations.metadata })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .limit(1)
      )[0]?.metadata ?? null,
    );

    const companyProfile: CompanyProfileSettings = {
      ...resolveCompanyProfile(parseOrgCompanyProfile(JSON.stringify(metadata))),
      ...input.companyProfile,
    };

    const catalogCurrencyId =
      input.catalogCurrencyId === undefined
        ? parseOrgCatalogCurrencyId(JSON.stringify(metadata))
        : input.catalogCurrencyId;

    const defaultWarehouseId =
      input.defaultWarehouseId === undefined
        ? parseOrgDefaultWarehouseId(JSON.stringify(metadata))
        : input.defaultWarehouseId;

    await this.db
      .update(organizations)
      .set({
        name: input.name,
        baseCurrencyId: input.baseCurrencyId,
        metadata: JSON.stringify({
          ...metadata,
          companyProfile,
          catalogCurrencyId,
          defaultWarehouseId,
        }),
      })
      .where(eq(organizations.id, organizationId));

    return this.getCompany(organizationId);
  }

  async uploadCompanyLogo(
    organizationId: string,
    file: Express.Multer.File,
  ) {
    const [org] = await this.db
      .select({ logo: organizations.logo })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const logoPath = await this.uploadsService.saveOrganizationLogo(
      organizationId,
      file,
    );

    if (org?.logo && org.logo !== logoPath) {
      await this.uploadsService.deleteStoredFile(org.logo);
    }

    await this.db
      .update(organizations)
      .set({ logo: logoPath })
      .where(eq(organizations.id, organizationId));

    return {
      logoUrl: this.buildLogoUrl(organizationId, logoPath),
    };
  }

  async getDocumentTemplates(organizationId: string) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const stored = parseOrgDocumentTemplates(org?.metadata ?? null);
    return resolveDocumentTemplates(stored);
  }

  async updateDocumentTemplates(
    organizationId: string,
    input: UpdateDocumentTemplatesInput,
  ) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const metadata = this.parseOrgMetadata(org?.metadata ?? null);
    const documentTemplates: DocumentTemplateSettings = {
      ...resolveDocumentTemplates(parseOrgDocumentTemplates(org?.metadata ?? null)),
      ...input,
    };

    await this.db
      .update(organizations)
      .set({
        metadata: JSON.stringify({
          ...metadata,
          documentTemplates,
        }),
      })
      .where(eq(organizations.id, organizationId));

    return this.getDocumentTemplates(organizationId);
  }

  async getDefaultWarehouseId(organizationId: string) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return parseOrgDefaultWarehouseId(org?.metadata ?? null);
  }

  async getOrganizationBranding(organizationId: string) {
    const company = await this.getCompany(organizationId);
    const documentTemplates = await this.getDocumentTemplates(organizationId);
    const [org] = await this.db
      .select({ logo: organizations.logo })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const logoDataUri = org?.logo
      ? await this.uploadsService.readStoredFileAsDataUri(org.logo)
      : null;

    return {
      name: company.name,
      logoUrl: logoDataUri ?? company.logoUrl,
      companyProfile: company.companyProfile,
      documentTemplates,
    };
  }

  async getSalesPricing(organizationId: string) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const stored = parseOrgSalesPricing(org?.metadata ?? null);
    const effective = resolveSalesPricingSettings(stored);

    return {
      ...effective,
      configured: {
        localAdjustmentPercent: stored.localAdjustmentPercent ?? null,
        nonLocalAdjustmentPercent: stored.nonLocalAdjustmentPercent ?? null,
      },
    };
  }

  async updateSalesPricing(
    organizationId: string,
    input: UpdateSalesPricingInput,
  ) {
    const [org] = await this.db
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const metadata = this.parseOrgMetadata(org?.metadata ?? null);
    const salesPricing: SalesPricingSettings = {
      localAdjustmentPercent: input.localAdjustmentPercent,
      nonLocalAdjustmentPercent: input.nonLocalAdjustmentPercent,
      defaultVatRatePercent: input.defaultVatRatePercent,
      vatRates: input.vatRates,
    };

    await this.db
      .update(organizations)
      .set({
        metadata: JSON.stringify({
          ...metadata,
          salesPricing,
        }),
      })
      .where(eq(organizations.id, organizationId));

    return this.getSalesPricing(organizationId);
  }
}
