# Stock Reservation Design

Date: 2026-07-15

## Goal

Prevent overselling across multiple stores by reserving stock when items are
added to cart, and again (independently) when an order is submitted, with
automatic release if the customer abandons the cart or payment doesn't
complete within 15 minutes. Normalize cart storage out of a JSON blob into a
proper `cart_items` table. Add a per-(product, store) cap on how much
quantity one customer can hold at once.

Out of scope: live/push stock updates to the client (client sees updated
stock on next fetch, same as today — no behavior change to freshness).

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

### `payment_attempts` (new table)
```
id                        BIGINT PK
order_id                  BIGINT (FK -> orders.id, CASCADE)
stripe_payment_intent_id  VARCHAR(100)
status                    VARCHAR(50)   -- mirrors Stripe status, or 'failed'
error_message             TEXT NULL
attempted_at              DATETIME NOT NULL
```
One row written per `confirmPayment` call (success or failure) — full retry
history for support/staff visibility. Purely additive; no effect on
reservation logic.

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
2. Otherwise call Stripe, write a `payment_attempts` row with the result.
3. On success: `markPaid` (unchanged) — hold remains reserved, protected
   from expiry once `payment_status = 'paid'`.
4. On failure: return the error; `order_items.reserved_at` is untouched, so
   the original 15-min window keeps counting down across retries (bounded
   retries, not infinite).

**Stripe webhook race:** if a webhook confirms payment after the order has
already flipped to `expired`, do not mark paid — log for manual
reconciliation (rare edge case).

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
   where `status = 'pending_approval' AND payment_status != 'paid'` →
   decrement `reserved_quantity` by the order's held quantities, set
   `orders.status = 'expired'`.

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
5. New `payment_attempts` table.

## Code changes (by layer)

- `domain/entities`: `Cart.ts` (drop `items` array shape, or repurpose),
  add `CartItem` entity; `Order.ts` status union add `'expired'`;
  add `PaymentAttempt` entity.
- `domain/repositories`: `ICartRepository` methods change from
  whole-cart-upsert to per-item operations; add reservation/expiry methods
  to `IStockRepository` (or extend existing).
- `application/cart/CartService.ts`: rewrite add/update/remove to the
  transactional flow above.
- `application/orders/OrderService.ts`: `submit` copies reservation to
  `order_items`; `approve`/`reject` modified as above.
- `application/payments/PaymentService.ts`: `confirmPayment` writes
  `payment_attempts`, checks `expired` status first.
- `infrastructure/repositories`: `CartMysqlRepository`,
  `StockMysqlRepository`, `OrderMysqlRepository` — implement locking,
  lazy-expiry helper (likely a shared function called from each repository
  or a small `StockReservationService`).
- `presentation`: no schema/route changes required (response shapes
  unchanged).
