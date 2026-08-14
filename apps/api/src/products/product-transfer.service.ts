import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import AdmZip from "adm-zip";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  currencies,
  productCategoryCatalog,
  productTagCatalog,
  products,
  type Database,
} from "@frog1/db";
import { DATABASE } from "../database/database.constants";
import { UploadsService } from "../uploads/uploads.service";
import { ProductsService } from "./products.service";

type TransferField =
  | "description" | "barcode" | "sellingPrice" | "costPrice" | "category"
  | "tags" | "dimensions" | "images";

interface TransferProduct {
  sku: string;
  name: string;
  type: "goods" | "service";
  parentSku?: string | null;
  equipmentRole: "main_equipment" | "component" | "general";
  usageType: "for_sale" | "operations";
  isRovEquipment: boolean;
  isStorable: boolean;
  trackSerial: boolean;
  isActive: boolean;
  barcode?: string | null;
  description?: string | null;
  sellingPrice?: string | null;
  costPrice?: string | null;
  currencyCode?: string | null;
  category?: string | null;
  tags?: string[];
  weight?: string | null;
  volume?: string | null;
  images?: Array<{ file: string; mimeType: string }>;
}

interface TransferManifest {
  format: "frog1-product-catalog";
  version: 1;
  exportedAt: string;
  fields: TransferField[];
  products: TransferProduct[];
}

@Injectable()
export class ProductTransferService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly uploads: UploadsService,
    private readonly productsService: ProductsService,
  ) {}

  private parsePackage(buffer: Buffer) {
    let zip: AdmZip;
    try { zip = new AdmZip(buffer); } catch { throw new BadRequestException("Invalid transfer ZIP package"); }
    const entry = zip.getEntry("manifest.json");
    if (!entry) throw new BadRequestException("Transfer package has no manifest.json");
    let manifest: TransferManifest;
    try { manifest = JSON.parse(entry.getData().toString("utf8")) as TransferManifest; }
    catch { throw new BadRequestException("Transfer package manifest is invalid"); }
    if (manifest.format !== "frog1-product-catalog" || manifest.version !== 1 || !Array.isArray(manifest.products)) {
      throw new BadRequestException("Unsupported product transfer package");
    }
    if (manifest.products.length > 5_000) throw new BadRequestException("A package may contain at most 5,000 products");
    return { zip, manifest };
  }

  async exportPackage(
    organizationId: string,
    input: { productIds?: string[]; fields?: TransferField[] },
  ) {
    const fields: TransferField[] = input.fields?.length ? input.fields : ["description", "barcode", "sellingPrice", "category", "tags", "dimensions", "images"];
    const filters = [eq(products.organizationId, organizationId), isNull(products.deletedAt)];
    if (input.productIds?.length) filters.push(inArray(products.id, input.productIds));
    const rows = await this.db
      .select({ product: products, currencyCode: currencies.code, categoryName: productCategoryCatalog.name })
      .from(products)
      .leftJoin(currencies, eq(currencies.id, products.priceCurrencyId))
      .leftJoin(productCategoryCatalog, eq(productCategoryCatalog.id, products.categoryId))
      .where(and(...filters));
    const skuById = new Map(rows.map((row) => [row.product.id, row.product.sku]));
    const zip = new AdmZip();
    const manifestProducts: TransferProduct[] = [];

    for (const row of rows) {
      const product = row.product;
      if (!product.sku?.trim()) continue;
      const item: TransferProduct = {
        sku: product.sku.trim(), name: product.name, type: product.type,
        parentSku: product.parentId ? skuById.get(product.parentId) ?? null : null,
        equipmentRole: product.equipmentRole, usageType: product.usageType,
        isRovEquipment: product.isRovEquipment, isStorable: product.isStorable,
        trackSerial: product.trackSerial, isActive: product.isActive,
      };
      if (fields.includes("barcode")) item.barcode = product.barcode;
      if (fields.includes("description")) item.description = product.description;
      if (fields.includes("sellingPrice")) { item.sellingPrice = product.sellingPrice; item.currencyCode = row.currencyCode?.trim() ?? null; }
      if (fields.includes("costPrice")) item.costPrice = product.costPrice;
      if (fields.includes("category")) item.category = row.categoryName;
      if (fields.includes("tags")) item.tags = product.tags;
      if (fields.includes("dimensions")) { item.weight = product.weight; item.volume = product.volume; }
      if (fields.includes("images")) {
        item.images = [];
        for (let index = 0; index < product.images.length; index += 1) {
          const imagePath = product.images[index];
          try {
            const image = await this.uploads.getProductImageStream(organizationId, imagePath);
            const ext = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : image.contentType === "image/gif" ? "gif" : "jpg";
            const file = `images/${product.sku.replace(/[^a-zA-Z0-9_-]/g, "_")}/${index}.${ext}`;
            zip.addFile(file, image.buffer);
            item.images.push({ file, mimeType: image.contentType });
          } catch { /* Missing source images do not invalidate the catalog package. */ }
        }
      }
      manifestProducts.push(item);
    }
    const manifest: TransferManifest = {
      format: "frog1-product-catalog", version: 1, exportedAt: new Date().toISOString(), fields, products: manifestProducts,
    };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
    return { buffer: zip.toBuffer(), count: manifestProducts.length };
  }

  async preview(organizationId: string, buffer: Buffer) {
    const { manifest } = this.parsePackage(buffer);
    const skus = manifest.products.map((item) => item.sku.trim()).filter(Boolean);
    const existing = skus.length
      ? await this.db.select({ id: products.id, sku: products.sku, name: products.name }).from(products)
          .where(and(eq(products.organizationId, organizationId), isNull(products.deletedAt)))
      : [];
    const existingBySku = new Map(existing.map((item) => [item.sku?.toLowerCase(), item]));
    const packageSkus = new Set<string>();
    const rows = manifest.products.map((item) => {
      const normalized = item.sku.trim().toLowerCase();
      const duplicate = packageSkus.has(normalized);
      packageSkus.add(normalized);
      const match = existingBySku.get(normalized);
      const parentMissing = Boolean(item.parentSku) &&
        !manifest.products.some((candidate) => candidate.sku.toLowerCase() === item.parentSku?.toLowerCase()) &&
        !existingBySku.has(item.parentSku!.toLowerCase());
      const conflicts = [duplicate ? "Duplicate SKU inside package" : null, parentMissing ? `Parent SKU ${item.parentSku} was not found` : null].filter(Boolean);
      return { sku: item.sku, name: item.name, action: conflicts.length ? "conflict" : match ? "update" : "create", existingId: match?.id ?? null, conflicts };
    });
    return {
      exportedAt: manifest.exportedAt, fields: manifest.fields, rows,
      summary: {
        create: rows.filter((row) => row.action === "create").length,
        update: rows.filter((row) => row.action === "update").length,
        conflict: rows.filter((row) => row.action === "conflict").length,
      },
    };
  }

  async apply(
    organizationId: string,
    buffer: Buffer,
    options: { existingStrategy?: "skip" | "update"; createCategories?: boolean; includeCost?: boolean },
  ) {
    const { zip, manifest } = this.parsePackage(buffer);
    const preview = await this.preview(organizationId, buffer);
    if (preview.summary.conflict) throw new BadRequestException("Resolve package conflicts before importing");
    const currenciesRows = await this.db.select().from(currencies);
    const currencyByCode = new Map(currenciesRows.map((item) => [item.code.trim().toUpperCase(), item.id]));
    const categoryRows = await this.db.select().from(productCategoryCatalog).where(and(eq(productCategoryCatalog.organizationId, organizationId), isNull(productCategoryCatalog.deletedAt)));
    const categoryByName = new Map(categoryRows.map((item) => [item.name.toLowerCase(), item.id]));
    const tagRows = await this.db.select().from(productTagCatalog).where(and(eq(productTagCatalog.organizationId, organizationId), isNull(productTagCatalog.deletedAt)));
    const tagNames = new Set(tagRows.map((item) => item.name.toLowerCase()));
    const existingRows = await this.db.select().from(products).where(and(eq(products.organizationId, organizationId), isNull(products.deletedAt)));
    const productBySku = new Map(existingRows.filter((item) => item.sku).map((item) => [item.sku!.toLowerCase(), item]));
    let created = 0, updated = 0, skipped = 0;
    const pendingParents: Array<{ id: string; parentSku: string }> = [];

    for (const item of manifest.products) {
      const key = item.sku.toLowerCase();
      const existing = productBySku.get(key);
      if (existing && options.existingStrategy !== "update") { skipped += 1; continue; }
      let categoryId: string | null = null;
      if (item.category) {
        categoryId = categoryByName.get(item.category.toLowerCase()) ?? null;
        if (!categoryId && options.createCategories !== false) {
          const [category] = await this.db.insert(productCategoryCatalog).values({ organizationId, name: item.category }).returning();
          categoryId = category.id; categoryByName.set(item.category.toLowerCase(), category.id);
        }
      }
      for (const tag of item.tags ?? []) {
        if (!tagNames.has(tag.toLowerCase())) {
          await this.db.insert(productTagCatalog).values({ organizationId, name: tag });
          tagNames.add(tag.toLowerCase());
        }
      }
      const dto = {
        type: item.type, name: item.name, sku: item.sku, barcode: item.barcode ?? undefined,
        description: item.description ?? undefined,
        sellingPrice: item.sellingPrice ?? undefined,
        costPrice: options.includeCost ? item.costPrice ?? undefined : undefined,
        priceCurrencyId: item.currencyCode ? currencyByCode.get(item.currencyCode.toUpperCase()) : undefined,
        equipmentRole: item.equipmentRole, usageType: item.usageType,
        isRovEquipment: item.isRovEquipment, isStorable: item.isStorable,
        trackSerial: item.trackSerial, isActive: item.isActive,
        tags: item.tags ?? [], categoryId: categoryId ?? undefined,
        weight: item.weight ?? undefined, volume: item.volume ?? undefined,
      };
      const saved = existing
        ? await this.productsService.update(organizationId, existing.id, dto)
        : await this.productsService.create(organizationId, dto, {});
      if (existing) updated += 1; else { created += 1; productBySku.set(key, saved); }
      if (item.parentSku) pendingParents.push({ id: saved.id, parentSku: item.parentSku });
      if (!existing && item.images?.length) {
        for (const image of item.images) {
          const entry = zip.getEntry(image.file);
          if (!entry) continue;
          await this.productsService.addImage(organizationId, saved.id, {
            fieldname: "file", originalname: image.file.split("/").pop() ?? "image.jpg",
            encoding: "7bit", mimetype: image.mimeType, size: entry.header.size,
            buffer: entry.getData(), destination: "", filename: "", path: "", stream: undefined as never,
          });
        }
      }
    }
    for (const pending of pendingParents) {
      const parent = productBySku.get(pending.parentSku.toLowerCase());
      if (parent) await this.productsService.update(organizationId, pending.id, { parentId: parent.id });
    }
    return { success: true, created, updated, skipped };
  }
}
