# Payment Rails & Webhooks — DEAL

## Trust model (read this first)

**The browser is never trusted about money.** A charge exists server-side only as a `PaymentTransaction` attempt row; the only payable value is the **server-computed next due slot** of the deal's schedule; and money lands only after **live provider verification** — the browser's success redirect and the webhook body are equally untrusted inputs that both trigger the same verification path.

## Checkout flow (capability surface)

1. `POST /api/v1/shared/:token/payments/initialize` `{provider: "FLUTTERWAVE"|"PAYSTACK", method}` — no amount field exists (client-supplied amounts are a validation error). The server picks the next `due` schedule slot, mints a reference `{PREFIX}-{dealRef}-{SLOT}-{hex16}`, stores a `pending` transaction, and returns the provider's hosted-checkout `link`.
2. The browser completes payment on the provider's page and returns.
3. Landing happens via **either** path — they converge on the same single landing:
   - `POST .../payments/verify` `{reference}` (client poll on return), or
   - the provider's webhook (below).
4. Landing rules: gateway re-verified → amount & currency must match the slot → `DealPayment` (escrow HELD) + verified tx + audit event, all in **one transaction that first takes a `SELECT … FOR UPDATE` row lock on the Deal** (serializes against decline/approve/escrow writers). The deposit's landing is what moves `SENT → ACTIVE`.

## Idempotency (structural, not best-effort)

- `PaymentTransaction.providerRef` **unique** — one attempt row per reference.
- Conditional `verifiedAt` stamp (`where: { verifiedAt: null }`) — the first verifier wins.
- `DealPayment.reference` **unique** — a charge can produce exactly one escrow row.
- `WebhookEvent (provider, eventId)` **unique** — duplicate deliveries are deduped per provider.
- Client-verify replay is **idempotent 200** (a poll racing the webhook converges; never a double charge).

## Mismatch handling

A verified charge whose amount or currency disagrees with the slot **never lands**: the transaction is marked `amount_mismatch` and held for review (verify answers 409; the webhook marks the event processed-with-reason so the rail stops retrying). Failed/pending polls answer accordingly and land nothing.

## Webhook endpoints

- `POST /api/v1/webhooks/flutterwave`
- `POST /api/v1/webhooks/paystack`

**Signature gating happens before any business field is read:**

| Rail | Mechanism | While unconfigured |
|---|---|---|
| Flutterwave | constant-time compare of the `verif-hash` header against `FLW_WEBHOOK_SECRET_HASH` | every delivery refused **503 `WEBHOOK_NOT_CONFIGURED`** |
| Paystack | HMAC-SHA512 over the **raw body** (rawBody enabled) compared with the `x-paystack-signature` header | same 503 refusal |

- Malformed payloads → `400` (signature was valid; the rail can act on it).
- Unknown reference → event marked processed-with-reason (terminal; no retry storm).
- Real processing failures → event left unprocessed + 5xx so healthy rails retry.
- Intake is deliberately **not throttled**: deliveries are provider-sourced and signature-gated; a 429 would only cause healthy rails to retry.

## Enabling Flutterwave webhooks (zero code changes)

1. In the Flutterwave dashboard → Settings → Webhooks, set the webhook URL to `https://<your-api-host>/api/v1/webhooks/flutterwave` and choose a secret hash.
2. Set `FLW_WEBHOOK_SECRET_HASH` (backend env) to the **same** value and restart.
3. The endpoint flips from refusing (503) to verifying. Until then the verify-poll path alone keeps money flowing correctly (the frontend verifies on return via the stored reference).

## Escrow semantics

- Deposits and installments land as `DealPayment` rows in **HELD** (DEAL's own escrow ledger).
- **Approve** is the only release trigger: under the deal row lock, all HELD money moves to **RELEASED** (straight to the creator — payouts are DEAL's authority), with a `PAYMENT_RELEASED` audit event.
- A dispute freezes the lifecycle; resolution either restores the prior status or releases escrow — both under one transaction.
