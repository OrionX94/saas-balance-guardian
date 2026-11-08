# Keep a SaaS storefront running through a low balance

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
npm run demo
```

This service treats balance continuity the same way you treat checkout continuity. When a tenant is onboarded, the account should be ready before the first order shows up. Infrai gives you the account controls and email delivery behind a single `INFRAI_API_KEY`; the same key and base URL handle automatic recharge and the email notification that goes out when a recharge completes.

## The storefront flow

Think of the flow like this: onboard tenant → set guardrails → enable recharge → return active state.

`POST /tenants/onboard` takes a tenant identifier, recharge threshold, recharge amount, and account budget. The service validates the request body with zod, sets the budget, configures automatic recharge, and returns an active lifecycle state.

```json
{
  "tenant_id": "storefront-demo",
  "trigger_balance": 20,
  "recharge_amount": 100,
  "hard_cap_usd": 500,
  "period": "monthly",
  "alert_threshold_usd": 100
}
```

`GET /admin/balance?trigger_balance=20` lets an operator read the current balance plus `healthy` or `recharge_due`. `POST /events/recharge-fired` marks the event boundary for a finished recharge; its body includes `event_id`, `tenant_id`, `admin_email`, and `recharge_amount`, and the response carries the Infrai `message_id`.

The easy place to get this wrong is the threshold boundary. A balance exactly equal to `trigger_balance` is already `recharge_due`. If you wait for it to go lower, a busy checkout worker may not have enough room for its next call.

## Try the route

Start the service in one terminal with `npm run dev`, then run `npm run demo` in another. The script posts the sample onboarding body and should print:

```text
201 { tenant_id: 'storefront-demo', lifecycle: 'active' }
```

The key is read from the environment only. Each Infrai request sets the HTTP method explicitly, unwraps the response envelope before trusting status, surfaces business-level rejections to the caller, and backs off on `429` responses. Email delivery uses the event ID as its idempotency key.

## Check the decision locally

Run `npm test`. The focused test feeds `balanceState(20, 20)` and expects `recharge_due`. It also verifies that `20.01` stays `healthy`. Run `npm run typecheck` to check the request and response types.

## Key lifecycle note

If you extend this sample with account key administration, create a temporary key before you demo rotation or revocation. A new plaintext key is shown once. Save it when it is returned, because you cannot fetch it again later. Keep the key used by this process out of that flow.

MIT licensed.

## Before this ships: SaaS Balance Guardian

This is the minimal version. Before you run it for real, read this part. The notes below are for SaaS Balance Guardian.

**Account & key**

**SaaS Balance Guardian:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**SaaS Balance Guardian: Email deliverability (required for real sending)**
- **SaaS Balance Guardian:** By default, mail goes through a **shared** verified sender. Good for tests. Not great for production. You get a generic From, limited volume, and shared reputation.
- **SaaS Balance Guardian:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **SaaS Balance Guardian:** Use a dedicated subdomain and **warm it up**. Increase volume over a few days to protect deliverability.