# Stock Reservation Design

Date: 2026-07-15

## Goal

Prevent overselling across multiple stores by reserving stock when items are
added to cart, and again (independently) when an order is submitted, with
automatic release if the customer abandons the cart or payment doesn't
complete within 15 minutes. Normalize cart storage out of a JSON blob into a
proper `cart_items` table. Add a per-(product, store) cap on how much
quantity one customer can hold at once.

Also covers: payment channel/method tracking via a `transactions` table,
decoupled from Stripe specifics, so future payment methods (cash,
Apple Pay, Google Pay) and split/partial payments are supported for
analytics without depending on Stripe's PaymentIntent as the source of
truth.

Out of scope: live/push stock updates to the client (client sees updated
stock on next fetch, same as today — no behavior change to freshness).
Refund execution (Stripe refund API call, refund endpoint) is schema-ready
but not built in this pass.

## Data model changes

### `product_stock` (existing table) — add columns
- `reserved_quantity INT DEFAULT 0 NOT NULL` — sum of all active (non-expired)
  holds for this product/store, from `cart_items` and `order_items` combined.
- `max_reserve_qty INT DEFAULT 10 NOT NULL` — cap on how much one customer
  can hold (cart + submitted order) of this product at this store at once.
  Overridable per (product, store) row — e.g. rice capped at 2, Maggi at 30
  for store 1 / 20 for store 2.

Available-to-reserve = `quantity - reserved_quantity`.

### `cart_items` (new table) — replaces `carts.items` JSON column
```
id            BIGINT PK
cart_id       BIGINT (FK -> carts.customer_id, CASCADE)
product_id    BIGINT (FK -> products.id)
store_id      BIGINT (FK -> stores.id)
quantity      INT NOT NULL
reserved_at   DATETIME NOT NULL
created_at    DATETIME
updated_at    DATETIME
UNIQUE (cart_id, product_id)
```
`carts` table keeps `customer_id`, `store_id`, `updated_at`; drop the `items`
JSON column. Existing cart rows are cleared at migration time (carts are
ephemeral; no backfill).

### `order_items` (existing table) — add column
- `reserved_at DATETIME NULL` — set at order submit time; drives that
  order's independent 15-min payment window.

### `orders.status` (existing ENUM) — add value
- `'expired'` — new terminal state alongside `pending_approval`, `approved`,
  `rejected`. Requires updating: the migration ENUM, the `Order.ts` union
  type, and the raw SQL status literals in `OrderMysqlRepository.ts`.

### `orders.payment_status` (existing ENUM) — add value
- `'partially_paid'`, alongside existing `unpaid`, `paid`, `refunded`.
  Recomputed after each successful transaction (see Transactions section
  below) by comparing `sum(transactions.amount_nzd)` against
  `orders.total_nzd`. `approve()` is not gated on payment_status — staff may
  approve a `partially_paid` order (e.g. cash-on-delivery covers the rest).

### `payment_attempts` (new table)
```
id                        BIGINT PK
order_id                  BIGINT (FK -> orders.id, CASCADE)
stripe_payment_intent_id  VARCHAR(100)
status                    VARCHAR(50)   -- mirrors Stripe status, or 'failed'
error_message             TEXT NULL
attempted_at              DATETIME NOT NULL
```
One row written per `confirmPayment` call (success or failure) — full raw
retry history for support/staff visibility. Purely additive; no effect on
reservation logic. Distinct from `transactions` below: this logs every
attempt (including failures); `transactions` only records finalized
successful payments/refunds.

### `transactions` (new table)
```
id                BIGINT PK
order_id          BIGINT (FK -> orders.id)
payment_channel   VARCHAR(20)     -- 'stripe' | 'cash' (extensible)
payment_method    VARCHAR(20)     -- 'card' | 'apple_pay' | 'google_pay' | 'cash'
status            VARCHAR(20)     -- 'succeeded' | 'refunded'
amount_nzd        DECIMAL(10,2) NOT NULL
provider_ref      VARCHAR(100) NULL   -- Stripe PaymentIntent/Charge id; null for cash
created_at        DATETIME NOT NULL
```
One row per **finalized** successful payment or refund (never for failed
attempts). Multiple rows per order are supported — split/partial payments
(e.g. partial card + cash on delivery) each get their own row with their
own `amount_nzd`; this table is the analytics source of truth for how
money actually moved, independent of which provider was used.

**Stripe payment_method resolution:** on a successful payment (webhook
`payment_intent.succeeded`, or `confirmPayment` polling `succeeded`),
`StripeClient` fetches `paymentIntent.latest_charge` →
`payment_method_details.type`, checking `card.wallet.type` to distinguish
`apple_pay`/`google_pay` from plain `card`. One extra Stripe API call, only
on the success path (not on every poll). Result populates the new
`transactions` row.

**Idempotency:** before inserting a `transactions` row for a Stripe
success, check no existing row has that `provider_ref` — both the webhook
and a client's `confirmPayment` poll can observe the same success and must
not double-count.

**Future cash flow:** a later cash-payment endpoint/service writes directly
to `transactions` with `payment_channel='cash'`, `provider_ref=null` — no
schema change needed when that's built.

## Cart flow

All mutating operations (`POST /cart/items`, `PUT /cart/items/:productId`,
`DELETE /cart/items/:productId`, `DELETE /cart`) run in a DB transaction that
row-locks the relevant `product_stock` row(s) via `SELECT ... FOR UPDATE`,
matching the existing `deductStock` pattern.

**Add / update quantity:**
1. Lock `product_stock` row for `(product_id, store_id)`.
2. Run lazy expiry for that product/store first (see below) so availability
   is computed against current, not stale, reservations.
3. Look up this customer's existing `cart_items` quantity for the product.
4. Reject (422) if `existing + requested_delta > max_reserve_qty`.
5. Reject (422, "Insufficient stock") if
   `quantity - reserved_quantity < requested_delta`.
6. Upsert the `cart_items` row, set `reserved_at = now()` (every add/update
   resets the 15-min window). Adjust `product_stock.reserved_quantity` by
   the delta.
7. Commit.

**Remove / clear:** same lock pattern; decrement `reserved_quantity` by the
removed row's quantity, delete the `cart_items` row(s).

**Response compatibility:** all cart endpoint response shapes are unchanged
— still computed live from `cart_items` + `store_pricing` + `products`,
same fields as today. `reserved_at` is not exposed in responses yet.

**Flutter TODO (non-blocking):** `malayalikada_flutter/lib/core/api/cart_service.dart`
(item parsing ~line 35-53) and `CartItem` in
`malayalikada_flutter/lib/core/models/models.dart:230-240` currently ignore
unknown response fields and don't consume server-computed totals at all —
safe to add `reserved_at`/expiry fields later for a countdown UI with no
required client change now. Note left inline as a TODO comment, not
implemented in this pass.

## Order submit / payment / expiry flow

**Submit** (`OrderService.submit`):
1. Copy each `cart_items` row into `order_items`, set
   `order_items.reserved_at = now()` (independent fresh 15-min window).
2. Delete the `cart_items` rows (cart cleared, as today). Do **not** touch
   `product_stock.reserved_quantity` — the hold transfers from cart_item to
   order_item; total reserved amount is unchanged.
3. Create Stripe PaymentIntent as today.

**Payment confirm / retry** (`POST /orders/:id/confirm-payment`):
1. If `order.status === 'expired'`, return an error immediately
   ("Order expired, please reorder") — do not call Stripe.
2. Otherwise call Stripe. Write a `payment_attempts` row with the result
   (always — success or failure).
3. On success: resolve `payment_method` (see Transactions section), write a
   `transactions` row (skip if one already exists for this `provider_ref`
   — webhook may have beaten this call), recompute `orders.payment_status`
   from `sum(transactions.amount_nzd)` vs `total_nzd`. Hold remains
   reserved regardless of `unpaid`/`partially_paid`/`paid`, protected from
   expiry once `payment_status !== 'unpaid'`.
4. On failure: return the error; `order_items.reserved_at` is untouched, so
   the original 15-min window keeps counting down across retries (bounded
   retries, not infinite).

**Stripe webhook race:** if a webhook confirms payment after the order has
already flipped to `expired`, do not write a `transactions` row — log for
manual reconciliation (rare edge case). If the webhook fires first (before
a client poll), it performs step 3 itself; the later `confirmPayment` call
sees the existing `transactions` row and skips re-insertion.

**Approve** (`OrderService.approve`, existing method, modified): the
existing `FOR UPDATE` + deduct transaction now decrements both
`product_stock.quantity` and `product_stock.reserved_quantity` (the
reserved stock is being consumed, not released).

**Reject** (`OrderService.reject`, existing method, modified): release the
order's exact `order_items` quantities from `product_stock.reserved_quantity`
inside the same transaction as the status update, under `FOR UPDATE`.

## Lazy expiry mechanics

No cron/background job. A shared helper runs inline, inside the same
row-locked transaction as the triggering operation, scoped to only the
product/store row(s) being touched (not a full-table sweep):

1. Find `cart_items` where `reserved_at < now() - 15min` for the
   product/store in question → decrement `reserved_quantity` by each row's
   quantity, delete the row.
2. Find `order_items` where `reserved_at < now() - 15min`, joined to orders
   where `status = 'pending_approval' AND payment_status = 'unpaid'` →
   decrement `reserved_quantity` by the order's held quantities, set
   `orders.status = 'expired'`. An order with any successful transaction
   (`partially_paid` or `paid`) is exempt from expiry — a partial payment
   commits the hold the same way full payment does.

**Trigger points:** cart add/update/remove, `GET /cart`, order submit,
order approve/reject, `confirm-payment`, stock list (`StockService.list`) —
anywhere `product_stock`, a customer's `cart_items`, or `order_items` are
read or written.

Every path that adjusts `reserved_quantity` downward (cart remove, lazy
expiry, order reject, order approve) acquires the same `SELECT ... FOR
UPDATE` lock on the `product_stock` row before adjusting it — this is what
prevents a race where two concurrent releases (e.g. simultaneous expiry
checks from two requests) double-add stock back.

## Worked example (from requirements)

Product X at Store 1: `quantity = 10`.
- Customer A adds 3 → `reserved_quantity = 3` (7 available).
- Customer B adds 5 → `reserved_quantity = 8` (2 available).
- Customer A takes no action for 15 minutes → next touch on this
  product/store lazily expires A's 3-unit hold → `reserved_quantity = 5`
  (5 available). B's 5-unit hold is untouched because it has its own
  `reserved_at` and hasn't lapsed.

## Migration list

1. `product_stock`: add `reserved_quantity`, `max_reserve_qty` (default 10).
2. New `cart_items` table; alter `carts` to drop `items` JSON column
   (existing rows cleared, no backfill).
3. `order_items`: add `reserved_at`.
4. `orders.status` ENUM: add `'expired'`.
5. `orders.payment_status` ENUM: add `'partially_paid'`.
6. New `payment_attempts` table.
7. New `transactions` table.

## Code changes (by layer)

- `domain/entities`: `Cart.ts` (drop `items` array shape, or repurpose),
  add `CartItem` entity; `Order.ts` status union add `'expired'`,
  payment_status union add `'partially_paid'`; add `PaymentAttempt` entity;
  add `Transaction` entity.
- `domain/repositories`: `ICartRepository` methods change from
  whole-cart-upsert to per-item operations; add reservation/expiry methods
  to `IStockRepository` (or extend existing); add `ITransactionRepository`.
- `application/cart/CartService.ts`: rewrite add/update/remove to the
  transactional flow above.
- `application/orders/OrderService.ts`: `submit` copies reservation to
  `order_items`; `approve`/`reject` modified as above.
- `application/payments/PaymentService.ts`: `confirmPayment` writes
  `payment_attempts` and, on success, a `transactions` row + recomputes
  `orders.payment_status`; checks `expired` status first; webhook handler
  gets the same transaction-writing logic (shared helper) plus the
  idempotency check on `provider_ref`.
- `infrastructure/stripe/StripeClient.ts`: add payment-method resolution
  (`latest_charge` → `payment_method_details.type` / `card.wallet.type`).
- `infrastructure/repositories`: `CartMysqlRepository`,
  `StockMysqlRepository`, `OrderMysqlRepository` — implement locking,
  lazy-expiry helper (likely a shared function called from each repository
  or a small `StockReservationService`); new `TransactionMysqlRepository`.
- `presentation`: no schema/route changes required (response shapes
  unchanged).
