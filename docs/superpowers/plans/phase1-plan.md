# Malayali Kada API — Phase 1 Implementation Plan

## Global Constraints

- **Stack:** Fastify + TypeScript + MySQL (mysql2 driver) + Knex (migrations + query builder)
- **Architecture:** Clean Architecture — domain → application → infrastructure → presentation → shared. No outward dependency violations.
- **Auth:** JWT (30-day access token). Payload: `{ sub, role, storeIds[] }`. bcrypt cost 10.
- **Validation:** Zod for all request bodies and query params.
- **File uploads:** @fastify/multipart; files stored in `./uploads/`.
- **Rate limiting:** Login endpoint — 10 req / 15 min / IP via @fastify/rate-limit.
- **Stripe:** Stubbed — PaymentService returns a fake intent ID (`pi_stub_<orderId>`). Real key can be swapped via env.
- **Base path:** `/api/v1`
- **Soft deletes:** `deleted_at` on customers, products, staff_users. No hard deletes.
- **Order reference format:** `MK-YYYYMMDD-NNNN` (sequential per day, zero-padded 4 digits).
- **Max product images:** 5 per product — enforced at application layer before upload saved.
- **Stock deduction on approval:** atomic DB transaction; block with 422 if insufficient stock.
- **Cart is store-scoped:** changing preferred store clears cart.
- **CSV import:** existing barcode → update; new → create; invalid row → skip + error report.
- **No comments** unless WHY is non-obvious.
- **Remove:** `better-sqlite3`, `@google/genai`, old SQLite db.ts, old routes.

## Task 1: Project Scaffold & Dependencies

Replace old project structure with clean architecture scaffold. Install all required packages. Set up tsconfig, .env.example, Knex config.

### Steps
1. Install new dependencies: `@fastify/jwt @fastify/rate-limit @fastify/multipart @fastify/static mysql2 knex bcrypt stripe csv-parse zod`
2. Install new dev deps: `@types/bcrypt @types/node`
3. Remove old deps: `better-sqlite3 @google/genai @types/better-sqlite3`
4. Update `package.json` scripts: add `migrate`, `migrate:rollback`, `seed` scripts using Knex CLI.
5. Create `tsconfig.json` — `strict: true`, `outDir: dist`, `rootDir: src`, `module: commonjs`, `target: es2020`.
6. Create `.env.example` with all required env vars: `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `STRIPE_SECRET_KEY` (optional), `CORS_ORIGIN`.
7. Create `knexfile.ts` (or `knexfile.js`) at project root pointing to MySQL with env vars.
8. Create the full directory skeleton under `src/`:
   ```
   src/
     domain/entities/
     domain/repositories/
     application/auth/
     application/stores/
     application/categories/
     application/products/
     application/stock/
     application/pricing/
     application/cart/
     application/orders/
     application/payments/
     application/itemRequests/
     application/admin/
     infrastructure/database/
     infrastructure/database/migrations/
     infrastructure/repositories/
     infrastructure/storage/
     infrastructure/stripe/
     infrastructure/csv/
     presentation/routes/
     presentation/controllers/
     presentation/middleware/
     presentation/schemas/
     shared/errors/
   ```
9. Delete old files: `src/db.ts`, `src/routes/gemini.ts`, `src/routes/auth.ts`, `src/routes/cart.ts`, `src/routes/orders.ts`, `src/routes/products.ts`.
10. Create `src/shared/errors/AppError.ts` — `AppError extends Error` with `statusCode` and optional `data`. Export `NotFoundError` (404), `ForbiddenError` (403), `UnauthorizedError` (401), `ValidationError` (422), `ConflictError` (409).
11. Create `src/shared/config.ts` — typed env loader using `process.env`, throws on missing required vars.
12. Create `src/shared/utils.ts` — `generateReferenceNumber(date, sequenceNum)` → `MK-YYYYMMDD-NNNN` and `paginate(page, limit)` → `{ offset, limit }`.
13. Create `src/infrastructure/database/connection.ts` — mysql2 pool using config. Export `db` singleton.
14. Create new minimal `src/index.ts` — registers CORS, JWT, rate-limit, multipart, static; mounts route groups under `/api/v1`; error handler that converts `AppError` to proper HTTP response; health endpoint.

### Verification
- `npm run build` passes with no errors.

---

## Task 2: Database Migrations

Create all Knex migration files for every table in the spec.

### Steps
Create these migration files in `src/infrastructure/database/migrations/` (timestamp prefix `20260627_`):

1. `20260627_001_stores.ts` — stores table
2. `20260627_002_categories.ts` — categories table (self-referencing FK)
3. `20260627_003_products.ts` — products table
4. `20260627_004_product_images.ts` — product_images table
5. `20260627_005_product_stock.ts` — product_stock table (composite PK)
6. `20260627_006_store_pricing.ts` — store_pricing table (composite PK)
7. `20260627_007_customers.ts` — customers table
8. `20260627_008_staff_users.ts` — staff_users table
9. `20260627_009_staff_stores.ts` — staff_stores table (composite PK)
10. `20260627_010_carts.ts` — carts table (customer_id is PK)
11. `20260627_011_orders.ts` — orders table
12. `20260627_012_order_items.ts` — order_items table
13. `20260627_013_item_requests.ts` — item_requests table
14. `20260627_014_csv_import_logs.ts` — csv_import_logs table

Each migration must use Knex `createTable` with exact column types, constraints, and FKs from the spec (§3).

### Verification
- `npm run migrate` runs successfully against a test MySQL DB (or verify migration files compile with `npm run build`).

---

## Task 3: Domain Entities & Repository Interfaces

Define all TypeScript interfaces for domain entities and repository contracts.

### Steps
Create in `src/domain/entities/`:
1. `Store.ts` — `IStore` interface
2. `Category.ts` — `ICategory` interface
3. `Product.ts` — `IProduct`, `IProductImage`, `IProductStock`, `IStorePricing` interfaces
4. `Customer.ts` — `ICustomer` interface
5. `StaffUser.ts` — `IStaffUser` interface
6. `Cart.ts` — `ICart`, `ICartItem` interfaces
7. `Order.ts` — `IOrder`, `IOrderItem` interfaces
8. `ItemRequest.ts` — `IItemRequest` interface
9. `CsvImportLog.ts` — `ICsvImportLog` interface

Create in `src/domain/repositories/`:
10. `IStoreRepository.ts`
11. `ICategoryRepository.ts`
12. `IProductRepository.ts`
13. `ICustomerRepository.ts`
14. `IStaffRepository.ts`
15. `ICartRepository.ts`
16. `IOrderRepository.ts`
17. `IItemRequestRepository.ts`
18. `ICsvImportLogRepository.ts`

Each repository interface should have only the methods actually needed by application services (YAGNI — don't add methods speculatively).

### Verification
- `npm run build` passes.

---

## Task 4: Auth — Application Service + MySQL Repository + Routes

Implement full auth flow: register, login, me, refresh, admin reset-password.

### Steps

**Domain/Infra:**
1. `src/infrastructure/repositories/CustomerMysqlRepository.ts` — implements `ICustomerRepository`. Methods: `findByIdentifier`, `findById`, `create`, `update`, `softDelete`.
2. `src/infrastructure/repositories/StaffMysqlRepository.ts` — implements `IStaffRepository`. Methods: `findByIdentifier`, `findById`, `create`, `update`, `getStoreIds`.

**Application:**
3. `src/application/auth/AuthService.ts`:
   - `register(identifier, identifierType, password, firstName, lastName)` → creates customer, returns JWT + user + menus
   - `login(identifier, password)` → bcrypt compare, returns JWT + user + role + `menus[]` (see spec §5)
   - `me(userId, role)` → returns user + role + `menus[]`
   - `refresh(token)` → validates and returns new token
   - `adminResetPassword(adminId, targetId, newPassword)` → bcrypt hash, update
   - Menu payloads: hard-coded per role as per spec §5

**Presentation:**
4. `src/presentation/schemas/auth.schema.ts` — Zod schemas for register, login, reset-password bodies.
5. `src/presentation/controllers/auth.controller.ts` — thin; delegates to AuthService; maps errors.
6. `src/presentation/routes/auth.routes.ts` — registers routes with rate limit on login (10/15min/IP).
7. `src/presentation/middleware/authenticate.ts` — verifies JWT, attaches `request.user = { id, role, storeIds }`.
8. `src/presentation/middleware/requireRole.ts` — factory returning hook that checks `request.user.role`.

**JWT payload shape:** `{ sub: number, role: 'customer'|'worker'|'admin', storeIds: number[] }`

### Verification
- `npm run build` passes.
- Manual: POST `/api/v1/auth/register`, POST `/api/v1/auth/login`, GET `/api/v1/auth/me` return correct shapes.

---

## Task 5: Stores — Service + Repository + Routes

### Steps
1. `src/infrastructure/repositories/StoreMysqlRepository.ts` — `findAll`, `findById`, `create`, `update`, `delete` (soft via `is_active=0`), `saveLogo`, `deleteLogo`.
2. `src/infrastructure/storage/LocalFileStorage.ts` — `save(filename, buffer)`, `delete(filename)`, `getUrl(filename)` → `/uploads/<filename>`.
3. `src/application/stores/StoreService.ts` — list (active only), getById, create, update, uploadLogo (max 1 file, save via LocalFileStorage), removeLogo.
4. `src/presentation/schemas/store.schema.ts` — Zod schemas.
5. `src/presentation/controllers/store.controller.ts`
6. `src/presentation/routes/store.routes.ts` — public GET routes; admin-only POST/PUT/DELETE.

GET /stores response must include `logo_url` (full URL if `logo_filename` set, else null).

### Verification
- `npm run build` passes.

---

## Task 6: Categories — Service + Repository + Routes

### Steps
1. `src/infrastructure/repositories/CategoryMysqlRepository.ts` — `findAll` (returns flat list), `findById`, `create`, `update`, `softDelete` (set `deleted_at`).
2. `src/application/categories/CategoryService.ts`:
   - `list()` → returns tree structure: top-level categories with nested `children[]`. Each node includes `image_url`.
   - `create`, `update`, `softDelete`, `uploadImage`, `removeImage`.
3. `src/presentation/schemas/category.schema.ts`
4. `src/presentation/controllers/category.controller.ts`
5. `src/presentation/routes/category.routes.ts` — public GET /categories (tree); admin POST/PUT/DELETE/image.

### Verification
- `npm run build` passes.

---

## Task 7: Products — Service + Repository + Routes (browse, CRUD, images)

### Steps
1. `src/infrastructure/repositories/ProductMysqlRepository.ts`:
   - `findAll({ categoryId, search, storeId, page, limit })` — filters, joins stock/pricing if storeId given, pagination.
   - `findById(id, storeId?)` — product detail with images, stock, price.
   - `findByBarcode(barcode)`.
   - `create`, `update`, `softDelete`.
   - `addImage`, `removeImage`, `getImageCount(productId)`.
2. `src/application/products/ProductService.ts`:
   - `list`, `getById`, `getByBarcode`, `create`, `update`, `softDelete`.
   - `uploadImage(productId, file)` — check count < 5 before saving; throw `ValidationError` if at limit.
   - `removeImage(productId, imageId)`.
3. `src/presentation/schemas/product.schema.ts` — query params + body schemas.
4. `src/presentation/controllers/product.controller.ts`
5. `src/presentation/routes/product.routes.ts` — public GET; admin POST/PUT/DELETE.

Note: `GET /products/barcode/:barcode` must be registered BEFORE `GET /products/:id` in Fastify to avoid route conflict.

### Verification
- `npm run build` passes.

---

## Task 8: Stock & Pricing — Services + Repositories + Routes

### Steps

**Stock:**
1. `src/infrastructure/repositories/StockMysqlRepository.ts` — `findAll({ storeId, productId, lowStock })`, `upsert(productId, storeId, quantity, threshold)`.
2. `src/application/stock/StockService.ts` — `list`, `set`.
3. `src/presentation/schemas/stock.schema.ts`
4. `src/presentation/controllers/stock.controller.ts`
5. `src/presentation/routes/stock.routes.ts` — admin only.

**Pricing:**
6. `src/infrastructure/repositories/PricingMysqlRepository.ts` — `findAll({ storeId, productId })`, `upsert(productId, storeId, priceNzd, effectiveDate)`, `update`.
7. `src/application/pricing/PricingService.ts` — `list`, `set`, `update`.
8. `src/presentation/schemas/pricing.schema.ts`
9. `src/presentation/controllers/pricing.controller.ts`
10. `src/presentation/routes/pricing.routes.ts` — admin only.

### Verification
- `npm run build` passes.

---

## Task 9: Cart — Service + Repository + Routes

### Steps
1. `src/infrastructure/repositories/CartMysqlRepository.ts` — `findByCustomer(customerId)`, `upsert(customerId, storeId, items)`, `clear(customerId)`.
2. `src/application/cart/CartService.ts`:
   - `get(customerId)` — fetch cart, join pricing for line totals; return `{ storeId, items: [{ productId, name, quantity, unitPrice, lineTotal }], grandTotal }`.
   - `addItem(customerId, productId, quantity)` — check pricing exists (422 if not); increment or create.
   - `setItem(customerId, productId, quantity)` — set exact qty; 0 = remove.
   - `removeItem(customerId, productId)`.
   - `clear(customerId)`.
3. `src/presentation/schemas/cart.schema.ts`
4. `src/presentation/controllers/cart.controller.ts`
5. `src/presentation/routes/cart.routes.ts` — customer role only.

### Verification
- `npm run build` passes.

---

## Task 10: Orders — Service + Repository + Routes

### Steps
1. `src/infrastructure/repositories/OrderMysqlRepository.ts`:
   - `create(order, items)` — inserts order + items in transaction; generates reference_no.
   - `findByCustomer(customerId, page, limit)`.
   - `findById(id)` — with items.
   - `findWorkerQueue(storeIds)` — pending orders for assigned stores, oldest first.
   - `findAllAdmin({ storeId, status, from, to, page, limit })`.
   - `updateStatus(id, status, actionedBy, rejectionReason?)`.
   - `deductStock(orderId, storeId)` — transaction: check stock for each item; if any insufficient, throw 422 with detail; else deduct.
   - `exportCsv({ storeId, from, to })` — returns rows for CSV.
2. `src/shared/utils.ts` — add `nextOrderSequence(db, date)` — queries max sequence for the day.
3. `src/application/orders/OrderService.ts`:
   - `submit(customerId, storeId)` — read cart, create order + items, clear cart, create stub Stripe intent.
   - `customerHistory(customerId, page, limit)`.
   - `customerDetail(customerId, orderId)`.
   - `workerQueue(storeIds)`.
   - `approve(orderId, staffId)` — deduct stock, update status.
   - `reject(orderId, staffId, reason)`.
   - `adminList(filters)`.
   - `adminExportCsv(filters)` — returns CSV string.
4. `src/presentation/schemas/order.schema.ts`
5. `src/presentation/controllers/order.controller.ts`
6. `src/presentation/routes/order.routes.ts` — roles per spec §4.

### Verification
- `npm run build` passes.

---

## Task 11: Payments — Stub Service + Routes

### Steps
1. `src/infrastructure/stripe/StripeClient.ts` — wraps stripe SDK. If `STRIPE_SECRET_KEY` not set, all methods return stub responses.
2. `src/application/payments/PaymentService.ts`:
   - `createIntent(orderId, amountNzd)` → returns `{ clientSecret: 'stub_secret_<orderId>', paymentIntentId: 'pi_stub_<orderId>' }` when stubbed.
   - `handleWebhook(rawBody, signature)` → verifies Stripe signature (skipped when stubbed); marks order `payment_status=paid`.
3. `src/presentation/schemas/payment.schema.ts`
4. `src/presentation/controllers/payment.controller.ts`
5. `src/presentation/routes/payment.routes.ts` — `/payments/create-intent` (customer); `/payments/webhook` (public, raw body).

Webhook route must use `addContentTypeParser` for `application/json` raw body (Stripe signature verification requirement).

### Verification
- `npm run build` passes.

---

## Task 12: Item Requests — Service + Repository + Routes

### Steps
1. `src/infrastructure/repositories/ItemRequestMysqlRepository.ts` — `create`, `findByCustomer`, `findAllAdmin({ storeId, status })`, `updateStatus(id, status, adminNotes)`.
2. `src/application/itemRequests/ItemRequestService.ts` — `submit`, `customerList`, `adminList`, `updateStatus`.
3. `src/presentation/schemas/itemRequest.schema.ts`
4. `src/presentation/controllers/itemRequest.controller.ts`
5. `src/presentation/routes/itemRequest.routes.ts` — roles per spec §4.

### Verification
- `npm run build` passes.

---

## Task 13: CSV Import — Service + Repository + Routes

### Steps
1. `src/infrastructure/csv/CsvParser.ts` — parses CSV buffer using csv-parse; expected columns: `barcode, name, description, category_id, brand, unit, weight, supplier`.
2. `src/infrastructure/repositories/CsvImportLogRepository.ts` — `create`, `findAll`, `findById`.
3. `src/application/products/CsvImportService.ts`:
   - `importFile(file, staffId)` — parse CSV; for each row: upsert product by barcode (existing → update, new → create); collect errors; write error report CSV to uploads; save log record; return log.
4. `src/presentation/routes/product.routes.ts` — add `POST /products/import/csv`, `GET /products/import/logs`, `GET /products/import/:importId/errors` (admin only).

### Verification
- `npm run build` passes.

---

## Task 14: Admin — Dashboard + Staff + Customers Routes

### Steps
1. `src/application/admin/AdminService.ts`:
   - `dashboard()` → `{ ordersToday, pendingOrders, completedOrders, revenueByStore: [{storeId, name, revenueNzd}] }`.
   - `listStaff()`, `createStaff(data)`, `updateStaff(id, data)`.
   - `listCustomers({ search, page, limit })`, `getCustomer(id)` — includes order history.
2. Repositories: reuse existing Staff + Customer + Order repositories.
3. `src/presentation/schemas/admin.schema.ts`
4. `src/presentation/controllers/admin.controller.ts`
5. `src/presentation/routes/admin.routes.ts` — admin only.

### Verification
- `npm run build` passes.

---

## Task 15: Wire Everything in index.ts + Error Handler

### Steps
1. Register all route groups in `src/index.ts` under `/api/v1` prefix:
   - `/auth`, `/stores`, `/categories`, `/products`, `/stock`, `/pricing`, `/cart`, `/orders`, `/payments`, `/item-requests`, `/admin`
2. Register `@fastify/static` for `./uploads` at `/uploads`.
3. Add global error handler — catches `AppError` subclasses → proper HTTP status; catches Zod errors → 422 with details; catches unknown → 500.
4. Add `onRequest` hook for request logging (Fastify's built-in logger).
5. Verify all imports resolve; fix any circular dependency.

### Verification
- `npm run build` passes with zero errors.
- Server starts: `npm run dev` — health endpoint returns `{ status: 'ok' }`.
