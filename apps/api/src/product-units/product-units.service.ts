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
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { productUnits, products, warehouses, type Database } from "@frog1/db";
import type {
  CreateProductUnitDto,
  LinkProductUnitDto,
  ListLinkableUnitsQuery,
  ListProductUnitsQuery,
  UpdateProductUnitDto,
} from "./dto/product-unit.dto";
import { ProductsService } from "../products/products.service";
import { WarehousesService } from "../warehouses/warehouses.service";
import { DATABASE } from "../database/database.constants";

@Injectable()
export class ProductUnitsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly productsService: ProductsService,
    private readonly warehousesService: WarehousesService,
  ) {}

  async listByProduct(
    organizationId: string,
    productId: string,
    query: ListProductUnitsQuery,
  ) {
    const product = await this.productsService.getById(organizationId, productId);

    if (!product.trackSerial) {
      throw new BadRequestException("This product does not track serial numbers");
    }

    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(productUnits.organizationId, organizationId),
      eq(productUnits.productId, productId),
    ];

    if (query.warehouseId) {
      filters.push(eq(productUnits.warehouseId, query.warehouseId));
    }

    if (query.status) {
      filters.push(eq(productUnits.status, query.status));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(productUnits.serialNumber, term),
          ilike(productUnits.notes, term),
        )!,
      );
    }

    const whereClause = and(...filters);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select({
          id: productUnits.id,
          organizationId: productUnits.organizationId,
          productId: productUnits.productId,
          warehouseId: productUnits.warehouseId,
          serialNumber: productUnits.serialNumber,
          parentUnitId: productUnits.parentUnitId,
          status: productUnits.status,
          linkedAt: productUnits.linkedAt,
          notes: productUnits.notes,
          createdAt: productUnits.createdAt,
          updatedAt: productUnits.updatedAt,
          warehouseName: warehouses.name,
          warehouseCode: warehouses.code,
        })
        .from(productUnits)
        .innerJoin(warehouses, eq(productUnits.warehouseId, warehouses.id))
        .where(whereClause)
        .orderBy(desc(productUnits.createdAt))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(productUnits)
        .where(whereClause),
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

  async listLinkable(
    organizationId: string,
    query: ListLinkableUnitsQuery,
  ) {
    const parentProductId = query.parentProductId?.trim();

    if (!parentProductId) {
      throw new BadRequestException("parentProductId is required");
    }

    await this.productsService.getById(organizationId, parentProductId);

    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 25, 1), 100);
    const offset = (page - 1) * perPage;

    const filters: SQL[] = [
      eq(productUnits.organizationId, organizationId),
      isNull(productUnits.parentUnitId),
      isNull(products.deletedAt),
      eq(products.trackSerial, true),
      ne(products.id, parentProductId),
      ne(products.equipmentRole, "main_equipment"),
    ];

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(
        or(
          ilike(productUnits.serialNumber, term),
          ilike(products.name, term),
          ilike(products.sku, term),
        )!,
      );
    }

    const whereClause = and(...filters);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select({
          id: productUnits.id,
          serialNumber: productUnits.serialNumber,
          productId: products.id,
          productName: products.name,
          productSku: products.sku,
          warehouseName: warehouses.name,
          status: productUnits.status,
          parentUnitId: productUnits.parentUnitId,
          isSubProduct: sql<boolean>`${products.parentId} = ${parentProductId}`,
        })
        .from(productUnits)
        .innerJoin(products, eq(productUnits.productId, products.id))
        .innerJoin(warehouses, eq(productUnits.warehouseId, warehouses.id))
        .where(whereClause)
        .orderBy(asc(products.name), asc(productUnits.serialNumber))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(productUnits)
        .innerJoin(products, eq(productUnits.productId, products.id))
        .where(whereClause),
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
    const [unit] = await this.db
      .select({
        id: productUnits.id,
        organizationId: productUnits.organizationId,
        productId: productUnits.productId,
        warehouseId: productUnits.warehouseId,
        serialNumber: productUnits.serialNumber,
        parentUnitId: productUnits.parentUnitId,
        status: productUnits.status,
        linkedAt: productUnits.linkedAt,
        notes: productUnits.notes,
        createdAt: productUnits.createdAt,
        updatedAt: productUnits.updatedAt,
        productName: products.name,
        productSku: products.sku,
        warehouseName: warehouses.name,
        warehouseCode: warehouses.code,
      })
      .from(productUnits)
      .innerJoin(products, eq(productUnits.productId, products.id))
      .innerJoin(warehouses, eq(productUnits.warehouseId, warehouses.id))
      .where(
        and(
          eq(productUnits.id, id),
          eq(productUnits.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!unit) {
      throw new NotFoundException("Product unit not found");
    }

    let parentUnit = null;

    if (unit.parentUnitId) {
      const [parent] = await this.db
        .select({
          id: productUnits.id,
          serialNumber: productUnits.serialNumber,
          productId: productUnits.productId,
          productName: products.name,
        })
        .from(productUnits)
        .innerJoin(products, eq(productUnits.productId, products.id))
        .where(
          and(
            eq(productUnits.id, unit.parentUnitId),
            eq(productUnits.organizationId, organizationId),
          ),
        )
        .limit(1);

      parentUnit = parent ?? null;
    }

    const childUnits = await this.db
      .select({
        id: productUnits.id,
        serialNumber: productUnits.serialNumber,
        productId: productUnits.productId,
        productName: products.name,
        status: productUnits.status,
        linkedAt: productUnits.linkedAt,
      })
      .from(productUnits)
      .innerJoin(products, eq(productUnits.productId, products.id))
      .where(
        and(
          eq(productUnits.parentUnitId, id),
          eq(productUnits.organizationId, organizationId),
        ),
      )
      .orderBy(asc(products.name));

    return {
      ...unit,
      parentUnit,
      childUnits,
    };
  }

  async create(
    organizationId: string,
    productId: string,
    dto: CreateProductUnitDto,
  ) {
    const product = await this.productsService.getById(organizationId, productId);

    if (product.type !== "goods" || !product.isStorable || !product.trackSerial) {
      throw new BadRequestException(
        "Only serialized storable goods products can have units",
      );
    }

    if (!dto.serialNumber?.trim()) {
      throw new BadRequestException("Serial number is required");
    }

    await this.warehousesService.getById(organizationId, dto.warehouseId);

    if (dto.parentUnitId) {
      await this.validateParentLink(
        organizationId,
        product,
        dto.parentUnitId,
      );
    }

    const [unit] = await this.db
      .insert(productUnits)
      .values({
        organizationId,
        productId,
        warehouseId: dto.warehouseId,
        serialNumber: dto.serialNumber.trim(),
        parentUnitId: dto.parentUnitId ?? null,
        linkedAt: dto.parentUnitId ? new Date() : null,
        notes: dto.notes?.trim() || null,
      })
      .returning();

    return unit;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateProductUnitDto,
  ) {
    await this.getById(organizationId, id);

    if (dto.warehouseId) {
      await this.warehousesService.getById(organizationId, dto.warehouseId);
    }

    const [unit] = await this.db
      .update(productUnits)
      .set({
        ...(dto.warehouseId !== undefined
          ? { warehouseId: dto.warehouseId }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productUnits.id, id),
          eq(productUnits.organizationId, organizationId),
        ),
      )
      .returning();

    return unit;
  }

  async link(
    organizationId: string,
    id: string,
    dto: LinkProductUnitDto,
  ) {
    const unit = await this.getById(organizationId, id);
    let childProduct = await this.productsService.getById(
      organizationId,
      unit.productId,
    );
    const parentUnit = await this.getById(organizationId, dto.parentUnitId);
    const parentProduct = await this.productsService.getById(
      organizationId,
      parentUnit.productId,
    );

    if (
      childProduct.parentId &&
      childProduct.parentId !== parentProduct.id
    ) {
      throw new BadRequestException(
        "This part belongs to a different main product",
      );
    }

    if (!childProduct.parentId && childProduct.id !== parentProduct.id) {
      await this.productsService.update(organizationId, childProduct.id, {
        parentId: parentProduct.id,
        equipmentRole: "component",
      });
      childProduct = await this.productsService.getById(
        organizationId,
        unit.productId,
      );
    }

    await this.validateParentLink(
      organizationId,
      childProduct,
      dto.parentUnitId,
      id,
    );

    const [updated] = await this.db
      .update(productUnits)
      .set({
        parentUnitId: dto.parentUnitId,
        linkedAt: new Date(),
        status: "assigned",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productUnits.id, id),
          eq(productUnits.organizationId, organizationId),
        ),
      )
      .returning();

    return updated;
  }

  async unlink(organizationId: string, id: string) {
    await this.getById(organizationId, id);

    const [updated] = await this.db
      .update(productUnits)
      .set({
        parentUnitId: null,
        linkedAt: null,
        status: "in_stock",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productUnits.id, id),
          eq(productUnits.organizationId, organizationId),
        ),
      )
      .returning();

    return updated;
  }

  async remove(organizationId: string, id: string) {
    await this.getById(organizationId, id);

    const [updated] = await this.db
      .update(productUnits)
      .set({
        status: "scrapped",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productUnits.id, id),
          eq(productUnits.organizationId, organizationId),
        ),
      )
      .returning();

    return updated;
  }

  private async validateParentLink(
    organizationId: string,
    childProduct: { id: string; parentId: string | null },
    parentUnitId: string,
    childUnitId?: string,
  ) {
    if (childUnitId && parentUnitId === childUnitId) {
      throw new BadRequestException("Unit cannot be linked to itself");
    }

    const parentUnit = await this.getById(organizationId, parentUnitId);
    const parentProduct = await this.productsService.getById(
      organizationId,
      parentUnit.productId,
    );

    if (!parentProduct.trackSerial) {
      throw new BadRequestException("Parent unit must be a serialized product");
    }

    if (
      childProduct.parentId &&
      childProduct.parentId !== parentProduct.id
    ) {
      throw new BadRequestException(
        "This sub-product does not belong to the parent product",
      );
    }

    if (!childProduct.parentId && parentProduct.id === childProduct.id) {
      return;
    }

    if (childProduct.parentId !== parentProduct.id) {
      throw new BadRequestException(
        "Sub-product must belong to the parent product",
      );
    }
  }
}
