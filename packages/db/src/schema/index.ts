export * from "./auth";
export * from "./security";
export * from "./currencies";
export * from "./customers";
export * from "./vendors";
export * from "./warehouses";
export * from "./products";
export * from "./product-tags";
export * from "./product-categories";
export * from "./stock-levels";
export * from "./product-units";
export * from "./sales";
export * from "./purchasing";
export * from "./accounting";
export * from "./bank-accounts";
export * from "./warranty";
export * from "./expenses";
export * from "./rov-inspection";

import * as auth from "./auth";
import * as security from "./security";
import * as currencies from "./currencies";
import * as customers from "./customers";
import * as vendors from "./vendors";
import * as warehouses from "./warehouses";
import * as products from "./products";
import * as productTags from "./product-tags";
import * as productCategories from "./product-categories";
import * as stockLevels from "./stock-levels";
import * as productUnits from "./product-units";
import * as sales from "./sales";
import * as purchasing from "./purchasing";
import * as accounting from "./accounting";
import * as bankAccounts from "./bank-accounts";
import * as warranty from "./warranty";
import * as expenses from "./expenses";
import * as rovInspection from "./rov-inspection";

export const schema = {
  ...auth,
  ...security,
  ...currencies,
  ...customers,
  ...vendors,
  ...warehouses,
  ...products,
  ...productTags,
  ...productCategories,
  ...stockLevels,
  ...productUnits,
  ...sales,
  ...purchasing,
  ...accounting,
  ...bankAccounts,
  ...warranty,
  ...expenses,
  ...rovInspection,
};
