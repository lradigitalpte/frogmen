import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { and, count, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  productUnits,
  products,
  stockLevels,
  warehouses,
  type Database,
} from "@frog1/db";
import type { AdjustStockDto, ListStockQuery } from "./dto/stock.dto";
import { ProductsService } from "../products/products.service";
import { WarehousesService } from "../warehouses/warehouses.service";
import { DATABASE } from "../database/database.constants";

const AVAILABLE_UNIT_STATUSES = ["in_stock"] as const;

@Injectable()
export class StockService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly productsService: ProductsService,
    private readonly warehousesService: WarehousesService,
  ) {}

  async list(organizationId: string, query: ListStockQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    const bulkFilters: SQL[] = [
      eq(stockLevels.organizationId, organizationId),
      isNull(products.deletedAt),
      isNull(warehouses.deletedAt),
    ];

    if (query.productId) {
      bulkFilters.push(eq(stockLevels.productId, query.productId));
    }

    if (query.warehouseId) {
      bulkFilters.push(eq(stockLevels.warehouseId, query.warehouseId));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      bulkFilters.push(
        or(
          ilike(products.name, term),
          ilike(products.sku, term),
        )!,
      );
    }

    const bulkWhere = and(...bulkFilters);

    const bulkRows = await this.db
      .select({
        id: stockLevels.id,
        productId: products.id,
        productName: products.name,
        productSku: products.sku,
        productType: products.type,
        trackSerial: products.trackSerial,
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        warehouseCode: warehouses.code,
        quantity: stockLevels.quantity,
        kind: sql<string>`'bulk'`.as("kind"),
        updatedAt: stockLevels.updatedAt,
      })
      .from(stockLevels)
      .innerJoin(products, eq(stockLevels.productId, products.id))
      .innerJoin(warehouses, eq(stockLevels.warehouseId, warehouses.id))
      .where(bulkWhere);

    const serializedFilters: SQL[] = [
      eq(productUnits.organizationId, organizationId),
      eq(products.trackSerial, true),
      inArray(productUnits.status, [...AVAILABLE_UNIT_STATUSES]),
      isNull(products.deletedAt),
      isNull(warehouses.deletedAt),
    ];

    if (query.productId) {
      serializedFilters.push(eq(productUnits.productId, query.productId));
    }

    if (query.warehouseId) {
      serializedFilters.push(eq(productUnits.warehouseId, query.warehouseId));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      serializedFilters.push(
        or(
          ilike(products.name, term),
          ilike(products.sku, term),
          ilike(productUnits.serialNumber, term),
        )!,
      );
    }

    const serializedRows = await this.db
      .select({
        productId: products.id,
        productName: products.name,
        productSku: products.sku,
        productType: products.type,
        trackSerial: products.trackSerial,
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        warehouseCode: warehouses.code,
        quantity: count(productUnits.id),
        serialSummary: sql<string>`string_agg(${productUnits.serialNumber}, ', ' order by ${productUnits.serialNumber})`,
        kind: sql<string>`'serialized'`.as("kind"),
        updatedAt: sql<Date>`max(${productUnits.updatedAt})`.as("updated_at"),
      })
      .from(productUnits)
      .innerJoin(products, eq(productUnits.productId, products.id))
      .innerJoin(warehouses, eq(productUnits.warehouseId, warehouses.id))
      .where(and(...serializedFilters))
      .groupBy(
        products.id,
        products.name,
        products.sku,
        products.type,
        products.trackSerial,
        warehouses.id,
        warehouses.name,
        warehouses.code,
      );

    const combined = [
      ...bulkRows.map((row) => ({
        id: row.id,
        productId: row.productId,
        productName: row.productName,
        productSku: row.productSku,
        productType: row.productType,
        trackSerial: row.trackSerial,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        warehouseCode: row.warehouseCode,
        quantity: row.quantity,
        kind: row.kind,
        updatedAt: row.updatedAt,
        serialSummary: null as string | null,
      })),
      ...serializedRows.map((row) => ({
        id: null,
        productId: row.productId,
        productName: row.productName,
        productSku: row.productSku,
        productType: row.productType,
        trackSerial: row.trackSerial,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        warehouseCode: row.warehouseCode,
        quantity: String(row.quantity),
        serialSummary: row.serialSummary || null,
        kind: row.kind,
        updatedAt: row.updatedAt,
      })),
    ].sort((a, b) => a.productName.localeCompare(b.productName));

    const total = combined.length;
    const data = combined.slice(offset, offset + perPage);

    return {
      data,
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 1,
      },
    };
  }

  async adjust(organizationId: string, dto: AdjustStockDto) {
    const product = await this.productsService.getById(
      organizationId,
      dto.productId,
    );

    if (product.type !== "goods" || !product.isStorable) {
      throw new BadRequestException("Only storable goods products have stock");
    }

    if (product.trackSerial) {
      throw new BadRequestException(
        "Serialized products use product units instead of quantity adjustments",
      );
    }

    await this.warehousesService.getById(organizationId, dto.warehouseId);

    const [existing] = await this.db
      .select()
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.organizationId, organizationId),
          eq(stockLevels.productId, dto.productId),
          eq(stockLevels.warehouseId, dto.warehouseId),
        ),
      )
      .limit(1);

    const currentQty = Number(existing?.quantity ?? 0);

    let nextQty: number;

    if (dto.quantity !== undefined) {
      nextQty = Number(dto.quantity);
    } else if (dto.adjustment !== undefined) {
      nextQty = currentQty + Number(dto.adjustment);
    } else {
      throw new BadRequestException("quantity or adjustment is required");
    }

    if (Number.isNaN(nextQty)) {
      throw new BadRequestException("Invalid quantity value");
    }

    if (nextQty < 0) {
      throw new BadRequestException("Quantity cannot be negative");
    }

    if (existing) {
      const [row] = await this.db
        .update(stockLevels)
        .set({
          quantity: String(nextQty),
          updatedAt: new Date(),
        })
        .where(eq(stockLevels.id, existing.id))
        .returning();

      return row;
    }

    const [row] = await this.db
      .insert(stockLevels)
      .values({
        organizationId,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        quantity: String(nextQty),
      })
      .returning();

    return row;
  }

  async getAvailableQuantity(
    organizationId: string,
    productId: string,
    warehouseId: string,
  ) {
    const product = await this.productsService.getById(organizationId, productId);

    if (product.trackSerial) {
      const [row] = await this.db
        .select({ total: count(productUnits.id) })
        .from(productUnits)
        .where(
          and(
            eq(productUnits.organizationId, organizationId),
            eq(productUnits.productId, productId),
            eq(productUnits.warehouseId, warehouseId),
            inArray(productUnits.status, [...AVAILABLE_UNIT_STATUSES]),
          ),
        );
      return Number(row?.total ?? 0);
    }

    const [row] = await this.db
      .select({ quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.organizationId, organizationId),
          eq(stockLevels.productId, productId),
          eq(stockLevels.warehouseId, warehouseId),
        ),
      )
      .limit(1);

    return Number(row?.quantity ?? 0);
  }

  async getProductStock(organizationId: string, productId: string) {
    const product = await this.productsService.getById(organizationId, productId);

    if (product.trackSerial) {
      const units = await this.db
        .select({
          warehouseId: warehouses.id,
          warehouseName: warehouses.name,
          warehouseCode: warehouses.code,
          unitCount: count(productUnits.id),
        })
        .from(productUnits)
        .innerJoin(warehouses, eq(productUnits.warehouseId, warehouses.id))
        .where(
          and(
            eq(productUnits.organizationId, organizationId),
            eq(productUnits.productId, productId),
            inArray(productUnits.status, [...AVAILABLE_UNIT_STATUSES]),
            isNull(warehouses.deletedAt),
          ),
        )
        .groupBy(warehouses.id, warehouses.name, warehouses.code);

      return {
        trackSerial: true,
        levels: units.map((row) => ({
          warehouseId: row.warehouseId,
          warehouseName: row.warehouseName,
          warehouseCode: row.warehouseCode,
          quantity: String(row.unitCount),
        })),
      };
    }

    const levels = await this.db
      .select({
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        warehouseCode: warehouses.code,
        quantity: stockLevels.quantity,
      })
      .from(stockLevels)
      .innerJoin(warehouses, eq(stockLevels.warehouseId, warehouses.id))
      .where(
        and(
          eq(stockLevels.organizationId, organizationId),
          eq(stockLevels.productId, productId),
          isNull(warehouses.deletedAt),
        ),
      );

    return {
      trackSerial: false,
      levels,
    };
  }
}
