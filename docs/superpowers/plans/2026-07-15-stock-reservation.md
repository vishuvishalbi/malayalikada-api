# Stock Reservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve stock on cart-add and order-submit with a 15-minute lazy-expiry hold, normalize cart storage into a `cart_items` table, cap per-(product,store) reservation quantity, and track payments through a channel/method-agnostic `transactions` table.

**Architecture:** Clean Architecture layering is preserved (`domain` → `application` → `infrastructure` → `presentation`). All reservation math and locking lives in infrastructure repositories behind existing/expanded domain interfaces, called from application services. A single shared expiry helper (`expireStaleReservations`) is invoked inline — inside the same row-locked transaction as the caller — from every write/read path that touches `product_stock`. No cron/background job.

**Tech Stack:** Fastify, Knex (migrations only — runtime queries stay raw `mysql2` per existing convention), mysql2/promise, Zod, Stripe SDK v22, Vitest (new dev dependency for this feature).

## Global Constraints

- All deletes remain soft (`deleted_at`) — not applicable to new tables here (none need soft-delete; `cart_items`/`payment_attempts`/`transactions` are transactional, not user-facing catalog data).
- Every stock mutation (reserve, release, deduct) must acquire `SELECT ... FOR UPDATE` on the `product_stock` row before reading/writing `quantity` or `reserved_quantity`, inside a `conn.beginTransaction()` block — matches the existing `deductStock` pattern in `OrderMysqlRepository.ts:228-273`.
- Existing response shapes for `GET /cart`, `POST /cart/items`, `PUT /cart/items/:productId` must not change (no new required fields, no removed fields).
- `max_reserve_qty` defaults to `10` on `product_stock`.
- Reservation timers reset on every add/update of that line (fresh 15 minutes), both for `cart_items.reserved_at` and `order_items.reserved_at`.
- No cron/queue library is introduced — expiry is checked lazily, inline, in the same transaction as the triggering operation, scoped to the specific product/store row(s) being touched.
- Raw SQL string literals for `orders.status` appear in `OrderMysqlRepository.ts` (lines 135, 164, 168, 195 per prior investigation) — when adding `'expired'`, only touch the literals relevant to filters that should logically include/exclude it; do not blanket-replace.
- Design source of truth: `docs/superpowers/specs/2026-07-15-stock-reservation-design.md`.

---

## File Structure

**New files:**
- `src/infrastructure/database/migrations/20260716_030_stock_reservation.ts` — `product_stock` columns + `cart_items` table + drop `carts.items`.
- `src/infrastructure/database/migrations/20260716_031_order_reservation.ts` — `order_items.reserved_at` + `orders.status`/`payment_status` ENUM changes.
- `src/infrastructure/database/migrations/20260716_032_payment_attempts.ts` — new table.
- `src/infrastructure/database/migrations/20260716_033_transactions.ts` — new table.
- `src/domain/entities/CartItem.ts` — replaces the array-shape in `Cart.ts`.
- `src/domain/entities/PaymentAttempt.ts`
- `src/domain/entities/Transaction.ts`
- `src/domain/repositories/ITransactionRepository.ts`
- `src/domain/repositories/IPaymentAttemptRepository.ts`
- `src/infrastructure/repositories/TransactionMysqlRepository.ts`
- `src/infrastructure/repositories/PaymentAttemptMysqlRepository.ts`
- `src/infrastructure/stock/expireStaleReservations.ts` — shared lazy-expiry helper, takes a Knex/mysql2 connection + productId + storeId, called inside callers' transactions.
- `src/infrastructure/stock/expireStaleReservations.test.ts`
- `src/application/cart/CartService.test.ts`
- `src/application/orders/OrderService.test.ts`
- `src/application/payments/PaymentService.test.ts`
- `vitest.config.ts`

**Modified files:**
- `src/domain/entities/Cart.ts` — `ICart.items` shape removed/repurposed.
- `src/domain/repositories/ICartRepository.ts` — per-item methods replace whole-cart upsert.
- `src/infrastructure/repositories/CartMysqlRepository.ts` — rewritten against `cart_items`.
- `src/application/cart/CartService.ts` — add/update/remove rewritten to transactional reserve/release flow.
- `src/domain/entities/Order.ts` — `status` union add `'expired'`; `payment_status` union add `'partially_paid'`.
- `src/domain/entities/Product.ts` — `IProductStock` add `reserved_quantity`, `max_reserve_qty`.
- `src/domain/repositories/IOrderRepository.ts` — add `reserveOnSubmit`, `releaseReservation` signatures used by `OrderService`.
- `src/infrastructure/repositories/OrderMysqlRepository.ts` — `deductStock` decrements `reserved_quantity` too; `updateStatus` for reject releases reservation; new methods for submit-time reservation transfer.
- `src/application/orders/OrderService.ts` — `submit` transfers reservation; `approve`/`reject` call new release/deduct logic.
- `src/application/payments/PaymentService.ts` — `confirmPayment`/`handleWebhook` write `payment_attempts` + `transactions`, recompute `payment_status`.
- `src/infrastructure/stripe/StripeClient.ts` — add `resolvePaymentMethod`.
- `package.json` — add `vitest` devDependency + `test` script.
- `malayalikada_flutter/lib/core/api/cart_service.dart` — TODO comment only (no functional change).
- `malayalikada_flutter/lib/core/models/models.dart` — TODO comment only (no functional change).

---

### Task 1: Vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/shared/utils.test.ts` (smoke test using an existing pure function)

**Interfaces:**
- Produces: `npm test` command; `vitest` importable in all subsequent `*.test.ts` files via `import { describe, it, expect, vi } from 'vitest'`.

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Add test script to package.json**

In `package.json`, inside `"scripts"`, add:
```json
    "test": "vitest run"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write a smoke test against an existing pure function**

Read `src/shared/utils.ts` first to confirm `generateReferenceNumber`'s exact signature, then write:

```ts
import { describe, it, expect } from 'vitest';
import { generateReferenceNumber } from './utils';

describe('generateReferenceNumber', () => {
  it('formats date and sequence into MK-YYYYMMDD-NNNN', () => {
    const result = generateReferenceNumber(new Date(2026, 6, 15), 7);
    expect(result).toBe('MK-20260715-0007');
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (1 test). If the format doesn't match, adjust the expected string to match `generateReferenceNumber`'s actual output — read `src/shared/utils.ts` for the real format first rather than guessing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/shared/utils.test.ts
git commit -m "chore: add vitest test runner"
```

---

### Task 2: Migration — product_stock columns + cart_items table

**Files:**
- Create: `src/infrastructure/database/migrations/20260716_030_stock_reservation.ts`

**Interfaces:**
- Produces: `product_stock.reserved_quantity` (INT, default 0), `product_stock.max_reserve_qty` (INT, default 10); new `cart_items` table `(id, cart_id, product_id, store_id, quantity, reserved_at, created_at, updated_at)`, unique `(cart_id, product_id)`; `carts.items` column dropped.

- [ ] **Step 1: Write the migration**

```ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('product_stock', (t) => {
    t.integer('reserved_quantity').defaultTo(0).notNullable();
    t.integer('max_reserve_qty').defaultTo(10).notNullable();
  });

  await knex.schema.createTable('cart_items', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('cart_id').unsigned().notNullable().references('customer_id').inTable('carts').onDelete('CASCADE');
    t.bigInteger('product_id').unsigned().notNullable().references('id').inTable('products');
    t.bigInteger('store_id').unsigned().notNullable().references('id').inTable('stores');
    t.integer('quantity').notNullable();
    t.datetime('reserved_at').notNullable();
    t.timestamps(true, true);
    t.unique(['cart_id', 'product_id']);
  });

  await knex('carts').del();
  await knex.schema.alterTable('carts', (t) => {
    t.dropColumn('items');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('carts', (t) => {
    t.json('items').notNullable().defaultTo(JSON.stringify([]));
  });
  await knex.schema.dropTableIfExists('cart_items');
  await knex.schema.alterTable('product_stock', (t) => {
    t.dropColumn('reserved_quantity');
    t.dropColumn('max_reserve_qty');
  });
}
```

- [ ] **Step 2: Run the migration against the dev database**

Run: `npm run migrate`
Expected: output lists `20260716_030_stock_reservation.ts` as run, no errors.

- [ ] **Step 3: Verify schema manually**

Run: `node -e "require('mysql2/promise').createConnection(process.env.DATABASE_URL || {host:'localhost'}).then(async c => { const [r] = await c.query('DESCRIBE product_stock'); console.log(r); const [r2] = await c.query('DESCRIBE cart_items'); console.log(r2); process.exit(0); })"`

(If this doesn't connect due to env config, instead inspect via whatever DB client the project normally uses — confirm `reserved_quantity`, `max_reserve_qty` exist on `product_stock` and `cart_items` table exists with the columns above.)

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/database/migrations/20260716_030_stock_reservation.ts
git commit -m "feat(db): add stock reservation columns and cart_items table"
```

---

### Task 3: Migration — order_items.reserved_at + orders ENUM changes

**Files:**
- Create: `src/infrastructure/database/migrations/20260716_031_order_reservation.ts`

**Interfaces:**
- Produces: `order_items.reserved_at` (DATETIME NULL); `orders.status` ENUM gains `'expired'`; `orders.payment_status` ENUM gains `'partially_paid'`.

- [ ] **Step 1: Write the migration**

Knex doesn't support altering an ENUM's value list directly in MySQL without raw SQL. Use `knex.schema.raw`:

```ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('order_items', (t) => {
    t.datetime('reserved_at').nullable();
  });

  await knex.raw(
    "ALTER TABLE orders MODIFY status ENUM('pending_approval', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending_approval'"
  );
  await knex.raw(
    "ALTER TABLE orders MODIFY payment_status ENUM('unpaid', 'partially_paid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid'"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE orders MODIFY payment_status ENUM('unpaid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid'"
  );
  await knex.raw(
    "ALTER TABLE orders MODIFY status ENUM('pending_approval', 'approved', 'rejected') NOT NULL DEFAULT 'pending_approval'"
  );
  await knex.schema.alterTable('order_items', (t) => {
    t.dropColumn('reserved_at');
  });
}
```

- [ ] **Step 2: Run the migration**

Run: `npm run migrate`
Expected: `20260716_031_order_reservation.ts` listed as run, no errors.

- [ ] **Step 3: Verify ENUM values**

Run: `node -e "require('mysql2/promise').createConnection({host:'localhost',user:'root',database:'malayalikada'}).then(async c => { const [r] = await c.query(\"SHOW COLUMNS FROM orders WHERE Field IN ('status','payment_status')\"); console.log(r); process.exit(0); })"` (adjust connection args to match `.env` — check `src/shared/config.ts` for exact env var names first).

Expected: `status` Type shows `enum('pending_approval','approved','rejected','expired')`, `payment_status` shows `enum('unpaid','partially_paid','paid','refunded')`.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/database/migrations/20260716_031_order_reservation.ts
git commit -m "feat(db): add expired order status and partially_paid payment status"
```

---

### Task 4: Migration — payment_attempts and transactions tables

**Files:**
- Create: `src/infrastructure/database/migrations/20260716_032_payment_attempts.ts`
- Create: `src/infrastructure/database/migrations/20260716_033_transactions.ts`

**Interfaces:**
- Produces: `payment_attempts (id, order_id, stripe_payment_intent_id, status, error_message, attempted_at)`; `transactions (id, order_id, payment_channel, payment_method, status, amount_nzd, provider_ref, created_at)`.

- [ ] **Step 1: Write the payment_attempts migration**

```ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payment_attempts', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('order_id').unsigned().notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('stripe_payment_intent_id', 100).nullable();
    t.string('status', 50).notNullable();
    t.text('error_message').nullable();
    t.datetime('attempted_at').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payment_attempts');
}
```

- [ ] **Step 2: Write the transactions migration**

```ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transactions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('order_id').unsigned().notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('payment_channel', 20).notNullable();
    t.string('payment_method', 20).notNullable();
    t.string('status', 20).notNullable();
    t.decimal('amount_nzd', 10, 2).notNullable();
    t.string('provider_ref', 100).nullable();
    t.datetime('created_at').notNullable();
    t.index(['order_id']);
    t.index(['provider_ref']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transactions');
}
```

- [ ] **Step 3: Run migrations**

Run: `npm run migrate`
Expected: both files listed as run, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/database/migrations/20260716_032_payment_attempts.ts src/infrastructure/database/migrations/20260716_033_transactions.ts
git commit -m "feat(db): add payment_attempts and transactions tables"
```

---

### Task 5: Domain entities — CartItem, PaymentAttempt, Transaction, and updates to Cart/Order/Product

**Files:**
- Create: `src/domain/entities/CartItem.ts`
- Create: `src/domain/entities/PaymentAttempt.ts`
- Create: `src/domain/entities/Transaction.ts`
- Modify: `src/domain/entities/Cart.ts`
- Modify: `src/domain/entities/Order.ts`
- Modify: `src/domain/entities/Product.ts`

**Interfaces:**
- Produces:
  - `ICartItem { id: number; cart_id: number; product_id: number; store_id: number; quantity: number; reserved_at: Date; }`
  - `IPaymentAttempt { id: number; order_id: number; stripe_payment_intent_id: string | null; status: string; error_message: string | null; attempted_at: Date; }`
  - `ITransaction { id: number; order_id: number; payment_channel: 'stripe' | 'cash'; payment_method: 'card' | 'apple_pay' | 'google_pay' | 'cash'; status: 'succeeded' | 'refunded'; amount_nzd: number; provider_ref: string | null; created_at: Date; }`
  - `IOrder['status']` now `'pending_approval' | 'approved' | 'rejected' | 'expired'`
  - `IOrder['payment_status']` now `'unpaid' | 'partially_paid' | 'paid' | 'refunded'`
  - `IProductStock` gains `reserved_quantity: number; max_reserve_qty: number;`

- [ ] **Step 1: Create CartItem.ts**

```ts
export interface ICartItem {
  id: number;
  cart_id: number;
  product_id: number;
  store_id: number;
  quantity: number;
  reserved_at: Date;
}
```

- [ ] **Step 2: Update Cart.ts to drop the inline item shape**

```ts
export interface ICart {
  customer_id: number;
  store_id: number;
  updated_at: Date;
}
```

- [ ] **Step 3: Create PaymentAttempt.ts**

```ts
export interface IPaymentAttempt {
  id: number;
  order_id: number;
  stripe_payment_intent_id: string | null;
  status: string;
  error_message: string | null;
  attempted_at: Date;
}
```

- [ ] **Step 4: Create Transaction.ts**

```ts
export type PaymentChannel = 'stripe' | 'cash';
export type PaymentMethod = 'card' | 'apple_pay' | 'google_pay' | 'cash';
export type TransactionStatus = 'succeeded' | 'refunded';

export interface ITransaction {
  id: number;
  order_id: number;
  payment_channel: PaymentChannel;
  payment_method: PaymentMethod;
  status: TransactionStatus;
  amount_nzd: number;
  provider_ref: string | null;
  created_at: Date;
}
```

- [ ] **Step 5: Update Order.ts status/payment_status unions**

In `src/domain/entities/Order.ts`, change:
```ts
  status: 'pending_approval' | 'approved' | 'rejected';
```
to:
```ts
  status: 'pending_approval' | 'approved' | 'rejected' | 'expired';
```
and change:
```ts
  payment_status: 'unpaid' | 'paid' | 'refunded';
```
to:
```ts
  payment_status: 'unpaid' | 'partially_paid' | 'paid' | 'refunded';
```

- [ ] **Step 6: Update Product.ts IProductStock**

In `src/domain/entities/Product.ts`, change:
```ts
export interface IProductStock {
  product_id: number;
  store_id: number;
  quantity: number;
  low_stock_threshold: number;
  product_name?: string;
}
```
to:
```ts
export interface IProductStock {
  product_id: number;
  store_id: number;
  quantity: number;
  reserved_quantity: number;
  max_reserve_qty: number;
  low_stock_threshold: number;
  product_name?: string;
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: errors will appear in files that reference the old `ICart.items` / `IOrder.status` narrower unions / `IProductStock` — this is expected and will be fixed in subsequent tasks. Confirm the errors are ONLY in: `CartMysqlRepository.ts`, `CartService.ts`, `cart.controller.ts` (via service return type), `OrderMysqlRepository.ts` (status literals), `StockMysqlRepository.ts` (if any). If errors appear elsewhere, note them for the relevant later task.

- [ ] **Step 8: Commit**

```bash
git add src/domain/entities/CartItem.ts src/domain/entities/PaymentAttempt.ts src/domain/entities/Transaction.ts src/domain/entities/Cart.ts src/domain/entities/Order.ts src/domain/entities/Product.ts
git commit -m "feat(domain): add CartItem, PaymentAttempt, Transaction entities and status unions"
```

---

### Task 6: Shared lazy-expiry helper

**Files:**
- Create: `src/infrastructure/stock/expireStaleReservations.ts`
- Create: `src/infrastructure/stock/expireStaleReservations.test.ts`

**Interfaces:**
- Consumes: a `mysql2` `PoolConnection` (already inside a transaction, already holding `FOR UPDATE` lock on the relevant `product_stock` row via caller).
- Produces: `expireStaleReservations(conn: PoolConnection, productId: number, storeId: number): Promise<void>` — expires stale `cart_items` and stale unpaid `order_items` for that product/store, decrementing `product_stock.reserved_quantity` and setting `orders.status = 'expired'` where applicable. Called by every repository method in later tasks that reads/writes `product_stock.reserved_quantity`.

- [ ] **Step 1: Write the test file first (mocking the connection)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { expireStaleReservations } from './expireStaleReservations';

function makeConn(queryResults: any[]) {
  const query = vi.fn();
  queryResults.forEach((r, i) => query.mockResolvedValueOnce([r, undefined]));
  return { query } as any;
}

describe('expireStaleReservations', () => {
  it('expires stale cart_items and decrements reserved_quantity', async () => {
    const conn = makeConn([
      [{ id: 1, quantity: 3 }],   // stale cart_items select
      { affectedRows: 1 },         // reserved_quantity decrement
      { affectedRows: 1 },         // cart_items delete
      [],                          // stale order_items select
    ]);
    await expireStaleReservations(conn, 42, 7);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, quantity FROM cart_items'),
      expect.arrayContaining([42, 7])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE product_stock SET reserved_quantity = reserved_quantity - ?'),
      [3, 42, 7]
    );
  });

  it('expires stale unpaid order_items and marks the order expired', async () => {
    const conn = makeConn([
      [],                                                  // no stale cart_items
      [{ id: 5, order_id: 900, quantity: 2 }],              // stale order_items select
      { affectedRows: 1 },                                  // reserved_quantity decrement
      { affectedRows: 1 },                                  // orders status update
    ]);
    await expireStaleReservations(conn, 42, 7);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE orders SET status = 'expired'"),
      [900]
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- expireStaleReservations`
Expected: FAIL — `expireStaleReservations` module not found.

- [ ] **Step 3: Implement expireStaleReservations.ts**

```ts
import { RowDataPacket } from 'mysql2/promise';

const RESERVATION_TTL_MINUTES = 15;

export async function expireStaleReservations(conn: any, productId: number, storeId: number): Promise<void> {
  const [staleCartItems] = await conn.query<RowDataPacket[]>(
    `SELECT id, quantity FROM cart_items
     WHERE product_id = ? AND store_id = ? AND reserved_at < DATE_SUB(NOW(), INTERVAL ${RESERVATION_TTL_MINUTES} MINUTE)`,
    [productId, storeId]
  );
  for (const row of staleCartItems as any[]) {
    await conn.query(
      'UPDATE product_stock SET reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND store_id = ?',
      [row.quantity, productId, storeId]
    );
    await conn.query('DELETE FROM cart_items WHERE id = ?', [row.id]);
  }

  const [staleOrderItems] = await conn.query<RowDataPacket[]>(
    `SELECT oi.id, oi.order_id, oi.quantity FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = ? AND o.store_id = ? AND o.status = 'pending_approval' AND o.payment_status = 'unpaid'
       AND oi.reserved_at < DATE_SUB(NOW(), INTERVAL ${RESERVATION_TTL_MINUTES} MINUTE)`,
    [productId, storeId]
  );
  const seenOrders = new Set<number>();
  for (const row of staleOrderItems as any[]) {
    await conn.query(
      'UPDATE product_stock SET reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND store_id = ?',
      [row.quantity, productId, storeId]
    );
    if (!seenOrders.has(row.order_id)) {
      seenOrders.add(row.order_id);
      await conn.query("UPDATE orders SET status = 'expired', updated_at = NOW() WHERE id = ?", [row.order_id]);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- expireStaleReservations`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/stock/expireStaleReservations.ts src/infrastructure/stock/expireStaleReservations.test.ts
git commit -m "feat(stock): add lazy reservation-expiry helper"
```

---

### Task 7: ICartRepository + CartMysqlRepository rewrite

**Files:**
- Modify: `src/domain/repositories/ICartRepository.ts`
- Modify: `src/infrastructure/repositories/CartMysqlRepository.ts`

**Interfaces:**
- Consumes: `expireStaleReservations(conn, productId, storeId)` from Task 6; `ICartItem` from Task 5.
- Produces:
  ```ts
  interface ICartRepository {
    findByCustomer(customerId: number): Promise<ICart | null>;
    findItems(customerId: number): Promise<ICartItem[]>;
    expireAndFindItems(customerId: number): Promise<ICartItem[]>;
    reserveItem(customerId: number, storeId: number, productId: number, quantity: number): Promise<ICartItem>;
    // quantity is the ABSOLUTE new total for that product line, not a delta
    releaseItem(customerId: number, productId: number): Promise<void>;
    clear(customerId: number): Promise<void>;
  }
  ```
  `reserveItem` throws `ValidationError` on cap/stock violations (see Step 3). `expireAndFindItems` runs `expireStaleReservations` (Task 6) per distinct product/store pair in the customer's cart, each under its own `FOR UPDATE` lock and transaction, before returning the (now current) item list — this is what `CartService.get()` calls so `GET /cart` self-heals stale holds for the viewing customer. This is consumed by `CartService` in Task 8.

- [ ] **Step 1: Rewrite ICartRepository.ts**

```ts
import { ICart } from '../entities/Cart';
import { ICartItem } from '../entities/CartItem';

export interface ICartRepository {
  findByCustomer(customerId: number): Promise<ICart | null>;
  findItems(customerId: number): Promise<ICartItem[]>;
  reserveItem(customerId: number, storeId: number, productId: number, quantity: number): Promise<ICartItem>;
  releaseItem(customerId: number, productId: number): Promise<void>;
  clear(customerId: number): Promise<void>;
}
```

- [ ] **Step 2: Rewrite CartMysqlRepository.ts — findByCustomer and findItems**

```ts
import { RowDataPacket } from 'mysql2/promise';
import { db } from '../database/connection';
import { ICart } from '../../domain/entities/Cart';
import { ICartItem } from '../../domain/entities/CartItem';
import { ICartRepository } from '../../domain/repositories/ICartRepository';
import { ValidationError } from '../../shared/errors/AppError';
import { expireStaleReservations } from '../stock/expireStaleReservations';

export class CartMysqlRepository implements ICartRepository {
  async findByCustomer(customerId: number): Promise<ICart | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT customer_id, store_id, updated_at FROM carts WHERE customer_id = ?',
      [customerId]
    );
    if (!rows[0]) return null;
    return rows[0] as unknown as ICart;
  }

  async findItems(customerId: number): Promise<ICartItem[]> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM cart_items WHERE cart_id = ?',
      [customerId]
    );
    return rows as unknown as ICartItem[];
  }

  async expireAndFindItems(customerId: number): Promise<ICartItem[]> {
    const current = await this.findItems(customerId);
    const seen = new Set<string>();
    for (const item of current) {
      const key = `${item.product_id}:${item.store_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [item.product_id, item.store_id]);
        await expireStaleReservations(conn, item.product_id, item.store_id);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
    return this.findItems(customerId);
  }
```

- [ ] **Step 3: Add reserveItem — the core locking/reservation logic**

Append to the class body:

```ts
  async reserveItem(customerId: number, storeId: number, productId: number, quantity: number): Promise<ICartItem> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `INSERT INTO carts (customer_id, store_id, updated_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE store_id = VALUES(store_id), updated_at = NOW()`,
        [customerId, storeId]
      );

      await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [productId, storeId]);
      await expireStaleReservations(conn, productId, storeId);

      const [stockRows] = await conn.query<RowDataPacket[]>(
        'SELECT quantity, reserved_quantity, max_reserve_qty FROM product_stock WHERE product_id = ? AND store_id = ?',
        [productId, storeId]
      );
      const stock = (stockRows as any[])[0];
      if (!stock) throw new ValidationError('Product not available at selected store');

      const [existingRows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [customerId, productId]
      );
      const existing = (existingRows as any[])[0] as ICartItem | undefined;
      const previousQuantity = existing?.quantity ?? 0;
      const delta = quantity - previousQuantity;

      if (quantity > stock.max_reserve_qty) {
        throw new ValidationError(`Cannot exceed maximum quantity (${stock.max_reserve_qty}) for this item`);
      }
      if (delta > 0 && (stock.quantity - stock.reserved_quantity) < delta) {
        throw new ValidationError('Insufficient stock');
      }

      if (existing) {
        await conn.query(
          'UPDATE cart_items SET quantity = ?, reserved_at = NOW(), updated_at = NOW() WHERE id = ?',
          [quantity, existing.id]
        );
      } else {
        await conn.query(
          'INSERT INTO cart_items (cart_id, product_id, store_id, quantity, reserved_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())',
          [customerId, productId, storeId, quantity]
        );
      }

      if (delta !== 0) {
        await conn.query(
          'UPDATE product_stock SET reserved_quantity = reserved_quantity + ? WHERE product_id = ? AND store_id = ?',
          [delta, productId, storeId]
        );
      }

      await conn.commit();

      const [resultRows] = await db.query<RowDataPacket[]>(
        'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [customerId, productId]
      );
      return (resultRows as any[])[0] as ICartItem;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async releaseItem(customerId: number, productId: number): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [customerId, productId]
      );
      const item = (rows as any[])[0] as ICartItem | undefined;
      if (!item) {
        await conn.commit();
        return;
      }

      await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [item.product_id, item.store_id]);
      await conn.query(
        'UPDATE product_stock SET reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND store_id = ?',
        [item.quantity, item.product_id, item.store_id]
      );
      await conn.query('DELETE FROM cart_items WHERE id = ?', [item.id]);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async clear(customerId: number): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [items] = await conn.query<RowDataPacket[]>('SELECT * FROM cart_items WHERE cart_id = ?', [customerId]);
      for (const item of items as any[]) {
        await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [item.product_id, item.store_id]);
        await conn.query(
          'UPDATE product_stock SET reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND store_id = ?',
          [item.quantity, item.product_id, item.store_id]
        );
      }
      await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [customerId]);
      await conn.query('DELETE FROM carts WHERE customer_id = ?', [customerId]);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: remaining errors should now only be in `CartService.ts` (Task 8 fixes these) and possibly `cart.controller.ts` if it directly touches `ICart.items`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/repositories/ICartRepository.ts src/infrastructure/repositories/CartMysqlRepository.ts
git commit -m "feat(cart): rewrite cart repository against cart_items with reservation locking"
```

---

### Task 8: CartService rewrite

**Files:**
- Modify: `src/application/cart/CartService.ts`
- Create: `src/application/cart/CartService.test.ts`

**Interfaces:**
- Consumes: `ICartRepository.findItems`, `.reserveItem`, `.releaseItem`, `.clear` from Task 7.
- Produces: `CartService.get(customerId)`, `.addItem(customerId, productId, quantity)`, `.setItem(customerId, productId, quantity)`, `.removeItem(customerId, productId)`, `.clear(customerId)` — same public signatures as before, same `get()` response shape.

- [ ] **Step 1: Write the test file first**

```ts
import { describe, it, expect, vi } from 'vitest';
import { CartService } from './CartService';

function makeRepo(overrides: Partial<any> = {}) {
  return {
    findByCustomer: vi.fn().mockResolvedValue({ customer_id: 1, store_id: 5, updated_at: new Date() }),
    findItems: vi.fn().mockResolvedValue([]),
    expireAndFindItems: vi.fn().mockResolvedValue([]),
    reserveItem: vi.fn(),
    releaseItem: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}
function makeDelivery() {
  return { feeForWeight: vi.fn().mockResolvedValue(5) } as any;
}

describe('CartService.addItem', () => {
  it('adds requested quantity on top of existing cart quantity', async () => {
    const repo = makeRepo({
      findItems: vi.fn().mockResolvedValue([{ id: 1, cart_id: 1, product_id: 9, store_id: 5, quantity: 2, reserved_at: new Date() }]),
    });
    const service = new CartService(repo, makeDelivery());
    await service.addItem(1, 9, 3);
    expect(repo.reserveItem).toHaveBeenCalledWith(1, 5, 9, 5);
  });

  it('rejects zero or negative quantity', async () => {
    const repo = makeRepo();
    const service = new CartService(repo, makeDelivery());
    await expect(service.addItem(1, 9, 0)).rejects.toThrow();
  });
});

describe('CartService.setItem', () => {
  it('removes the item when quantity is 0', async () => {
    const repo = makeRepo();
    const service = new CartService(repo, makeDelivery());
    await service.setItem(1, 9, 0);
    expect(repo.releaseItem).toHaveBeenCalledWith(1, 9);
    expect(repo.reserveItem).not.toHaveBeenCalled();
  });

  it('sets absolute quantity via reserveItem otherwise', async () => {
    const repo = makeRepo();
    const service = new CartService(repo, makeDelivery());
    await service.setItem(1, 9, 4);
    expect(repo.reserveItem).toHaveBeenCalledWith(1, 5, 9, 4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- CartService`
Expected: FAIL — current `CartService` doesn't call `reserveItem`/`releaseItem`/`findItems`.

- [ ] **Step 3: Rewrite CartService.ts**

```ts
import { RowDataPacket } from 'mysql2/promise';
import { ICartRepository } from '../../domain/repositories/ICartRepository';
import { ValidationError, NotFoundError } from '../../shared/errors/AppError';
import { db } from '../../infrastructure/database/connection';
import { DeliveryService } from '../delivery/DeliveryService';

export class CartService {
  constructor(
    private repo: ICartRepository,
    private delivery: DeliveryService,
  ) {}

  async get(customerId: number) {
    const cart = await this.repo.findByCustomer(customerId);
    const items = cart ? await this.repo.expireAndFindItems(customerId) : [];
    if (!cart || items.length === 0) {
      return { storeId: cart?.store_id ?? null, items: [], grandTotal: 0, total_weight_kg: 0, delivery_fee_nzd: 0 };
    }

    const productIds = items.map(i => i.product_id);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT p.id, p.name, p.weight, sp.price_nzd,
              c.name AS category_name,
              COALESCE(pi.url, CONCAT('/uploads/', pi.filename)) AS first_image_url
       FROM products p
       JOIN store_pricing sp ON sp.product_id = p.id AND sp.store_id = ?
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (
         SELECT pi2.product_id, pi2.url, pi2.filename
         FROM product_images pi2
         INNER JOIN (
           SELECT product_id, MIN(sort_order) AS min_sort
           FROM product_images
           GROUP BY product_id
         ) AS mins ON pi2.product_id = mins.product_id AND pi2.sort_order = mins.min_sort
       ) AS pi ON p.id = pi.product_id
       WHERE p.id IN (${productIds.map(() => '?').join(',')})`,
      [cart.store_id, ...productIds]
    );

    const priceMap = new Map((rows as any[]).map((r: any) => [r.id, {
      name: r.name,
      price: Number(r.price_nzd),
      weight_kg: r.weight !== null && r.weight !== undefined ? Number(r.weight) : 0,
      category_name: r.category_name ?? null,
      first_image_url: r.first_image_url ?? null,
    }]));

    let grandTotal = 0;
    let total_weight_kg = 0;
    const respItems = items.map(i => {
      const info = priceMap.get(i.product_id);
      const unitPrice = info?.price ?? 0;
      const lineTotal = unitPrice * i.quantity;
      grandTotal += lineTotal;
      total_weight_kg += (info?.weight_kg ?? 0) * i.quantity;
      return {
        productId: i.product_id,
        name: info?.name ?? '',
        quantity: i.quantity,
        unitPrice,
        lineTotal,
        category_name: info?.category_name ?? null,
        first_image_url: info?.first_image_url ?? null,
      };
    });

    total_weight_kg = Math.round(total_weight_kg * 1000) / 1000;
    const delivery_fee_nzd = await this.delivery.feeForWeight(total_weight_kg);

    return { storeId: cart.store_id, items: respItems, grandTotal, total_weight_kg, delivery_fee_nzd };
  }

  async addItem(customerId: number, productId: number, quantity: number) {
    if (quantity <= 0) throw new ValidationError('Quantity must be positive');

    const cart = await this.repo.findByCustomer(customerId);
    let storeId = cart?.store_id;
    if (!storeId) {
      const [custRows] = await db.query<RowDataPacket[]>(
        'SELECT preferred_store_id FROM customers WHERE id = ?',
        [customerId]
      );
      storeId = (custRows as any[])[0]?.preferred_store_id;
    }
    if (!storeId) throw new ValidationError('No store selected. Set preferred store first.');

    const items = await this.repo.findItems(customerId);
    const existing = items.find(i => i.product_id === productId);
    const newQuantity = (existing?.quantity ?? 0) + quantity;

    return this.repo.reserveItem(customerId, storeId, productId, newQuantity);
  }

  async setItem(customerId: number, productId: number, quantity: number) {
    const cart = await this.repo.findByCustomer(customerId);
    if (!cart) throw new NotFoundError('Cart not found');

    if (quantity === 0) {
      await this.repo.releaseItem(customerId, productId);
      return;
    }

    return this.repo.reserveItem(customerId, cart.store_id, productId, quantity);
  }

  async removeItem(customerId: number, productId: number) {
    await this.repo.releaseItem(customerId, productId);
  }

  async clear(customerId: number) {
    await this.repo.clear(customerId);
  }
}
```

Note: `addItem`/`setItem` no longer return the full `ICart` shape (the old code returned `{customer_id, store_id, items, updated_at}` from `upsert`) — they now return an `ICartItem` or `undefined`. The controller (Task 9) is updated to call `get()` after mutation to preserve the existing response shape contract for `POST`/`PUT` endpoints instead of relying on the mutation's raw return.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- CartService`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/application/cart/CartService.ts src/application/cart/CartService.test.ts
git commit -m "feat(cart): rewrite CartService against reservation-aware repository"
```

---

### Task 9: Cart controller — preserve response shape

**Files:**
- Modify: `src/presentation/controllers/cart.controller.ts`

**Interfaces:**
- Consumes: `CartService.get/addItem/setItem/removeItem/clear` from Task 8.
- Produces: unchanged HTTP response shapes for all 5 cart endpoints.

- [ ] **Step 1: Update addItem and setItem to call get() after mutation**

The previous behavior returned the raw `ICart` (`{customer_id, store_id, items, updated_at}`) from `addItem`/`setItem` directly. Since the client (`cart_service.dart`, confirmed in prior research) does not parse `customer_id`/`items`/`updated_at` from these responses — it re-fetches via `GET /cart` separately in the app's flow — align both endpoints to return the same shape as `GET /cart` for consistency, since that's the shape actually consumed elsewhere in this codebase and the shape the design doc requires to stay "unchanged" for `GET /cart` specifically:

```ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { CartService } from '../../application/cart/CartService';
import { addItemSchema, setItemSchema } from '../schemas/cart.schema';
import { ValidationError } from '../../shared/errors/AppError';

export class CartController {
  constructor(private service: CartService) {}

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send(await this.service.get(request.user.sub));
  };

  addItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = addItemSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    await this.service.addItem(request.user.sub, parsed.data.product_id, parsed.data.quantity);
    reply.status(201).send(await this.service.get(request.user.sub));
  };

  setItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId } = request.params as { productId: string };
    const parsed = setItemSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.flatten());
    await this.service.setItem(request.user.sub, Number(productId), parsed.data.quantity);
    reply.send(await this.service.get(request.user.sub));
  };

  removeItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId } = request.params as { productId: string };
    await this.service.removeItem(request.user.sub, Number(productId));
    reply.status(204).send();
  };

  clear = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.clear(request.user.sub);
    reply.status(204).send();
  };
}
```

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors remaining related to cart files. Fix any stragglers (e.g. if `cart.routes.ts` constructs `CartService` with different constructor args — it doesn't per prior investigation, `DeliveryService` is still the second arg).

- [ ] **Step 3: Manual verification against a running dev server**

Run: `npm run dev` in one terminal. In another:
```bash
curl -s -X POST http://localhost:3000/api/v1/cart/items \
  -H "Authorization: Bearer <valid customer JWT>" -H "Content-Type: application/json" \
  -d '{"product_id": 1, "quantity": 2}'
```
Expected: 201, body shape `{ storeId, items: [...], grandTotal, total_weight_kg, delivery_fee_nzd }` — same shape as before. Verify `product_stock.reserved_quantity` for that product/store incremented by 2 via a direct DB query.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/controllers/cart.controller.ts
git commit -m "feat(cart): return consistent cart snapshot from mutation endpoints"
```

---

### Task 10: OrderService.submit — transfer reservation to order_items

**Files:**
- Modify: `src/domain/repositories/IOrderRepository.ts`
- Modify: `src/infrastructure/repositories/OrderMysqlRepository.ts`
- Modify: `src/application/orders/OrderService.ts`
- Create: `src/application/orders/OrderService.test.ts`

**Interfaces:**
- Produces (on `IOrderRepository`): `createWithReservation(order, items, cartCustomerId): Promise<IOrder>` — replaces the plain `create` call site used by `submit`; internally creates the order, inserts `order_items` with `reserved_at = NOW()`, and deletes the customer's `cart_items` rows for those products, all in one transaction (no `product_stock.reserved_quantity` change — the hold transfers, not net-changes).
- Existing `create()` method stays as-is for signature compatibility with other callers if any (grep confirms `submit` is the only caller — this task replaces that one call site directly rather than keeping both).

- [ ] **Step 1: Write the test file first (service-level, repository mocked)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { OrderService } from './OrderService';

function makeOrdersRepo() {
  return {
    createWithReservation: vi.fn().mockResolvedValue({ id: 55, total_nzd: 20 }),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    deductStock: vi.fn(),
    releaseReservation: vi.fn(),
    setPaymentIntent: vi.fn(),
  } as any;
}
function makeCartsRepo(items: any[]) {
  return {
    findByCustomer: vi.fn().mockResolvedValue({ customer_id: 1, store_id: 5 }),
    findItems: vi.fn().mockResolvedValue(items),
  } as any;
}
function makeDelivery() {
  return { feeForWeight: vi.fn().mockResolvedValue(5) } as any;
}
function makePayments() {
  return { createIntent: vi.fn().mockResolvedValue({ clientSecret: 'cs_1', paymentIntentId: 'pi_1' }) } as any;
}

describe('OrderService.submit', () => {
  it('throws when cart has no items', async () => {
    const service = new OrderService(makeOrdersRepo(), makeCartsRepo([]), makeDelivery(), makePayments());
    await expect(service.submit(1)).rejects.toThrow('Cart is empty');
  });
});
```

- [ ] **Step 2: Run to verify baseline passes (this specific case needs no repo changes yet)**

Run: `npm test -- OrderService`
Expected: PASS for the empty-cart case (existing logic already throws on empty cart via `cart.items.length === 0` — this will need updating since `cart` no longer carries `items`; see Step 4).

- [ ] **Step 3: Add IOrderRepository.createWithReservation and releaseReservation signatures**

In `src/domain/repositories/IOrderRepository.ts`, add to the interface:
```ts
  createWithReservation(
    order: Omit<IOrder, 'id' | 'created_at' | 'updated_at'>,
    items: Omit<IOrderItem, 'id' | 'order_id' | 'reserved_at'>[],
    customerId: number
  ): Promise<IOrder>;
  releaseReservation(orderId: number): Promise<void>;
```
(keep the existing `create`, `deductStock` etc. as-is; `IOrderItem` needs a `reserved_at: Date | null` field added — do this now in `src/domain/entities/Order.ts`:)
```ts
export interface IOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price_nzd: number;
  reserved_at: Date | null;
}
```

- [ ] **Step 4: Implement createWithReservation and releaseReservation in OrderMysqlRepository.ts**

Add to the class (after the existing `create` method):
```ts
  async createWithReservation(
    order: Omit<IOrder, 'id' | 'created_at' | 'updated_at'>,
    items: Omit<IOrderItem, 'id' | 'order_id' | 'reserved_at'>[],
    customerId: number
  ): Promise<IOrder> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const today = new Date();
      const [seqRows] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) as cnt FROM orders WHERE DATE(created_at) = CURDATE()'
      );
      const seq = (seqRows[0] as any).cnt + 1;
      const referenceNo = generateReferenceNumber(today, seq);

      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO orders (reference_no, customer_id, store_id, status, total_nzd, delivery_fee_nzd, total_weight_kg, stripe_payment_intent_id, payment_status, rejection_reason, actioned_by, actioned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [referenceNo, order.customer_id, order.store_id, order.status, order.total_nzd,
         order.delivery_fee_nzd ?? 0, order.total_weight_kg ?? 0,
         order.stripe_payment_intent_id ?? null, order.payment_status,
         order.rejection_reason ?? null, order.actioned_by ?? null, order.actioned_at ?? null]
      );
      const orderId = result.insertId;

      for (const item of items) {
        await conn.query(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price_nzd, reserved_at) VALUES (?, ?, ?, ?, NOW())',
          [orderId, item.product_id, item.quantity, item.unit_price_nzd]
        );
      }

      await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [customerId]);
      await conn.query('DELETE FROM carts WHERE customer_id = ?', [customerId]);

      await conn.commit();
      const created = await this.findById(orderId);
      return created!;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async releaseReservation(orderId: number): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [orderRows] = await conn.query<RowDataPacket[]>('SELECT store_id FROM orders WHERE id = ?', [orderId]);
      const storeId = (orderRows as any[])[0]?.store_id;
      if (!storeId) { await conn.commit(); return; }

      const [items] = await conn.query<RowDataPacket[]>('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
      for (const item of items as any[]) {
        await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [item.product_id, storeId]);
        await conn.query(
          'UPDATE product_stock SET reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND store_id = ?',
          [item.quantity, item.product_id, storeId]
        );
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
```
Note: `createWithReservation` does NOT change `product_stock.reserved_quantity` — the hold already exists from cart-time reservation and is simply left in place while ownership moves from `cart_items` to `order_items`.

Add the necessary import at the top of the file if not present: `import { generateReferenceNumber } from '../../shared/utils';` (already imported per existing file).

- [ ] **Step 5: Rewrite OrderService.submit to use findItems + createWithReservation**

In `src/application/orders/OrderService.ts`, replace the `submit` method body:
```ts
  async submit(customerId: number) {
    const cart = await this.carts.findByCustomer(customerId);
    const items = cart ? await this.carts.findItems(customerId) : [];
    if (!cart || items.length === 0) throw new ValidationError('Cart is empty');

    const productIds = items.map(i => i.product_id);
    const [priceRows] = await db.query<RowDataPacket[]>(
      `SELECT sp.product_id, sp.price_nzd, p.weight
       FROM store_pricing sp
       JOIN products p ON p.id = sp.product_id
       WHERE sp.store_id = ? AND sp.product_id IN (${productIds.map(() => '?').join(',')})`,
      [cart.store_id, ...productIds]
    );
    const priceMap = new Map((priceRows as any[]).map((r: any) => [
      r.product_id,
      { price: Number(r.price_nzd), weight_kg: r.weight !== null ? Number(r.weight) : 0 },
    ]));

    let subtotal = 0;
    let total_weight_kg = 0;
    const orderItems = items.map(i => {
      const info = priceMap.get(i.product_id);
      if (info === undefined) throw new ValidationError(`Product ${i.product_id} not available at selected store`);
      subtotal += info.price * i.quantity;
      total_weight_kg += info.weight_kg * i.quantity;
      return { product_id: i.product_id, quantity: i.quantity, unit_price_nzd: info.price };
    });

    total_weight_kg = Math.round(total_weight_kg * 1000) / 1000;
    const delivery_fee_nzd = await this.delivery.feeForWeight(total_weight_kg);
    const total_nzd = Math.round((subtotal + delivery_fee_nzd) * 100) / 100;

    const order = await this.orders.createWithReservation(
      {
        reference_no: '',
        customer_id: customerId,
        store_id: cart.store_id,
        status: 'pending_approval',
        total_nzd,
        delivery_fee_nzd,
        total_weight_kg,
        stripe_payment_intent_id: null,
        payment_status: 'unpaid',
        rejection_reason: null,
        actioned_by: null,
        actioned_at: null,
      },
      orderItems,
      customerId
    );

    const { clientSecret, paymentIntentId } = await this.payments.createIntent(order.id, total_nzd);
    await this.orders.setPaymentIntent(order.id, paymentIntentId);

    return { ...order, stripe_payment_intent_id: paymentIntentId, client_secret: clientSecret };
  }
```
Note: the standalone `await this.carts.clear(customerId)` call is removed — `createWithReservation` already deletes `cart_items`/`carts` in the same transaction as order creation, avoiding a separate un-transacted clear step.

- [ ] **Step 6: Update reject() to release reservation**

Replace the `reject` method body:
```ts
  async reject(orderId: number, staffId: number, reason: string, callerRole: string, callerStoreIds: number[]) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (callerRole === 'worker' && !callerStoreIds.includes(order.store_id)) {
      throw new ForbiddenError();
    }
    if (order.status !== 'pending_approval') throw new ValidationError('Order is not pending approval');
    await this.orders.releaseReservation(orderId);
    await this.orders.updateStatus(orderId, 'rejected', staffId, reason);
    return this.orders.findById(orderId);
  }
```

- [ ] **Step 7: Run tests**

Run: `npm test -- OrderService`
Expected: PASS.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `OrderService.ts`/`OrderMysqlRepository.ts`. `ICartRepository` no longer has `upsert`/`clear`-with-items signatures used here — confirm no other file calls the old `carts.clear` expecting different behavior (grep confirms `clear` signature `(customerId): Promise<void>` is unchanged, so this is fine).

- [ ] **Step 9: Commit**

```bash
git add src/domain/repositories/IOrderRepository.ts src/domain/entities/Order.ts src/infrastructure/repositories/OrderMysqlRepository.ts src/application/orders/OrderService.ts src/application/orders/OrderService.test.ts
git commit -m "feat(orders): transfer cart reservation to order_items on submit"
```

---

### Task 11: OrderService.approve — deduct reserved_quantity too

**Files:**
- Modify: `src/infrastructure/repositories/OrderMysqlRepository.ts`

**Interfaces:**
- Modifies existing `deductStock(orderId)` — same signature, now also decrements `reserved_quantity`.

- [ ] **Step 1: Update deductStock**

In `OrderMysqlRepository.ts`, in the `deductStock` method's item-update loop, change:
```ts
      for (const item of items as any[]) {
        await conn.query(
          'UPDATE product_stock SET quantity = quantity - ? WHERE product_id = ? AND store_id = ?',
          [item.quantity, item.product_id, storeId]
        );
      }
```
to:
```ts
      for (const item of items as any[]) {
        await conn.query(
          'UPDATE product_stock SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND store_id = ?',
          [item.quantity, item.quantity, item.product_id, storeId]
        );
      }
```
The existing `SELECT ... FOR UPDATE` earlier in the method already locks the row before this update, so no additional locking is needed here.

- [ ] **Step 2: Manual verification**

With a dev server running and a submitted order (from Task 10's flow) whose `product_stock.reserved_quantity` reflects the held quantity, call the approve endpoint (`PUT /orders/:id/approve` as staff) and confirm via direct query that both `quantity` and `reserved_quantity` decreased by the order's item quantities.

Run:
```bash
curl -s -X PUT http://localhost:3000/api/v1/orders/<id>/approve -H "Authorization: Bearer <staff JWT>"
```
Expected: 200, and `product_stock` row shows `quantity` and `reserved_quantity` both reduced by the approved order's quantity for that product.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/repositories/OrderMysqlRepository.ts
git commit -m "fix(orders): decrement reserved_quantity alongside quantity on approval"
```

---

### Task 12: orders.status ENUM literal for listings + stock-list expiry touch-point

**Files:**
- Modify: `src/infrastructure/repositories/OrderMysqlRepository.ts`
- Modify: `src/infrastructure/repositories/StockMysqlRepository.ts`

**Interfaces:** No signature changes — SQL string literal updates plus an inline expiry call in `StockMysqlRepository.findAll` when a specific `product_id` + `store_id` filter pair is provided.

- [ ] **Step 1: Review findWorkerCompleted's status filter**

`findWorkerCompleted` currently filters `WHERE o.status IN ('approved', 'rejected')` (both the storeIds and admin branches). An expired order is a terminal, non-actionable state similar to rejected — add it to this filter so expired orders show up in the "completed" list for staff visibility:

Change both occurrences of:
```ts
"WHERE o.status IN ('approved', 'rejected')"
```
and
```ts
`WHERE o.store_id IN (${placeholders}) AND o.status IN ('approved', 'rejected')`
```
to:
```ts
"WHERE o.status IN ('approved', 'rejected', 'expired')"
```
and
```ts
`WHERE o.store_id IN (${placeholders}) AND o.status IN ('approved', 'rejected', 'expired')`
```

- [ ] **Step 2: Leave findWorkerQueue untouched**

`findWorkerQueue` filters `o.status = 'pending_approval'` — an expired order is by definition no longer `pending_approval` (the expiry helper flips it), so it naturally drops out of this queue with no code change needed. Confirm this by reading the method again — no edit required here.

- [ ] **Step 3: Add expiry touch-point to StockMysqlRepository.findAll**

The design spec lists stock listing (`StockService.list`) as a lazy-expiry trigger point. When staff filter by a specific `product_id` + `store_id` pair, expire that row's stale reservations before reading it, so the `reserved_quantity` shown is current. When no specific product/store filter is given (a broad listing across many rows), skip expiry rather than looping expiry checks over an unbounded row set — note this explicitly rather than silently doing a partial job:

In `src/infrastructure/repositories/StockMysqlRepository.ts`, add the import:
```ts
import { db } from '../database/connection';
import { expireStaleReservations } from '../stock/expireStaleReservations';
```
and update `findAll`:
```ts
  async findAll(filters: { store_id?: number; product_id?: number; low_stock?: boolean }): Promise<IProductStock[]> {
    if (filters.store_id && filters.product_id) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('SELECT * FROM product_stock WHERE product_id = ? AND store_id = ? FOR UPDATE', [filters.product_id, filters.store_id]);
        await expireStaleReservations(conn, filters.product_id, filters.store_id);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
    // NOTE: broad listings (no product_id+store_id pair) intentionally skip
    // inline expiry — looping FOR UPDATE locks over an unbounded result set
    // here would be a self-inflicted contention problem. Reserved_quantity
    // shown in that case may lag by up to 15 minutes until the row is next
    // touched via cart/order activity or a scoped single-product query.

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.store_id) { conditions.push('ps.store_id = ?'); params.push(filters.store_id); }
    if (filters.product_id) { conditions.push('ps.product_id = ?'); params.push(filters.product_id); }
    if (filters.low_stock) { conditions.push('ps.quantity <= ps.low_stock_threshold'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ps.*, p.name AS product_name, p.barcode FROM product_stock ps LEFT JOIN products p ON p.id = ps.product_id ${where} ORDER BY ps.product_id, ps.store_id`,
      params
    );
    return rows as IProductStock[];
  }
```

- [ ] **Step 4: Type-check and manual spot-check**

Run: `npx tsc --noEmit` — expect no errors.

Manually expire an order in a dev DB (set `order_items.reserved_at` to 20 minutes ago for a `pending_approval`/`unpaid` order, then trigger any stock-touching endpoint for that product to run `expireStaleReservations`), then call the worker "completed" list endpoint and confirm the expired order appears with `status: 'expired'`. Separately, verify `GET /stock?product_id=X&store_id=Y` on a product with a stale reservation reflects the freed-up `reserved_quantity` immediately.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/repositories/OrderMysqlRepository.ts src/infrastructure/repositories/StockMysqlRepository.ts
git commit -m "feat(orders,stock): include expired orders in staff listing; expire stale reservations on scoped stock lookup"
```

---

### Task 13: StripeClient — resolve payment method

**Files:**
- Modify: `src/infrastructure/stripe/StripeClient.ts`

**Interfaces:**
- Produces: `resolvePaymentMethod(paymentIntentId: string): Promise<{ method: 'card' | 'apple_pay' | 'google_pay'; amount_nzd: number }>` — called by `PaymentService` in Task 14 only on the success path.

- [ ] **Step 1: Add resolvePaymentMethod method**

Append to the `StripeClient` class:
```ts
  async resolvePaymentMethod(paymentIntentId: string): Promise<{ method: 'card' | 'apple_pay' | 'google_pay'; amount_nzd: number }> {
    if (this.stubMode) return { method: 'card', amount_nzd: 0 };
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const charge = intent.latest_charge as any;
    const details = charge?.payment_method_details;
    const walletType = details?.card?.wallet?.type;
    let method: 'card' | 'apple_pay' | 'google_pay' = 'card';
    if (walletType === 'apple_pay') method = 'apple_pay';
    else if (walletType === 'google_pay') method = 'google_pay';
    return { method, amount_nzd: intent.amount / 100 };
  }
```
Note: in stub mode (no `STRIPE_SECRET_KEY`), returns a fixed `card`/`0` — Task 14's caller overrides `amount_nzd` with the order's actual total rather than trusting this stub value, so stub-mode dev/test flows still record a correct transaction amount.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/stripe/StripeClient.ts
git commit -m "feat(payments): resolve card/apple_pay/google_pay from Stripe PaymentIntent"
```

---

### Task 14: Transaction + PaymentAttempt repositories, PaymentService rewrite

**Files:**
- Create: `src/domain/repositories/ITransactionRepository.ts`
- Create: `src/domain/repositories/IPaymentAttemptRepository.ts`
- Create: `src/infrastructure/repositories/TransactionMysqlRepository.ts`
- Create: `src/infrastructure/repositories/PaymentAttemptMysqlRepository.ts`
- Modify: `src/application/payments/PaymentService.ts`
- Modify: `src/infrastructure/repositories/OrderMysqlRepository.ts` (add `updatePaymentStatus`)
- Modify: `src/domain/repositories/IOrderRepository.ts` (add `updatePaymentStatus` signature)
- Create: `src/application/payments/PaymentService.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ITransactionRepository {
    create(t: Omit<ITransaction, 'id' | 'created_at'>): Promise<ITransaction>;
    findByProviderRef(providerRef: string): Promise<ITransaction | null>;
    sumSucceededByOrder(orderId: number): Promise<number>;
  }
  interface IPaymentAttemptRepository {
    create(a: Omit<IPaymentAttempt, 'id'>): Promise<void>;
  }
  ```
  `IOrderRepository.updatePaymentStatus(orderId: number, status: IOrder['payment_status']): Promise<void>`.

- [ ] **Step 1: Create ITransactionRepository.ts**

```ts
import { ITransaction } from '../entities/Transaction';

export interface ITransactionRepository {
  create(t: Omit<ITransaction, 'id' | 'created_at'>): Promise<ITransaction>;
  findByProviderRef(providerRef: string): Promise<ITransaction | null>;
  sumSucceededByOrder(orderId: number): Promise<number>;
}
```

- [ ] **Step 2: Create IPaymentAttemptRepository.ts**

```ts
import { IPaymentAttempt } from '../entities/PaymentAttempt';

export interface IPaymentAttemptRepository {
  create(a: Omit<IPaymentAttempt, 'id'>): Promise<void>;
}
```

- [ ] **Step 3: Implement TransactionMysqlRepository.ts**

```ts
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { db } from '../database/connection';
import { ITransaction } from '../../domain/entities/Transaction';
import { ITransactionRepository } from '../../domain/repositories/ITransactionRepository';

export class TransactionMysqlRepository implements ITransactionRepository {
  async create(t: Omit<ITransaction, 'id' | 'created_at'>): Promise<ITransaction> {
    const [result] = await db.query<ResultSetHeader>(
      `INSERT INTO transactions (order_id, payment_channel, payment_method, status, amount_nzd, provider_ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [t.order_id, t.payment_channel, t.payment_method, t.status, t.amount_nzd, t.provider_ref]
    );
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM transactions WHERE id = ?', [result.insertId]);
    return (rows[0] as unknown) as ITransaction;
  }

  async findByProviderRef(providerRef: string): Promise<ITransaction | null> {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM transactions WHERE provider_ref = ?', [providerRef]);
    return (rows[0] as unknown as ITransaction) ?? null;
  }

  async sumSucceededByOrder(orderId: number): Promise<number> {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(amount_nzd), 0) AS total FROM transactions WHERE order_id = ? AND status = 'succeeded'",
      [orderId]
    );
    return Number((rows[0] as any).total);
  }
}
```

- [ ] **Step 4: Implement PaymentAttemptMysqlRepository.ts**

```ts
import { db } from '../database/connection';
import { IPaymentAttempt } from '../../domain/entities/PaymentAttempt';
import { IPaymentAttemptRepository } from '../../domain/repositories/IPaymentAttemptRepository';

export class PaymentAttemptMysqlRepository implements IPaymentAttemptRepository {
  async create(a: Omit<IPaymentAttempt, 'id'>): Promise<void> {
    await db.query(
      `INSERT INTO payment_attempts (order_id, stripe_payment_intent_id, status, error_message, attempted_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [a.order_id, a.stripe_payment_intent_id, a.status, a.error_message]
    );
  }
}
```

- [ ] **Step 5: Add updatePaymentStatus to IOrderRepository and OrderMysqlRepository**

In `IOrderRepository.ts`, add to the interface:
```ts
  updatePaymentStatus(orderId: number, status: IOrder['payment_status']): Promise<void>;
```
In `OrderMysqlRepository.ts`, add:
```ts
  async updatePaymentStatus(orderId: number, status: IOrder['payment_status']): Promise<void> {
    await db.query('UPDATE orders SET payment_status = ?, updated_at = NOW() WHERE id = ?', [status, orderId]);
  }
```
(the existing `markPaid` method can remain for now since nothing else references removing it, but `PaymentService` in the next step stops calling it in favor of `updatePaymentStatus`).

- [ ] **Step 6: Write PaymentService test file first**

```ts
import { describe, it, expect, vi } from 'vitest';
import { PaymentService } from './PaymentService';

function makeStripe(overrides: Partial<any> = {}) {
  return {
    createPaymentIntent: vi.fn(),
    verifyWebhook: vi.fn(),
    retrievePaymentIntent: vi.fn().mockResolvedValue({ status: 'succeeded' }),
    resolvePaymentMethod: vi.fn().mockResolvedValue({ method: 'card', amount_nzd: 20 }),
    ...overrides,
  };
}
function makeOrders(order: any) {
  return {
    findById: vi.fn().mockResolvedValue(order),
    updatePaymentStatus: vi.fn(),
  } as any;
}
function makeTransactions(existing: any = null) {
  return {
    findByProviderRef: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockResolvedValue({}),
    sumSucceededByOrder: vi.fn().mockResolvedValue(20),
  } as any;
}
function makeAttempts() {
  return { create: vi.fn() } as any;
}

describe('PaymentService.confirmPayment', () => {
  it('rejects a call for an expired order without hitting Stripe', async () => {
    const stripe = makeStripe();
    const order = { id: 1, customer_id: 1, status: 'expired', payment_status: 'unpaid', stripe_payment_intent_id: 'pi_1', total_nzd: 20 };
    const service = new PaymentService(makeOrders(order), makeTransactions(), makeAttempts(), stripe as any);
    await expect(service.confirmPayment(1, 1)).rejects.toThrow(/expired/i);
    expect(stripe.retrievePaymentIntent).not.toHaveBeenCalled();
  });

  it('writes a transaction and marks paid when total is fully covered', async () => {
    const stripe = makeStripe();
    const order = { id: 1, customer_id: 1, status: 'pending_approval', payment_status: 'unpaid', stripe_payment_intent_id: 'pi_1', total_nzd: 20 };
    const orders = makeOrders(order);
    const transactions = makeTransactions();
    const service = new PaymentService(orders, transactions, makeAttempts(), stripe as any);
    const result = await service.confirmPayment(1, 1);
    expect(transactions.create).toHaveBeenCalledWith(expect.objectContaining({ order_id: 1, payment_channel: 'stripe', payment_method: 'card', status: 'succeeded' }));
    expect(orders.updatePaymentStatus).toHaveBeenCalledWith(1, 'paid');
    expect(result.payment_status).toBe('paid');
  });

  it('does not double-insert a transaction for the same provider_ref', async () => {
    const stripe = makeStripe();
    const order = { id: 1, customer_id: 1, status: 'pending_approval', payment_status: 'unpaid', stripe_payment_intent_id: 'pi_1', total_nzd: 20 };
    const orders = makeOrders(order);
    const transactions = makeTransactions({ id: 1, provider_ref: 'pi_1' });
    const service = new PaymentService(orders, transactions, makeAttempts(), stripe as any);
    await service.confirmPayment(1, 1);
    expect(transactions.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npm test -- PaymentService`
Expected: FAIL — `PaymentService` constructor doesn't accept these args yet.

- [ ] **Step 8: Rewrite PaymentService.ts**

```ts
import { StripeClient } from '../../infrastructure/stripe/StripeClient';
import { OrderMysqlRepository } from '../../infrastructure/repositories/OrderMysqlRepository';
import { TransactionMysqlRepository } from '../../infrastructure/repositories/TransactionMysqlRepository';
import { PaymentAttemptMysqlRepository } from '../../infrastructure/repositories/PaymentAttemptMysqlRepository';
import { IOrderRepository } from '../../domain/repositories/IOrderRepository';
import { ITransactionRepository } from '../../domain/repositories/ITransactionRepository';
import { IPaymentAttemptRepository } from '../../domain/repositories/IPaymentAttemptRepository';
import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors/AppError';

export class PaymentService {
  constructor(
    private orders: IOrderRepository = new OrderMysqlRepository(),
    private transactions: ITransactionRepository = new TransactionMysqlRepository(),
    private attempts: IPaymentAttemptRepository = new PaymentAttemptMysqlRepository(),
    private stripe: StripeClient = new StripeClient(),
  ) {}

  async createIntent(orderId: number, amountNzd: number) {
    return this.stripe.createPaymentIntent(orderId, amountNzd);
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const { orderId } = await this.stripe.verifyWebhook(rawBody, signature);
    if (!orderId) return;
    const order = await this.orders.findById(orderId);
    if (!order || order.status === 'expired') return;
    await this.recordSuccess(order, order.stripe_payment_intent_id!);
  }

  async confirmPayment(orderId: number, customerId: number): Promise<{ payment_status: string }> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.customer_id !== customerId) throw new ForbiddenError();
    if (order.status === 'expired') throw new ValidationError('Order expired, please reorder');
    if (order.payment_status === 'paid') return { payment_status: 'paid' };
    if (!order.stripe_payment_intent_id) return { payment_status: order.payment_status };

    const intent = await this.stripe.retrievePaymentIntent(order.stripe_payment_intent_id);
    if (intent.status === 'succeeded') {
      await this.attempts.create({ order_id: orderId, stripe_payment_intent_id: order.stripe_payment_intent_id, status: 'succeeded', error_message: null, attempted_at: new Date() });
      return this.recordSuccess(order, order.stripe_payment_intent_id);
    }

    await this.attempts.create({ order_id: orderId, stripe_payment_intent_id: order.stripe_payment_intent_id, status: intent.status, error_message: null, attempted_at: new Date() });
    return { payment_status: order.payment_status };
  }

  private async recordSuccess(order: { id: number; total_nzd: number; payment_status: string }, providerRef: string): Promise<{ payment_status: string }> {
    const existing = await this.transactions.findByProviderRef(providerRef);
    if (!existing) {
      const { method } = await this.stripe.resolvePaymentMethod(providerRef);
      await this.transactions.create({
        order_id: order.id,
        payment_channel: 'stripe',
        payment_method: method,
        status: 'succeeded',
        amount_nzd: order.total_nzd,
        provider_ref: providerRef,
      });
    }

    const paidSoFar = await this.transactions.sumSucceededByOrder(order.id);
    const newStatus = paidSoFar >= order.total_nzd ? 'paid' : paidSoFar > 0 ? 'partially_paid' : 'unpaid';
    await this.orders.updatePaymentStatus(order.id, newStatus);
    return { payment_status: newStatus };
  }
}
```

- [ ] **Step 9: Update PaymentController and payment.routes.ts constructor wiring if needed**

Read `src/presentation/routes/payment.routes.ts` to check how `PaymentService` is constructed. If it's `new PaymentService()` (relying on defaults), no change needed — the new constructor's default args cover it. If it passes explicit args, update the call site to match the new parameter order. Verify with:

Run: `grep -rn "new PaymentService" src/`
Expected: one call site; if it's a no-arg call, leave as-is.

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test -- PaymentService`
Expected: PASS (3 tests).

- [ ] **Step 11: Full test suite + type-check**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, zero type errors project-wide.

- [ ] **Step 12: Commit**

```bash
git add src/domain/repositories/ITransactionRepository.ts src/domain/repositories/IPaymentAttemptRepository.ts src/infrastructure/repositories/TransactionMysqlRepository.ts src/infrastructure/repositories/PaymentAttemptMysqlRepository.ts src/application/payments/PaymentService.ts src/application/payments/PaymentService.test.ts src/domain/repositories/IOrderRepository.ts src/infrastructure/repositories/OrderMysqlRepository.ts
git commit -m "feat(payments): record transactions with channel/method, support partial payment"
```

---

### Task 15: Flutter TODO comments (non-functional)

**Files:**
- Modify: `malayalikada_flutter/lib/core/api/cart_service.dart`
- Modify: `malayalikada_flutter/lib/core/models/models.dart`

**Interfaces:** None — comment-only changes, no behavior change, no new fields consumed.

- [ ] **Step 1: Add TODO comment in cart_service.dart**

Near the item-parsing block (~line 35-53), add a one-line comment:
```dart
// TODO: backend cart items now carry a reservation window (15-min hold); if
// a countdown UI is wanted later, parse a future `reservedUntil` field here.
```

- [ ] **Step 2: Add TODO comment in models.dart near CartItem**

Above the `CartItem` class (~line 230):
```dart
// TODO: backend may later expose a reservation expiry per cart line
// (see malayalikada_api docs/superpowers/specs/2026-07-15-stock-reservation-design.md)
// for a countdown UI; no new field is required today.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/vishalpradhan/code/malayalikada/malayalikada_flutter
git add lib/core/api/cart_service.dart lib/core/models/models.dart
git commit -m "docs: note future reservation-expiry field for cart countdown UI"
cd /Users/vishalpradhan/code/malayalikada/malayalikada_api
```

---

### Task 16: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Full regression pass**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 2: Manual scenario — the worked example from the spec**

With `npm run dev` running and a product/store with `quantity = 10`, `max_reserve_qty` default 10:
1. As customer A, `POST /cart/items` with `quantity: 3`. Confirm `product_stock.reserved_quantity = 3`.
2. As customer B, `POST /cart/items` with `quantity: 5`. Confirm `product_stock.reserved_quantity = 8`.
3. As customer A, attempt `POST /cart/items` with `quantity: 8` (would bring A's total to 11 > max_reserve_qty 10) → expect 422 "Cannot exceed maximum quantity (10) for this item".
4. Manually set customer A's `cart_items.reserved_at` to 16 minutes in the past. Trigger expiry by calling `GET /cart` as any customer for that product/store, or `POST /cart/items` touching the same product — confirm `product_stock.reserved_quantity` drops to 5 and A's `cart_items` row is gone.
5. As customer B, submit the order (`POST /orders`). Confirm `order_items.reserved_at` is set, `cart_items` for B is cleared, `product_stock.reserved_quantity` is still 5 (unchanged — hold transferred not released).
6. Confirm-payment for B's order (stub mode succeeds automatically). Confirm a `transactions` row exists with `payment_channel='stripe'`, `status='succeeded'`, `amount_nzd` equal to the order total, and `orders.payment_status = 'paid'`.
7. Approve the order as staff. Confirm `product_stock.quantity` drops by 5 AND `reserved_quantity` drops by 5 (back to 0).

- [ ] **Step 3: Report results**

No code changes in this task — if any step fails, return to the relevant earlier task to fix before considering the plan complete.
