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
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  currencies,
  customers,
  goodsReceiptLines,
  goodsReceipts,
  invoiceLines,
  invoicePayments,
  invoices,
  productUnits,
  products,
  purchaseOrderLines,
  purchaseOrders,
  salesOrderLines,
  salesOrders,
  vendors,
  warehouses,
  type Database,
} from "@frog1/db";
import {
  buildPoLandedUnitCostsByLineId,
  resolveDeliveryFee,
  roundMoney,
} from "@frog1/shared";
import type {
  CreateProductUnitDto,
  LinkProductUnitDto,
  ListLinkableUnitsQuery,
  ListProductUnitsQuery,
  RemoveProductUnitReason,
  UpdateProductUnitDto,
} from "./dto/product-unit.dto";
import { ProductsService } from "../products/products.service";
import { ProductCostEventsService } from "../product-cost-events/product-cost-events.service";
import { WarehousesService } from "../warehouses/warehouses.service";
import { DATABASE } from "../database/database.constants";

type UnitSaleInfo = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceState: string;
  paymentState: string;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  currencyCode: string;
  unitPrice: string;
  priceSubtotal: string;
  priceTotal: string;
  quantity: string;
  invoiceAmountTotal: string;
  quotation: {
    id: string;
    number: string;
    quoteDate: string;
    state: string;
  } | null;
  totalPaid: string;
  unitCost?: string | null;
  unitCostSource?: "invoice" | "catalog" | null;
  grossProfit?: string | null;
  profitMarginPercent?: number | null;
  payments: Array<{
    id: string;
    amount: string;
    paymentDate: string;
    method: string | null;
    reference: string | null;
    currencyCode: string;
  }>;
};

@Injectable()
export class ProductUnitsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly productsService: ProductsService,
    private readonly productCostEventsService: ProductCostEventsService,
    private readonly warehousesService: WarehousesService,
  ) {}

  async listByProduct(
    organizationId: string,
    productId: string,
    query: ListProductUnitsQuery,
  ) {
    const product = await this.productsService.getById(organizationId, productId);
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.perPage ?? 16, 1), 100);
    const offset = (page - 1) * perPage;

    // Quantity-tracked products have no serial units — return empty instead of 400
    // so product detail / picker pages can call this safely.
    if (!product.trackSerial) {
      return {
        data: [],
        meta: {
          page,
          perPage,
          total: 0,
          totalPages: 1,
        },
      };
    }

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

  async getById(
    organizationId: string,
    id: string,
    options: { canViewCost?: boolean } = {},
  ) {
    const canViewCost = options.canViewCost ?? false;
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
        productCostPrice: products.costPrice,
        productSellingPrice: products.sellingPrice,
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
        costPrice: products.costPrice,
        sellingPrice: products.sellingPrice,
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

    let saleInfo: UnitSaleInfo | null = null;
    const targetUnitIdForSale = unit.parentUnitId ?? unit.id;

    // Find invoice line linked to this unit or parent unit
    const [invLine] = await this.db
      .select({
        invoiceId: invoiceLines.invoiceId,
        unitPrice: invoiceLines.unitPrice,
        priceSubtotal: invoiceLines.priceSubtotal,
        priceTotal: invoiceLines.priceTotal,
        quantity: invoiceLines.quantity,
        costAmount: invoiceLines.costAmount,
        salesOrderLineId: invoiceLines.salesOrderLineId,
      })
      .from(invoiceLines)
      .where(eq(invoiceLines.productUnitId, targetUnitIdForSale))
      .limit(1);

    if (invLine?.invoiceId) {
      const [inv] = await this.db
        .select({
          id: invoices.id,
          number: invoices.number,
          state: invoices.state,
          paymentState: invoices.paymentState,
          invoiceDate: invoices.invoiceDate,
          amountTotal: invoices.amountTotal,
          customerId: invoices.customerId,
          customerName: customers.name,
          currencyCode: currencies.code,
          salesOrderId: invoices.salesOrderId,
        })
        .from(invoices)
        .innerJoin(customers, eq(customers.id, invoices.customerId))
        .innerJoin(currencies, eq(currencies.id, invoices.currencyId))
        .where(
          and(
            eq(invoices.id, invLine.invoiceId),
            eq(invoices.organizationId, organizationId),
            isNull(invoices.deletedAt),
          ),
        )
        .limit(1);

      if (inv) {
        let quotationInfo = null;
        if (inv.salesOrderId) {
          const [so] = await this.db
            .select({
              id: salesOrders.id,
              number: salesOrders.number,
              quoteDate: salesOrders.quoteDate,
              state: salesOrders.state,
            })
            .from(salesOrders)
            .where(eq(salesOrders.id, inv.salesOrderId))
            .limit(1);
          if (so) {
            quotationInfo = {
              id: so.id,
              number: so.number,
              quoteDate: so.quoteDate,
              state: so.state,
            };
          }
        }

        // Fetch payments for invoice
        const payments = await this.db
          .select({
            id: invoicePayments.id,
            amount: invoicePayments.amount,
            paymentDate: invoicePayments.paymentDate,
            method: invoicePayments.method,
            reference: invoicePayments.reference,
            currencyCode: currencies.code,
          })
          .from(invoicePayments)
          .innerJoin(currencies, eq(currencies.id, invoicePayments.currencyId))
          .where(eq(invoicePayments.invoiceId, inv.id))
          .orderBy(desc(invoicePayments.paymentDate));

        const totalPaid = payments.reduce(
          (sum, p) => sum + (Number(p.amount) || 0),
          0,
        );

        const quantity = Number(invLine.quantity) || 1;
        const priceSubtotal = Number(invLine.priceSubtotal);
        const unitRevenue =
          quantity > 0 ? roundMoney(priceSubtotal / quantity) : 0;
        const invoiceCostAmount =
          invLine.costAmount != null ? Number(invLine.costAmount) : null;
        const catalogCostPrice =
          unit.productCostPrice != null ? Number(unit.productCostPrice) : null;

        let unitCost: number | null = null;
        let unitCostSource: "invoice" | "catalog" | null = null;

        if (invoiceCostAmount != null && invoiceCostAmount > 0) {
          unitCost = roundMoney(invoiceCostAmount / quantity);
          unitCostSource = "invoice";
        } else if (catalogCostPrice != null && catalogCostPrice > 0) {
          unitCost = roundMoney(catalogCostPrice);
          unitCostSource = "catalog";
        }

        let grossProfit: number | null = null;
        let profitMarginPercent: number | null = null;

        if (unitCost != null && unitRevenue > 0) {
          grossProfit = roundMoney(unitRevenue - unitCost);
          profitMarginPercent = roundMoney((grossProfit / unitRevenue) * 100);
        }

        saleInfo = {
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          invoiceState: inv.state,
          paymentState: inv.paymentState,
          invoiceDate: inv.invoiceDate,
          customerId: inv.customerId,
          customerName: inv.customerName,
          currencyCode: inv.currencyCode?.trim() ?? "AED",
          unitPrice: String(invLine.unitPrice),
          priceSubtotal: String(invLine.priceSubtotal),
          priceTotal: String(invLine.priceTotal),
          quantity: String(quantity),
          invoiceAmountTotal: String(inv.amountTotal),
          quotation: quotationInfo,
          totalPaid: String(totalPaid),
          unitCost: unitCost != null ? String(unitCost) : null,
          unitCostSource,
          grossProfit: grossProfit != null ? String(grossProfit) : null,
          profitMarginPercent,
          payments: payments.map((p) => ({
            id: p.id,
            amount: String(p.amount),
            paymentDate: p.paymentDate,
            method: p.method ?? null,
            reference: p.reference ?? null,
            currencyCode: p.currencyCode?.trim() ?? "AED",
          })),
        };
      }
    }

    const { productCostPrice, ...unitData } = unit;

    const mappedChildUnits = childUnits.map((child) => {
      const base = {
        id: child.id,
        serialNumber: child.serialNumber,
        productId: child.productId,
        productName: child.productName,
        status: child.status,
        linkedAt: child.linkedAt,
      };

      if (!canViewCost) {
        return base;
      }

      const cost = child.costPrice != null ? Number(child.costPrice) : null;
      const sell =
        child.sellingPrice != null ? Number(child.sellingPrice) : null;
      const catalogMarginPercent =
        cost != null && sell != null && sell > 0
          ? roundMoney(((sell - cost) / sell) * 100)
          : null;

      return {
        ...base,
        costPrice: child.costPrice,
        sellingPrice: child.sellingPrice,
        catalogMarginPercent,
      };
    });

    let sanitizedSaleInfo = saleInfo;
    if (saleInfo && !canViewCost) {
      const {
        unitCost: _unitCost,
        unitCostSource: _unitCostSource,
        grossProfit: _grossProfit,
        profitMarginPercent: _profitMarginPercent,
        ...publicSaleInfo
      } = saleInfo;
      sanitizedSaleInfo = publicSaleInfo;
    }

    const costBreakdown = canViewCost
      ? await this.buildCostBreakdown(
          organizationId,
          {
            id: unitData.id,
            productId: unitData.productId,
            serialNumber: unitData.serialNumber,
            productCostPrice,
            productSellingPrice: unit.productSellingPrice,
          },
          saleInfo,
        )
      : null;

    const costHistory = canViewCost
      ? await this.productCostEventsService.listForUnit(organizationId, {
          id: unitData.id,
          productId: unitData.productId,
        })
      : null;

    return {
      ...unitData,
      parentUnit,
      childUnits: mappedChildUnits,
      saleInfo: sanitizedSaleInfo,
      costBreakdown,
      costHistory,
    };
  }

  private async buildCostBreakdown(
    organizationId: string,
    unit: {
      id: string;
      productId: string;
      serialNumber: string;
      productCostPrice: string | null;
      productSellingPrice?: string | null;
    },
    saleInfo: UnitSaleInfo | null,
  ) {
    const notes: string[] = [];
    const currentUnitCost =
      unit.productCostPrice != null ? String(unit.productCostPrice) : null;

    const receiptRows = await this.db
      .select({
        receiptId: goodsReceipts.id,
        receiptNumber: goodsReceipts.number,
        validatedAt: goodsReceipts.validatedAt,
        serialNumbers: goodsReceiptLines.serialNumbers,
        poLineId: purchaseOrderLines.id,
        poLineUnitPrice: purchaseOrderLines.unitPrice,
        poLineSubtotal: purchaseOrderLines.priceSubtotal,
        poLineQuantity: purchaseOrderLines.quantity,
        purchaseOrderId: purchaseOrders.id,
        purchaseOrderNumber: purchaseOrders.number,
        freightAmount: purchaseOrders.freightAmount,
        freightPercent: purchaseOrders.freightPercent,
        otherChargesAmount: purchaseOrders.otherChargesAmount,
        vendorName: vendors.name,
        currencyCode: currencies.code,
      })
      .from(goodsReceiptLines)
      .innerJoin(
        goodsReceipts,
        eq(goodsReceiptLines.goodsReceiptId, goodsReceipts.id),
      )
      .innerJoin(
        purchaseOrderLines,
        eq(goodsReceiptLines.purchaseOrderLineId, purchaseOrderLines.id),
      )
      .innerJoin(
        purchaseOrders,
        eq(goodsReceipts.purchaseOrderId, purchaseOrders.id),
      )
      .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .innerJoin(currencies, eq(purchaseOrders.currencyId, currencies.id))
      .where(
        and(
          eq(goodsReceipts.organizationId, organizationId),
          eq(goodsReceipts.state, "done"),
          eq(goodsReceiptLines.productId, unit.productId),
        ),
      )
      .orderBy(desc(goodsReceipts.validatedAt));

    const serialMatch = receiptRows.find((row) =>
      (row.serialNumbers ?? []).some(
        (serial) => serial.trim() === unit.serialNumber.trim(),
      ),
    );
    const purchaseRow = serialMatch ?? receiptRows[0] ?? null;

    let purchase: Record<string, unknown> | null = null;
    let currencyCode =
      (saleInfo?.currencyCode as string | undefined)?.trim() ?? "AED";

    if (purchaseRow) {
      currencyCode = purchaseRow.currencyCode?.trim() ?? currencyCode;

      const poLines = await this.db
        .select({
          id: purchaseOrderLines.id,
          priceSubtotal: purchaseOrderLines.priceSubtotal,
          unitPrice: purchaseOrderLines.unitPrice,
          quantity: purchaseOrderLines.quantity,
        })
        .from(purchaseOrderLines)
        .where(
          eq(purchaseOrderLines.purchaseOrderId, purchaseRow.purchaseOrderId),
        );

      const landedByLineId = buildPoLandedUnitCostsByLineId(poLines, {
        freightAmount: purchaseRow.freightAmount,
        freightPercent: purchaseRow.freightPercent,
        otherChargesAmount: purchaseRow.otherChargesAmount,
      });

      const lineNet = poLines.reduce(
        (sum, line) => sum + Number(line.priceSubtotal),
        0,
      );
      const freight = resolveDeliveryFee(
        lineNet,
        purchaseRow.freightAmount,
        purchaseRow.freightPercent,
      );
      const other = Number(purchaseRow.otherChargesAmount ?? 0) || 0;
      const quantity = Number(purchaseRow.poLineQuantity) || 1;
      const lineSubtotal = Number(purchaseRow.poLineSubtotal);
      const lineShare = lineNet > 0 ? lineSubtotal / lineNet : 0;
      const freightAllocated = roundMoney((freight * lineShare) / quantity);
      const otherAllocated = roundMoney((other * lineShare) / quantity);
      const landedUnitCost =
        landedByLineId.get(purchaseRow.poLineId) ??
        Number(purchaseRow.poLineUnitPrice);

      purchase = {
        purchaseOrderId: purchaseRow.purchaseOrderId,
        purchaseOrderNumber: purchaseRow.purchaseOrderNumber,
        vendorName: purchaseRow.vendorName,
        goodsReceiptId: purchaseRow.receiptId,
        goodsReceiptNumber: purchaseRow.receiptNumber,
        receivedAt: purchaseRow.validatedAt?.toISOString() ?? null,
        matchedBySerial: Boolean(serialMatch),
        lineUnitPrice: purchaseRow.poLineUnitPrice,
        freightAllocated: String(freightAllocated),
        otherChargesAllocated: String(otherAllocated),
        landedUnitCost: String(landedUnitCost),
      };

      if (!serialMatch) {
        notes.push(
          "Receipt matched by product — serial was not listed on the goods receipt line.",
        );
      }
    } else if (currentUnitCost) {
      notes.push(
        "No validated goods receipt found — showing catalog cost only.",
      );
    }

    let sale: Record<string, unknown> | null = null;
    if (saleInfo) {
      const netUnitRevenue = roundMoney(
        Number(saleInfo.priceSubtotal) /
          (Number(saleInfo.quantity as string) || 1),
      );
      const invoiceUnitCost =
        saleInfo.unitCostSource === "invoice" && saleInfo.unitCost
          ? Number(saleInfo.unitCost)
          : null;
      const landedUnitCost =
        purchase?.landedUnitCost != null
          ? Number(purchase.landedUnitCost as string)
          : null;
      const marginUnitCost =
        landedUnitCost ??
        invoiceUnitCost ??
        (saleInfo.unitCost ? Number(saleInfo.unitCost) : null);

      let unitCostSource: "landed" | "invoice" | "catalog" | null = null;
      if (landedUnitCost != null) {
        unitCostSource = "landed";
      } else if (invoiceUnitCost != null) {
        unitCostSource = "invoice";
      } else {
        unitCostSource = saleInfo.unitCostSource ?? null;
      }

      let grossProfit: number | null = null;
      let profitMarginPercent: number | null = null;
      if (marginUnitCost != null && netUnitRevenue > 0) {
        grossProfit = roundMoney(netUnitRevenue - marginUnitCost);
        profitMarginPercent = roundMoney((grossProfit / netUnitRevenue) * 100);
      }

      sale = {
        invoiceId: saleInfo.invoiceId,
        invoiceNumber: saleInfo.invoiceNumber,
        invoiceDate: saleInfo.invoiceDate,
        unitSalePrice: saleInfo.unitPrice,
        netUnitRevenue: String(netUnitRevenue),
        unitCost: marginUnitCost != null ? String(marginUnitCost) : null,
        unitCostSource,
        invoiceUnitCost:
          invoiceUnitCost != null ? String(roundMoney(invoiceUnitCost)) : null,
        grossProfit: grossProfit != null ? String(grossProfit) : null,
        profitMarginPercent,
        quotationNumber:
          (saleInfo.quotation as { number?: string } | null | undefined)
            ?.number ?? null,
      };

      if (
        invoiceUnitCost != null &&
        landedUnitCost != null &&
        invoiceUnitCost !== landedUnitCost
      ) {
        notes.push(
          `Invoice COGS (${roundMoney(invoiceUnitCost).toFixed(2)}) differs from landed cost (${roundMoney(landedUnitCost).toFixed(2)}) — margin uses landed cost from receipt.`,
        );
      } else if (saleInfo.unitCostSource === "catalog") {
        notes.push(
          "Sale margin uses catalog cost — post the invoice to freeze COGS on the line.",
        );
      }
    }

    let estimatedMargin: Record<string, unknown> | null = null;
    if (!saleInfo) {
      const listPrice =
        unit.productSellingPrice != null
          ? Number(unit.productSellingPrice)
          : null;
      const unitCost =
        purchase?.landedUnitCost != null
          ? Number(purchase.landedUnitCost as string)
          : currentUnitCost != null
            ? Number(currentUnitCost)
            : null;

      if (listPrice != null && listPrice > 0 && unitCost != null) {
        const grossProfit = roundMoney(listPrice - unitCost);
        estimatedMargin = {
          catalogListPrice: String(listPrice),
          unitCost: String(unitCost),
          grossProfit: String(grossProfit),
          profitMarginPercent: roundMoney((grossProfit / listPrice) * 100),
        };
        notes.push(
          "Not sold yet — estimated margin uses catalog list price vs landed cost. Actual profit appears after you invoice this serial.",
        );
      } else if (!saleInfo) {
        notes.push(
          "Not sold yet — gross profit and margin appear here after this serial is on a posted invoice.",
        );
      }
    }

    return {
      currencyCode,
      currentUnitCost,
      purchase,
      sale,
      estimatedMargin,
      notes,
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

    const serialNumber = dto.serialNumber.trim();
    const [activeSerial] = await this.db
      .select({ id: productUnits.id })
      .from(productUnits)
      .where(
        and(
          eq(productUnits.organizationId, organizationId),
          eq(productUnits.serialNumber, serialNumber),
          inArray(productUnits.status, ["in_stock", "assigned", "sold"]),
        ),
      )
      .limit(1);

    if (activeSerial) {
      throw new BadRequestException(
        "Serial number is already used (in stock, assigned, or sold)",
      );
    }

    try {
      const [unit] = await this.db
        .insert(productUnits)
        .values({
          organizationId,
          productId,
          warehouseId: dto.warehouseId,
          serialNumber,
          parentUnitId: dto.parentUnitId ?? null,
          linkedAt: dto.parentUnitId ? new Date() : null,
          notes: dto.notes?.trim() || null,
        })
        .returning();

      return unit;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new BadRequestException(
          "Serial number is already used (in stock, assigned, or sold)",
        );
      }
      throw error;
    }
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

  async remove(
    organizationId: string,
    id: string,
    reason: RemoveProductUnitReason = "scrapped",
  ) {
    const unit = await this.getById(organizationId, id);

    if (unit.status === "sold" || unit.status === "scrapped") {
      throw new BadRequestException(
        `Serial is already marked as ${unit.status}`,
      );
    }

    const nextStatus: RemoveProductUnitReason =
      reason === "sold" ? "sold" : "scrapped";

    const [updated] = await this.db
      .update(productUnits)
      .set({
        status: nextStatus,
        parentUnitId: null,
        linkedAt: null,
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
