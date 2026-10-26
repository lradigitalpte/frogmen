import { describe, expect, it } from "vitest";
import {
  filterDocumentBankAccountsForCurrency,
  resolveDocumentBankAccountsForPayment,
  type DocumentBankAccount,
} from "./document-payment-details";

const aedAccount: DocumentBankAccount = {
  id: "aed-1",
  name: "Frogmen AED",
  bankName: "Mashreq",
  accountNumber: null,
  iban: "AE560330000019101375626",
  swiftCode: null,
  currencyCode: "AED",
};

const aedAccountAlt: DocumentBankAccount = {
  id: "aed-2",
  name: "Frogmen AED Alt",
  bankName: "ENBD",
  accountNumber: null,
  iban: "AE560330000019101375999",
  swiftCode: null,
  currencyCode: "AED",
  isDefault: true,
};

const usdAccount: DocumentBankAccount = {
  id: "usd-1",
  name: "Frogmen USD",
  bankName: "Mashreq",
  accountNumber: null,
  iban: "AE290330000019101375627",
  swiftCode: null,
  currencyCode: "USD",
};

describe("filterDocumentBankAccountsForCurrency", () => {
  it("returns only accounts matching the document currency", () => {
    expect(
      filterDocumentBankAccountsForCurrency(
        [aedAccount, usdAccount],
        "AED",
      ),
    ).toEqual([aedAccount]);

    expect(
      filterDocumentBankAccountsForCurrency(
        [aedAccount, usdAccount],
        "usd",
      ),
    ).toEqual([usdAccount]);
  });

  it("returns no accounts when currency does not match", () => {
    expect(
      filterDocumentBankAccountsForCurrency(
        [aedAccount, usdAccount],
        "EUR",
      ),
    ).toEqual([]);
  });
});

describe("resolveDocumentBankAccountsForPayment", () => {
  it("returns the selected account when an id is provided", () => {
    expect(
      resolveDocumentBankAccountsForPayment({
        accounts: [aedAccount, usdAccount],
        currencyCode: "AED",
        selectedBankAccountId: "aed-1",
      }),
    ).toEqual([aedAccount]);
  });

  it("returns the sole currency match when unambiguous", () => {
    expect(
      resolveDocumentBankAccountsForPayment({
        accounts: [aedAccount, usdAccount],
        currencyCode: "AED",
      }),
    ).toEqual([aedAccount]);
  });

  it("returns the default when several accounts share the currency", () => {
    expect(
      resolveDocumentBankAccountsForPayment({
        accounts: [aedAccount, aedAccountAlt, usdAccount],
        currencyCode: "AED",
      }),
    ).toEqual([aedAccountAlt]);
  });

  it("returns empty when several currency matches exist without a default", () => {
    expect(
      resolveDocumentBankAccountsForPayment({
        accounts: [
          aedAccount,
          { ...aedAccountAlt, id: "aed-2", isDefault: false },
        ],
        currencyCode: "AED",
      }),
    ).toEqual([]);
  });

  it("returns empty when no document bank matches the currency", () => {
    expect(
      resolveDocumentBankAccountsForPayment({
        accounts: [aedAccount, usdAccount],
        currencyCode: "EUR",
      }),
    ).toEqual([]);
  });
});
