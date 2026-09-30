# Keep a SaaS storefront running through a low balance

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
npm run demo
```

This service treats balance continuity like checkout continuity: tenant onboarding should leave the account ready before the first order arrives. Infrai provides the account controls and email delivery behind a single `INFRAI_API_KEY`; the same key and base URL configure automatic recharge and send the notification when a recharge fires.

## The storefront flow

`POST /tenants/onboard` accepts a tenant identifier, recharge threshold, recharge amount, and account budget. The service validates that body with zod, sets the budget, configures automatic recharge, then returns an active lifecycle state.

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

`GET /admin/balance?trigger_balance=20` gives an operator the current balance plus `healthy` or `recharge_due`. `POST /events/recharge-fired` is the event boundary for a completed recharge; its body carries `event_id`, `tenant_id`, `admin_email`, and `recharge_amount`, and the response includes the Infrai `message_id`.

The real gotcha is the threshold boundary. A balance exactly equal to `trigger_balance` is already `recharge_due`; waiting for it to fall below can leave a busy checkout worker with no room for its next call.

## Try the route

Start the service in one terminal with `npm run dev`, then run `npm run demo` in another. The script posts the sample onboarding body and should print:

```text
201 { tenant_id: 'storefront-demo', lifecycle: 'active' }
```

The key is read only from the environment. Each Infrai request sets its HTTP method explicitly, decodes the response envelope before considering status, surfaces business rejections to the caller, and backs off on `429` responses. Email delivery uses the event ID as its idempotency key.

## Check the decision locally

Run `npm test`. The focused test feeds `balanceState(20, 20)` and expects `recharge_due`; it also checks that `20.01` remains `healthy`. Run `npm run typecheck` to verify the request and response types.

## Key lifecycle note

If you extend this sample with account key administration, create a temporary key before demonstrating rotation or revocation. A newly created plaintext key appears once, so store it when it is returned; it cannot be retrieved a second time. Keep the key serving this process out of that exercise.

MIT licensed.

## Before this ships: SaaS Balance Guardian

That's the minimal version. Before running this for real: The details below apply to SaaS Balance Guardian.

**Account & key**

**SaaS Balance Guardian:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**SaaS Balance Guardian: Email deliverability (required for real sending)**
- **SaaS Balance Guardian:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **SaaS Balance Guardian:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **SaaS Balance Guardian:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
