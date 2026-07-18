const BASE_URL = "https://api.monobank.ua";

export class MonobankApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type MonobankAccount = {
  id: string;
  currencyCode: number;
  balance: number;
  maskedPan: string[];
  type: string;
};

export type MonobankClientInfo = {
  clientId: string;
  name: string;
  webHookUrl?: string;
  accounts: MonobankAccount[];
};

export type MonobankStatementItem = {
  id: string;
  time: number;
  description: string;
  mcc: number;
  amount: number;
  currencyCode: number;
};

async function monobankRequest<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "X-Token": token, ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new MonobankApiError(
      `Monobank API error (${response.status}): ${body || response.statusText}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/** Validates the token and returns the user's accounts/jars. */
export function getClientInfo(token: string): Promise<MonobankClientInfo> {
  return monobankRequest<MonobankClientInfo>("/personal/client-info", token);
}

/**
 * Fetches statement items for one account over [from, to] (unix seconds).
 * Monobank caps the range at 31 days + 1 hour and rate-limits to one
 * request per 60 seconds per token — callers must not fire these
 * concurrently for the same token.
 */
export function getStatement(
  token: string,
  accountId: string,
  from: number,
  to: number,
): Promise<MonobankStatementItem[]> {
  return monobankRequest<MonobankStatementItem[]>(
    `/personal/statement/${accountId}/${from}/${to}`,
    token,
  );
}

/** Registers (or replaces) the webhook URL Monobank sends new transactions to. */
export function setWebHook(token: string, webHookUrl: string): Promise<void> {
  return monobankRequest<void>("/personal/webhook", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webHookUrl }),
  });
}

/** Ukraine's ISO 4217 numeric currency code — the "primary currency" jar. */
export const PRIMARY_CURRENCY_CODE = 980;

const ISO_4217_NUMERIC_TO_ALPHA: Record<number, string> = {
  980: "UAH",
  840: "USD",
  978: "EUR",
  826: "GBP",
  985: "PLN",
};

/** Falls back to the numeric code itself for currencies outside the map above. */
export function currencyCodeToAlpha(numericCode: number): string {
  return ISO_4217_NUMERIC_TO_ALPHA[numericCode] ?? String(numericCode);
}

/**
 * Picks the primary-currency account among a client's jars/cards. Falls
 * back to the first account if none match, so a user with only
 * non-primary-currency accounts still gets a (flagged) connection rather
 * than a hard failure.
 */
export function selectPrimaryAccount(accounts: MonobankAccount[]): {
  primary: MonobankAccount;
  isPrimaryCurrency: boolean;
} {
  const primaryCurrencyAccount = accounts.find(
    (account) => account.currencyCode === PRIMARY_CURRENCY_CODE,
  );
  if (primaryCurrencyAccount) {
    return { primary: primaryCurrencyAccount, isPrimaryCurrency: true };
  }
  return { primary: accounts[0], isPrimaryCurrency: false };
}
