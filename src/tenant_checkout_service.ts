import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { balanceState } from "./account_lifecycle.js";
import { InfraiClient, InfraiError } from "./infrai_client.js";

const onboardingBody = z.object({
  tenant_id: z.string().min(1),
  trigger_balance: z.number().nonnegative(),
  recharge_amount: z.number().positive(),
  hard_cap_usd: z.number().positive(),
  period: z.string().min(1),
  alert_threshold_usd: z.number().nonnegative().optional(),
});

const rechargeEventBody = z.object({
  event_id: z.string().min(1),
  tenant_id: z.string().min(1),
  admin_email: z.string().email(),
  recharge_amount: z.number().positive(),
});

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const infrai = new InfraiClient(apiKey);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/tenants/onboard") {
      const input = onboardingBody.parse(await readJson(request));
      await infrai.setBudget({
        hard_cap_usd: input.hard_cap_usd,
        period: input.period,
        alert_threshold_usd: input.alert_threshold_usd,
      });
      await infrai.configureAutoRecharge({
        trigger_balance: input.trigger_balance,
        recharge_amount: input.recharge_amount,
      });
      return json(response, 201, { tenant_id: input.tenant_id, lifecycle: "active" });
    }

    if (request.method === "GET" && request.url?.startsWith("/admin/balance")) {
      const trigger = Number(new URL(request.url, "http://localhost").searchParams.get("trigger_balance"));
      if (!Number.isFinite(trigger) || trigger < 0) return json(response, 400, { error: "trigger_balance must be non-negative" });
      const current = await infrai.getBalance();
      return json(response, 200, { ...current, state: balanceState(current.balance, trigger) });
    }

    if (request.method === "POST" && request.url === "/events/recharge-fired") {
      const input = rechargeEventBody.parse(await readJson(request));
      const sent = await infrai.sendEmail({
        to: input.admin_email,
        subject: `Balance recharged for ${input.tenant_id}`,
        body: `Recharge amount: ${input.recharge_amount}. Storefront service remains active.`,
      }, input.event_id);
      return json(response, 202, { tenant_id: input.tenant_id, lifecycle: "active", message_id: sent.message_id });
    }

    return json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) return json(response, 400, { error: "Invalid request body", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    console.error(error);
    return json(response, 500, { error: "Unexpected service error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Tenant balance service listening on http://localhost:${port}`));

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
