import { describe, expect, it } from "vitest";
import {
  currencyCodeToAlpha,
  PRIMARY_CURRENCY_CODE,
  selectPrimaryAccount,
  type MonobankAccount,
} from "./client";
import { generateWebhookSecretPath } from "./webhook-secret";

function account(overrides: Partial<MonobankAccount>): MonobankAccount {
  return {
    id: "acct",
    currencyCode: PRIMARY_CURRENCY_CODE,
    balance: 0,
    maskedPan: [],
    type: "black",
    ...overrides,
  };
}

describe("selectPrimaryAccount", () => {
  it("picks the UAH account among multiple currencies", () => {
    const accounts = [
      account({ id: "usd", currencyCode: 840 }),
      account({ id: "uah", currencyCode: 980 }),
      account({ id: "eur", currencyCode: 978 }),
    ];
    const { primary, isPrimaryCurrency } = selectPrimaryAccount(accounts);
    expect(primary.id).toBe("uah");
    expect(isPrimaryCurrency).toBe(true);
  });

  it("falls back to the first account when none are UAH, flagged unsupported", () => {
    const accounts = [
      account({ id: "usd", currencyCode: 840 }),
      account({ id: "eur", currencyCode: 978 }),
    ];
    const { primary, isPrimaryCurrency } = selectPrimaryAccount(accounts);
    expect(primary.id).toBe("usd");
    expect(isPrimaryCurrency).toBe(false);
  });
});

describe("currencyCodeToAlpha", () => {
  it("maps known ISO 4217 numeric codes", () => {
    expect(currencyCodeToAlpha(980)).toBe("UAH");
    expect(currencyCodeToAlpha(840)).toBe("USD");
  });

  it("falls back to the numeric code as a string for unknown currencies", () => {
    expect(currencyCodeToAlpha(999)).toBe("999");
  });
});

describe("generateWebhookSecretPath", () => {
  it("produces a 256-bit (64 hex char) unguessable value each call", () => {
    const a = generateWebhookSecretPath();
    const b = generateWebhookSecretPath();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
