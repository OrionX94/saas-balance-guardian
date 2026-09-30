const serviceURL = process.env.SERVICE_URL ?? "http://localhost:3000";

const response = await fetch(`${serviceURL}/tenants/onboard`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tenant_id: "storefront-demo",
    trigger_balance: 20,
    recharge_amount: 100,
    hard_cap_usd: 500,
    period: "monthly",
    alert_threshold_usd: 100,
  }),
});

console.log(response.status, await response.json());
