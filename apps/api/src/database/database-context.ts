import { AsyncLocalStorage } from "node:async_hooks";
import type { Database } from "@frog1/db";

export const databaseContext: AsyncLocalStorage<unknown> =
  new AsyncLocalStorage<unknown>();

export function createContextualDatabase(database: Database): Database {
  return new Proxy(database, {
    get(target, property, receiver) {
      const active = (databaseContext.getStore() as Database | undefined) ?? target;
      const value = Reflect.get(active, property, receiver);
      return typeof value === "function" ? value.bind(active) : value;
    },
  });
}
