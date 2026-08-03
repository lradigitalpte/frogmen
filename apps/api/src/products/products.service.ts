import {

  BadRequestException,

  Inject,

  Injectable,

  NotFoundException,

} from "@nestjs/common";

import {

  and,

  asc,

  count,

  desc,

  eq,

  ilike,

  isNotNull,

  isNull,

  or,

  sql,

  type SQL,

} from "drizzle-orm";

import {

  productUnits,

  products,

  productCategoryCatalog,

  stockLevels,

  warehouses,

  type Database,

} from "@frog1/db";

import type {

  CreateProductDto,

  ListProductsQuery,

  UpdateProductDto,

} from "./dto/product.dto";

import { DATABASE } from "../database/database.constants";

import { UploadsService } from "../uploads/uploads.service";
import {
  assertUniqueProductSku,
  generateUniqueProductSku,
  isProductSkuTaken,
} from "./product-reference";



@Injectable()

export class ProductsService {

  constructor(

    @Inject(DATABASE) private readonly db: Database,

    private readonly uploadsService: UploadsService,

  ) {}



  private normalizeSellingPrice(

    usageType: "for_sale" | "operations",

    sellingPrice?: string,

  ) {

    if (usageType === "operations") {

      return null;

    }



    return sellingPrice?.trim() || "0";

  }



  private normalizeTags(tags?: string[]) {

    if (!tags?.length) {

      return [];

    }



    const seen = new Set<string>();

    const normalized: string[] = [];



    for (const tag of tags) {

      const value = tag.trim().replace(/\s+/g, " ");

      if (!value) {

        continue;

      }



      const key = value.toLowerCase();

      if (seen.has(key)) {

        continue;

      }



      seen.add(key);

      normalized.push(value);

    }



    return normalized;

  }



  private async assertWarehouse(organizationId: string, warehouseId: string) {

    const [warehouse] = await this.db

      .select({ id: warehouses.id })

      .from(warehouses)

      .where(

        and(

          eq(warehouses.id, warehouseId),

          eq(warehouses.organizationId, organizationId),

        ),

      )

      .limit(1);



    if (!warehouse) {

      throw new BadRequestException("Warehouse not found");

    }

  }



  private async assertCategory(organizationId: string, categoryId: string) {

    const [category] = await this.db

      .select({ id: productCategoryCatalog.id })

      .from(productCategoryCatalog)

      .where(

        and(

          eq(productCategoryCatalog.id, categoryId),

          eq(productCategoryCatalog.organizationId, organizationId),

          isNull(productCategoryCatalog.deletedAt),

        ),

      )

      .limit(1);



    if (!category) {

      throw new BadRequestException("Category not found");

    }

  }

  async list(organizationId: string, query: ListProductsQuery) {

    const page = Math.max(query.page ?? 1, 1);

    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);

    const offset = (page - 1) * perPage;



    const filters: SQL[] = [eq(products.organizationId, organizationId)];



    if (query.archived) {

      filters.push(isNotNull(products.deletedAt));

    } else {

      filters.push(isNull(products.deletedAt));

    }



    if (query.type) {

      filters.push(eq(products.type, query.type));

    }



    if (query.forSaleOnly) {

      filters.push(eq(products.usageType, "for_sale"));

    } else if (query.usageType) {

      filters.push(eq(products.usageType, query.usageType));

    }



    if (query.isRovEquipment !== undefined) {

      filters.push(eq(products.isRovEquipment, query.isRovEquipment));

    }



    if (query.parentId) {

      filters.push(eq(products.parentId, query.parentId));

    } else if (query.rootOnly) {

      filters.push(isNull(products.parentId));

    }



    if (query.search?.trim()) {

      const term = `%${query.search.trim()}%`;

      filters.push(

        or(

          ilike(products.name, term),

          ilike(products.sku, term),

          ilike(products.barcode, term),

          sql`${products.tags}::text ILIKE ${term}`,

        )!,

      );

    }



    const whereClause = and(...filters);



    const sortColumn =

      query.sortBy === "sku"

        ? products.sku

        : query.sortBy === "createdAt"

          ? products.createdAt

          : products.name;



    const orderBy =

      query.sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);



    const [rows, totalResult] = await Promise.all([

      this.db

        .select()

        .from(products)

        .where(whereClause)

        .orderBy(orderBy)

        .limit(perPage)

        .offset(offset),

      this.db.select({ total: count() }).from(products).where(whereClause),

    ]);



    const total = Number(totalResult[0]?.total ?? 0);



    return {

      data: rows,

      meta: {

        page,

        perPage,

        total,

        totalPages: Math.ceil(total / perPage) || 1,

      },

    };

  }



  async getById(organizationId: string, id: string) {

    const [product] = await this.db

      .select()

      .from(products)

      .where(

        and(eq(products.id, id), eq(products.organizationId, organizationId)),

      )

      .limit(1);



    if (!product) {

      throw new NotFoundException("Product not found");

    }



    return product;

  }



  async getDetail(organizationId: string, id: string) {

    const product = await this.getById(organizationId, id);



    const subProducts = await this.db

      .select()

      .from(products)

      .where(

        and(

          eq(products.organizationId, organizationId),

          eq(products.parentId, id),

          isNull(products.deletedAt),

        ),

      )

      .orderBy(asc(products.name));



    let parent = null;



    if (product.parentId) {

      const [parentRow] = await this.db

        .select({

          id: products.id,

          name: products.name,

          sku: products.sku,

        })

        .from(products)

        .where(

          and(

            eq(products.id, product.parentId),

            eq(products.organizationId, organizationId),

          ),

        )

        .limit(1);



      parent = parentRow ?? null;

    }



    return {

      ...product,

      parent,

      subProducts,

    };

  }



  async listSubProducts(organizationId: string, parentId: string) {

    await this.getById(organizationId, parentId);



    return this.db

      .select()

      .from(products)

      .where(

        and(

          eq(products.organizationId, organizationId),

          eq(products.parentId, parentId),

          isNull(products.deletedAt),

        ),

      )

      .orderBy(asc(products.name));

  }



  async suggestReference(organizationId: string, name: string) {
    const trimmedName = name?.trim();

    if (!trimmedName) {
      throw new BadRequestException("Product name is required");
    }

    const reference = await generateUniqueProductSku(
      this.db,
      organizationId,
      trimmedName,
    );

    return { reference };
  }



  async create(organizationId: string, dto: CreateProductDto) {

    if (!dto.name?.trim()) {

      throw new BadRequestException("Name is required");

    }



    if (!dto.type) {

      throw new BadRequestException("Product type is required");

    }



    if (dto.type === "service" && (dto.trackSerial || dto.isStorable)) {

      throw new BadRequestException("Service products cannot track inventory");

    }



    const usageType = dto.usageType ?? "for_sale";

    const isStorable =

      dto.type === "goods" ? (dto.isStorable ?? true) : false;

    const trackSerial =

      dto.type === "goods" && isStorable ? (dto.trackSerial ?? false) : false;



    if (dto.parentId) {

      const parent = await this.getById(organizationId, dto.parentId);



      if (parent.type !== "goods") {

        throw new BadRequestException(

          "Sub-products can only belong to goods products",

        );

      }

    }



    const equipmentRole =

      dto.equipmentRole ??

      (dto.parentId ? "component" : "general");



    if (equipmentRole === "main_equipment" && dto.parentId) {

      throw new BadRequestException(

        "Main equipment cannot have a parent product",

      );

    }



    const isRovEquipment =
      dto.isRovEquipment ??
      (equipmentRole === "main_equipment" || equipmentRole === "component");



    if (dto.initialStock?.warehouseId) {

      if (trackSerial) {

        const serials = (dto.initialStock.serialNumbers ?? [])

          .map((serial) => serial.trim())

          .filter(Boolean);

        if (serials.length === 0) {

          throw new BadRequestException(

            "Enter at least one serial number for initial stock",

          );

        }

      } else if (!dto.initialStock.quantity?.trim()) {

        throw new BadRequestException("Enter an initial quantity");

      }

    }



    if (dto.categoryId) {

      await this.assertCategory(organizationId, dto.categoryId);

    }



    const trimmedSku = dto.sku?.trim();
    let resolvedSku: string;

    if (trimmedSku) {
      const taken = await isProductSkuTaken(
        this.db,
        organizationId,
        trimmedSku,
      );
      resolvedSku = taken
        ? await generateUniqueProductSku(
            this.db,
            organizationId,
            dto.name.trim(),
          )
        : trimmedSku;
    } else {
      resolvedSku = await generateUniqueProductSku(
        this.db,
        organizationId,
        dto.name.trim(),
      );
    }



    const product = await this.db.transaction(async (tx) => {

      const [created] = await tx

        .insert(products)

        .values({

          organizationId,

          type: dto.type,

          name: dto.name.trim(),

          sku: resolvedSku,

          barcode: dto.barcode?.trim() || null,

          description: dto.description?.trim() || null,

          costPrice: dto.costPrice?.trim() || "0",

          sellingPrice: this.normalizeSellingPrice(

            usageType,

            dto.sellingPrice,

          ),

          priceCurrencyId: dto.priceCurrencyId ?? null,

          parentId: dto.parentId ?? null,

          equipmentRole,

          usageType,

          isRovEquipment,

          isStorable,

          trackSerial,

          weight: dto.weight?.trim() || null,

          volume: dto.volume?.trim() || null,

          images: [],

          tags: this.normalizeTags(dto.tags),

          categoryId: dto.categoryId ?? null,

          defaultWarrantyPolicyId: dto.defaultWarrantyPolicyId ?? null,

          isActive: dto.isActive ?? true,

        })

        .returning();



      if (dto.initialStock?.warehouseId) {

        await this.assertWarehouse(organizationId, dto.initialStock.warehouseId);



        if (created.trackSerial) {

          const serialNumbers = (dto.initialStock.serialNumbers ?? [])

            .map((serial) => serial.trim())

            .filter(Boolean);

          const unique = new Set(

            serialNumbers.map((serial) => serial.toLowerCase()),

          );

          if (unique.size !== serialNumbers.length) {

            throw new BadRequestException("Serial numbers must be unique");

          }



          if (serialNumbers.length > 0) {

            await tx.insert(productUnits).values(

              serialNumbers.map((serialNumber) => ({

                organizationId,

                productId: created.id,

                warehouseId: dto.initialStock!.warehouseId,

                serialNumber,

              })),

            );

          }

        } else {

          const nextQty = Number(dto.initialStock.quantity);

          if (!Number.isNaN(nextQty) && nextQty > 0) {

            await tx.insert(stockLevels).values({

              organizationId,

              productId: created.id,

              warehouseId: dto.initialStock.warehouseId,

              quantity: String(nextQty),

            });

          }

        }

      }



      return created;

    });



    return product;

  }



  async update(organizationId: string, id: string, dto: UpdateProductDto) {

    const existing = await this.getById(organizationId, id);



    if (dto.parentId) {

      if (dto.parentId === id) {

        throw new BadRequestException("Product cannot be its own parent");

      }



      const parent = await this.getById(organizationId, dto.parentId);



      if (parent.type !== "goods") {

        throw new BadRequestException(

          "Sub-products can only belong to goods products",

        );

      }

    }



    if (dto.categoryId) {

      await this.assertCategory(organizationId, dto.categoryId);

    }



    const nextType = dto.type ?? existing.type;

    const nextUsageType = dto.usageType ?? existing.usageType;

    const nextIsStorable =

      nextType === "goods"

        ? (dto.isStorable ?? existing.isStorable)

        : false;



    if (nextType === "service" && (dto.trackSerial || dto.isStorable)) {

      throw new BadRequestException("Service products cannot track inventory");

    }



    const nextSellingPrice =

      dto.sellingPrice !== undefined

        ? this.normalizeSellingPrice(nextUsageType, dto.sellingPrice)

        : nextUsageType === "operations"

          ? null

          : undefined;



    if (dto.sku !== undefined) {
      const trimmedSku = dto.sku?.trim();

      if (trimmedSku) {
        await assertUniqueProductSku(
          this.db,
          organizationId,
          trimmedSku,
          id,
        );
      }
    }



    const [product] = await this.db

      .update(products)

      .set({

        ...(dto.type !== undefined ? { type: dto.type } : {}),

        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),

        ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),

        ...(dto.barcode !== undefined

          ? { barcode: dto.barcode?.trim() || null }

          : {}),

        ...(dto.description !== undefined

          ? { description: dto.description?.trim() || null }

          : {}),

        ...(dto.costPrice !== undefined

          ? { costPrice: dto.costPrice?.trim() || "0" }

          : {}),

        ...(nextSellingPrice !== undefined

          ? { sellingPrice: nextSellingPrice }

          : nextUsageType === "operations" && dto.usageType !== undefined

            ? { sellingPrice: null }

            : {}),

        ...(dto.priceCurrencyId !== undefined

          ? { priceCurrencyId: dto.priceCurrencyId ?? null }

          : {}),

        ...(dto.parentId !== undefined

          ? { parentId: dto.parentId ?? null }

          : {}),

        ...(dto.equipmentRole !== undefined

          ? { equipmentRole: dto.equipmentRole }

          : {}),

        ...(dto.usageType !== undefined ? { usageType: dto.usageType } : {}),

        ...(dto.isRovEquipment !== undefined

          ? { isRovEquipment: dto.isRovEquipment }

          : {}),

        ...(dto.isStorable !== undefined || dto.type !== undefined

          ? { isStorable: nextIsStorable }

          : {}),

        ...(dto.trackSerial !== undefined ||

        dto.isStorable !== undefined ||

        dto.type !== undefined

          ? {

              trackSerial:

                nextType === "goods" && nextIsStorable

                  ? (dto.trackSerial ?? existing.trackSerial)

                  : false,

            }

          : {}),

        ...(dto.weight !== undefined

          ? { weight: dto.weight?.trim() || null }

          : {}),

        ...(dto.volume !== undefined

          ? { volume: dto.volume?.trim() || null }

          : {}),

        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),

        ...(dto.tags !== undefined

          ? { tags: this.normalizeTags(dto.tags) }

          : {}),

        ...(dto.categoryId !== undefined

          ? { categoryId: dto.categoryId ?? null }

          : {}),

        ...(dto.defaultWarrantyPolicyId !== undefined

          ? { defaultWarrantyPolicyId: dto.defaultWarrantyPolicyId ?? null }

          : {}),

        updatedAt: new Date(),

      })

      .where(

        and(eq(products.id, id), eq(products.organizationId, organizationId)),

      )

      .returning();



    return product;

  }



  async addImage(

    organizationId: string,

    id: string,

    file: Express.Multer.File,

  ) {

    const existing = await this.getById(organizationId, id);

    const imagePath = await this.uploadsService.saveProductImage(

      organizationId,

      id,

      file,

    );



    const images = [...(existing.images ?? []), imagePath];



    const [product] = await this.db

      .update(products)

      .set({ images, updatedAt: new Date() })

      .where(

        and(eq(products.id, id), eq(products.organizationId, organizationId)),

      )

      .returning();



    return product;

  }



  async removeImage(organizationId: string, id: string, imagePath: string) {

    const existing = await this.getById(organizationId, id);

    const images = (existing.images ?? []).filter((path) => path !== imagePath);



    await this.uploadsService.deleteStoredFile(imagePath);



    const [product] = await this.db

      .update(products)

      .set({ images, updatedAt: new Date() })

      .where(

        and(eq(products.id, id), eq(products.organizationId, organizationId)),

      )

      .returning();



    return product;

  }



  async archive(organizationId: string, id: string) {

    await this.getById(organizationId, id);



    const [product] = await this.db

      .update(products)

      .set({ deletedAt: new Date(), updatedAt: new Date() })

      .where(

        and(eq(products.id, id), eq(products.organizationId, organizationId)),

      )

      .returning();



    return product;

  }



  async restore(organizationId: string, id: string) {

    const [existing] = await this.db

      .select()

      .from(products)

      .where(

        and(eq(products.id, id), eq(products.organizationId, organizationId)),

      )

      .limit(1);



    if (!existing) {

      throw new NotFoundException("Product not found");

    }



    const [product] = await this.db

      .update(products)

      .set({ deletedAt: null, updatedAt: new Date() })

      .where(

        and(eq(products.id, id), eq(products.organizationId, organizationId)),

      )

      .returning();



    return product;

  }

}


