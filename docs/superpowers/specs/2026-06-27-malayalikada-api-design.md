# Malayali Kada API — Design Spec

**Date:** 2026-06-27  
**Version:** 1.0  
**Scope:** Phase 1 MVP Backend API

---

## 1. Overview

RESTful JSON API serving three clients: Customer Mobile App, Shop Worker App, Admin Dashboard Web. Built with Fastify + TypeScript + MySQL. Clean Architecture — framework and DB are outer layers; domain and use cases are inner layers with no framework imports.

---

## 2. Architecture

### Layer Breakdown

```
src/
  domain/           # Entities (plain TS interfaces/classes) + repository interfaces
  application/      # Use-case services — orchestrate domain, call repository interfaces
  infrastructure/   # MySQL repositories, local file storage, Stripe client, CSV parser
  presentation/     # Fastify routes, controllers, request/response schemas (Zod)
  shared/           # AppError, config loader, utils
```

**Dependency rule:** domain → none. application → domain. infrastructure → domain. presentation → application + shared. Nothing points outward.

### Request Flow

```
HTTP Request → Fastify Route → Controller → Application Service → Repository Interface
                                                                        ↓
                                                                 MySQL Repository (infra)
```

---

## 3. Database Schema (MySQL)

All tables use `BIGINT UNSIGNED AUTO_INCREMENT` PKs and `created_at`/`updated_at` timestamps. Soft-delete via `deleted_at` where applicable.

### stores
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| name | VARCHAR(150) | |
| address | TEXT | |
| phone | VARCHAR(20) | |
| bank_account | VARCHAR(50) | for reference display |
| icon | VARCHAR(100) | icon key — nullable |
| logo_filename | VARCHAR(255) | optional store logo — nullable |
| is_active | TINYINT(1) | default 1 |

### categories
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| name | VARCHAR(100) | |
| icon | VARCHAR(100) | icon key/name (e.g. "rice_bowl", "spa") — nullable |
| image_filename | VARCHAR(255) | optional category banner image — nullable |
| parent_id | BIGINT FK → categories.id | NULL = top-level |
| sort_order | INT | default 0 |

### products
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| barcode | VARCHAR(50) UNIQUE | EAN/UPC |
| name | VARCHAR(200) | |
| description | TEXT | |
| category_id | BIGINT FK → categories.id | |
| brand | VARCHAR(100) | |
| unit | VARCHAR(50) | e.g. "1kg Pack" |
| weight | DECIMAL(10,3) | grams |
| supplier | VARCHAR(150) | |
| is_active | TINYINT(1) | default 1 |
| deleted_at | DATETIME | soft-delete |

### product_images
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| product_id | BIGINT FK → products.id | |
| filename | VARCHAR(255) | stored on local disk under /uploads |
| sort_order | INT | default 0 |
| **Constraint:** max 5 rows per product_id enforced at application layer |

### product_stock
| Column | Type | Notes |
|---|---|---|
| product_id | BIGINT FK | composite PK with store_id |
| store_id | BIGINT FK | |
| quantity | INT | default 0 |
| low_stock_threshold | INT | default 10 |

### store_pricing
| Column | Type | Notes |
|---|---|---|
| product_id | BIGINT FK | composite PK with store_id |
| store_id | BIGINT FK | |
| price_nzd | DECIMAL(10,2) | |
| effective_date | DATE | |

### customers
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| identifier | VARCHAR(100) UNIQUE | email or NZ mobile |
| identifier_type | ENUM('email','mobile') | |
| password_hash | VARCHAR(255) | bcrypt cost 10 |
| first_name | VARCHAR(80) | |
| last_name | VARCHAR(80) | |
| preferred_store_id | BIGINT FK → stores.id | NULL until selected |
| deleted_at | DATETIME | soft-delete |

### staff_users
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| identifier | VARCHAR(100) UNIQUE | |
| identifier_type | ENUM('email','mobile') | |
| password_hash | VARCHAR(255) | |
| name | VARCHAR(150) | |
| role | ENUM('worker','admin') | |
| is_active | TINYINT(1) | default 1 |

### staff_stores
| Column | Type | Notes |
|---|---|---|
| staff_id | BIGINT FK | composite PK |
| store_id | BIGINT FK | composite PK |

### carts
| Column | Type | Notes |
|---|---|---|
| customer_id | BIGINT PK FK → customers.id | one cart per customer |
| store_id | BIGINT FK → stores.id | cart is store-scoped |
| items | JSON | [{product_id, quantity}] |
| updated_at | DATETIME | |

### orders
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| reference_no | VARCHAR(20) UNIQUE | e.g. MK-20260627-0001 |
| customer_id | BIGINT FK | |
| store_id | BIGINT FK | |
| status | ENUM('pending_approval','approved','rejected') | default pending_approval |
| total_nzd | DECIMAL(10,2) | |
| stripe_payment_intent_id | VARCHAR(100) | nullable |
| payment_status | ENUM('unpaid','paid','refunded') | default unpaid |
| rejection_reason | TEXT | nullable |
| actioned_by | BIGINT FK → staff_users.id | nullable |
| actioned_at | DATETIME | nullable |

### order_items
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| order_id | BIGINT FK → orders.id | |
| product_id | BIGINT FK → products.id | |
| quantity | INT | |
| unit_price_nzd | DECIMAL(10,2) | snapshot at order time |

### item_requests
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| customer_id | BIGINT FK | |
| store_id | BIGINT FK | |
| product_name | VARCHAR(200) | required |
| barcode | VARCHAR(50) | optional |
| notes | TEXT | optional |
| status | ENUM('new','sourced','declined') | default new |
| admin_notes | TEXT | |

### csv_import_logs
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| filename | VARCHAR(255) | |
| imported_by | BIGINT FK → staff_users.id | |
| rows_total | INT | |
| rows_ok | INT | |
| rows_failed | INT | |
| error_report_filename | VARCHAR(255) | path to downloadable CSV |

---

## 4. API Endpoints

Base: `/api/v1`

### Auth — `/auth`
See §5 for full auth endpoint table and response shape (includes menus).

### Stores — `/stores`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | /stores | public | List active stores; includes icon + logo_url |
| GET | /stores/:id | public | Store detail |
| POST | /stores | admin | Create store (name, address, phone, icon) |
| PUT | /stores/:id | admin | Update store |
| POST | /stores/:id/logo | admin | Upload store logo (multipart) |
| DELETE | /stores/:id/logo | admin | Remove store logo |

### Categories — `/categories`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | /categories | public | Tree of categories (parent + children); includes icon + image_url |
| POST | /categories | admin | Create category (name, icon, parent_id, sort_order) |
| PUT | /categories/:id | admin | Update / reorder |
| DELETE | /categories/:id | admin | Soft-delete |
| POST | /categories/:id/image | admin | Upload category banner image (multipart) |
| DELETE | /categories/:id/image | admin | Remove category banner image |

### Products — `/products`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | /products | public | Browse; query params: `category_id`, `search`, `store_id`, `page`, `limit` |
| GET | /products/:id | public | Product detail with images, stock status, store price |
| GET | /products/barcode/:barcode | public | Lookup by barcode (returns 404 if unknown) |
| POST | /products | admin | Create product |
| PUT | /products/:id | admin | Update product |
| DELETE | /products/:id | admin | Soft-delete (is_active=0) |
| POST | /products/:id/images | admin | Upload image (multipart, max 5) |
| DELETE | /products/:id/images/:imageId | admin | Remove image |
| POST | /products/import/csv | admin | CSV bulk import |
| GET | /products/import/logs | admin | List import logs |
| GET | /products/import/:importId/errors | admin | Download error report CSV |

### Stock — `/stock`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | /stock | admin | List stock; query: `store_id`, `product_id`, `low_stock=true` |
| PUT | /stock | admin | Set stock for product+store |

### Pricing — `/pricing`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | /pricing | admin | List pricing; query: `store_id`, `product_id` |
| POST | /pricing | admin | Set price for product+store |
| PUT | /pricing/:productId/:storeId | admin | Update price |

### Cart — `/cart`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | /cart | customer | Get cart with line totals (uses customer's preferred store pricing) |
| POST | /cart/items | customer | Add item or increment quantity |
| PUT | /cart/items/:productId | customer | Set exact quantity |
| DELETE | /cart/items/:productId | customer | Remove item |
| DELETE | /cart | customer | Clear cart |

### Orders — `/orders`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | /orders | customer | Submit order from cart; creates Stripe PaymentIntent |
| GET | /orders | customer | Customer's own order history |
| GET | /orders/:id | customer | Order detail + status |
| GET | /orders/worker/queue | worker | Pending orders for assigned store, oldest first |
| PUT | /orders/:id/approve | worker/admin | Approve; deducts stock |
| PUT | /orders/:id/reject | worker/admin | Reject; body: `{ reason }` |
| GET | /orders/admin | admin | All orders; query: `store_id`, `status`, `from`, `to`, `page` |
| GET | /orders/admin/export | admin | CSV export; query: `store_id`, `from`, `to` |

### Payments — `/payments`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | /payments/create-intent | customer | Create/retrieve Stripe PaymentIntent for an order |
| POST | /payments/webhook | public (Stripe sig) | Stripe webhook; marks order payment_status=paid |

### Item Requests — `/item-requests`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | /item-requests | customer | Submit request |
| GET | /item-requests | customer | Own requests |
| GET | /item-requests/admin | admin | All requests; query: `store_id`, `status` |
| PUT | /item-requests/:id/status | admin | Update status + admin notes |

### Admin — `/admin`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | /admin/dashboard | admin | Stats: orders today, pending, completed, revenue per store |
| GET | /admin/staff | admin | List staff |
| POST | /admin/staff | admin | Create staff account |
| PUT | /admin/staff/:id | admin | Edit staff (name, role, stores, active) |
| GET | /admin/customers | admin | Searchable customer list |
| GET | /admin/customers/:id | admin | Customer profile + order history |

### Static Files
`GET /uploads/:filename` — serves product images from `./uploads/` directory.

---

## 5. Roles, Menus & Auth Endpoints

Three roles. Each role gets a distinct menu structure returned by `GET /auth/me` and `POST /auth/login` under a `menus` array so clients render the correct navigation without hardcoding role logic.

### Role Definitions

| Role | Created by | Access |
|---|---|---|
| `customer` | Self-signup | Customer app only |
| `worker` | Admin only | Worker app only; scoped to assigned stores |
| `admin` | Admin only | Admin dashboard; full access across all stores |

### Menu Payloads per Role

**customer**
```json
[
  { "key": "home",         "label": "Home",         "icon": "home" },
  { "key": "categories",   "label": "Categories",   "icon": "grid" },
  { "key": "cart",         "label": "Cart",         "icon": "shopping-cart" },
  { "key": "orders",       "label": "My Orders",    "icon": "package" },
  { "key": "item-request", "label": "Request Item", "icon": "plus-circle" },
  { "key": "profile",      "label": "Profile",      "icon": "user" }
]
```

**worker**
```json
[
  { "key": "queue",        "label": "Order Queue",  "icon": "inbox" },
  { "key": "done",         "label": "Completed",    "icon": "check-circle" },
  { "key": "profile",      "label": "Profile",      "icon": "user" }
]
```

**admin**
```json
[
  { "key": "dashboard",    "label": "Dashboard",    "icon": "bar-chart" },
  { "key": "orders",       "label": "Orders",       "icon": "package" },
  { "key": "products",     "label": "Products",     "icon": "box" },
  { "key": "categories",   "label": "Categories",   "icon": "grid" },
  { "key": "stock",        "label": "Stock",        "icon": "layers" },
  { "key": "pricing",      "label": "Pricing",      "icon": "tag" },
  { "key": "staff",        "label": "Staff",        "icon": "users" },
  { "key": "customers",    "label": "Customers",    "icon": "user-check" },
  { "key": "item-requests","label": "Item Requests","icon": "clipboard" },
  { "key": "import",       "label": "CSV Import",   "icon": "upload" }
]
```

### Auth Endpoints Updated

| Method | Path | Role | Description |
|---|---|---|---|
| POST | /auth/register | public | Customer self-signup |
| POST | /auth/login | public | Returns JWT + user profile + `menus[]` |
| GET | /auth/me | any | Returns current user + role + `menus[]` |
| POST | /auth/refresh | any | Silent token refresh |
| POST | /auth/admin/reset-password | admin | Reset any account's password |

Login and `/auth/me` response shape:
```json
{
  "token": "eyJ...",
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "role": "customer",
    "preferredStoreId": 2,
    "storeIds": []
  },
  "menus": [ ... ]
}
```

`storeIds` is populated for `worker` role (their assigned stores). Empty array for customer and admin (admin has access to all stores via query params).

---

## 6. Authentication & Security

- **JWT** — access token (30 days). Payload: `{ sub, role, storeIds[] }`.
- **Middleware** — `authenticate`: verifies JWT. `requireRole(...roles)`: checks role.
- **bcrypt** — cost factor 10. Passwords never logged.
- **Rate limiting** — login endpoint: 10 attempts per 15 min per IP (`@fastify/rate-limit`).
- **Stripe webhook** — verified via `stripe.webhooks.constructEvent` with raw body.
- **HTTPS** — enforced at reverse proxy (nginx/load balancer); API itself runs HTTP internally.

---

## 7. Business Rules

- Cart is store-scoped. Changing preferred store clears cart (client-side prompt, server clears on store change).
- Product with no `store_pricing` row for selected store cannot be added to cart (API returns 422).
- Max 5 images per product — enforced before upload is saved.
- Barcode must be globally unique across all products.
- Only admin can create staff accounts.
- Worker sees only orders for their assigned stores.
- Approving an order: stock deducted atomically per item in a DB transaction. If any product stock is insufficient, approval is blocked with a 422 error listing which items.
- CSV import: existing barcode → update. New barcode → create. Invalid row → skip and record in error report. Prices/stock not in CSV.
- All deletes are soft-deletes. Customers, products, staff: `deleted_at` timestamp.
- Order reference format: `MK-YYYYMMDD-NNNN` (sequential per day, zero-padded to 4 digits).

---

## 8. Tech Stack

| Package | Purpose |
|---|---|
| `fastify` | HTTP server |
| `@fastify/cors` | CORS |
| `@fastify/jwt` | JWT middleware |
| `@fastify/rate-limit` | Rate limiting |
| `@fastify/multipart` | File upload |
| `@fastify/static` | Serve /uploads |
| `mysql2` | MySQL driver |
| `knex` | Query builder + migrations |
| `bcrypt` | Password hashing |
| `stripe` | Payment processing |
| `csv-parse` | CSV parsing |
| `zod` | Request validation |
| `dotenv` | Config |

Remove: `better-sqlite3`, `@google/genai`.

---

## 9. File Structure

```
src/
  domain/
    entities/           # Store, Product, Customer, Order, etc. (TS interfaces)
    repositories/       # IProductRepository, IOrderRepository, etc. (interfaces)

  application/
    auth/               # AuthService
    stores/             # StoreService
    categories/         # CategoryService
    products/           # ProductService, CsvImportService
    stock/              # StockService
    pricing/            # PricingService
    cart/               # CartService
    orders/             # OrderService
    payments/           # PaymentService
    itemRequests/       # ItemRequestService
    admin/              # AdminService

  infrastructure/
    database/
      connection.ts     # mysql2 pool
      migrations/       # knex migration files
    repositories/       # MySQL implementations of domain repository interfaces
    storage/            # LocalFileStorage (save/delete files in ./uploads)
    stripe/             # StripeClient wrapper
    csv/                # CsvParser

  presentation/
    routes/             # One file per domain group
    controllers/        # One file per domain group
    middleware/         # authenticate.ts, requireRole.ts
    schemas/            # Zod schemas for each request body/query

  shared/
    errors/             # AppError, NotFoundError, ForbiddenError, ValidationError
    config.ts           # Typed env config
    utils/              # referenceNumber, pagination helpers

  index.ts              # App bootstrap
```

---

## 10. Non-Functional

- API p95 response < 500ms (indexed queries on barcode, product_id+store_id).
- CSV import of 1,000 rows < 60 seconds (batched inserts, stream parsing).
- No push notifications in Phase 1; clients poll `/orders/:id` at 30s intervals.
- PII (customer name, identifier) kept in DB; encrypted at rest via MySQL encryption or disk-level encryption on server.
- All deletes are soft; no hard deletes in Phase 1.
