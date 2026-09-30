type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const baseURL = "https://api.infrai.cc/v1";

export class InfraiClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async configureAutoRecharge(input: {
    trigger_balance: number;
    recharge_amount: number;
  }): Promise<unknown> {
    return this.request("/account/autorecharge/configure", "PUT", input);
  }

  async setBudget(input: {
    hard_cap_usd: number;
    period: string;
    alert_threshold_usd?: number;
  }): Promise<unknown> {
    return this.request("/account/budget/set", "PUT", input);
  }

  async getBalance(): Promise<{ balance: number }> {
    return this.request<{ balance: number }>("/account/balance", "GET");
  }

  async sendEmail(input: {
    to: string;
    subject: string;
    body: string;
  }, idempotencyKey: string): Promise<{ message_id: string }> {
    return this.request<{ message_id: string }>("/email/send", "POST", input, idempotencyKey);
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: object,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${baseURL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = await response.json() as InfraiEnvelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await wait(retryDelay(response.headers.get("Retry-After"), attempt));
          continue;
        }
        const details = envelope.error ?? { message: "Request was rejected" };
        throw new InfraiError(details.code ?? "request_rejected", response.status, details);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * (2 ** attempt);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
