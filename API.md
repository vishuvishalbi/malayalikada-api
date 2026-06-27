# Malayali Kada API Reference

**Base URL:** `http://localhost:3001/api/v1`  
**Auth:** Bearer JWT in `Authorization` header  
**Content-Type:** `application/json` (except multipart uploads)

---

## Authentication

### Roles

| Role | Access |
|---|---|
| `customer` | Self-signup via register. Customer app only. |
| `worker` | Created by admin. Order queue for assigned stores. |
| `admin` | Created by admin. Full access across all stores. |

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Customer self-signup |
| POST | `/auth/login` | public | Login (rate-limited: 10/15min/IP) |
| GET | `/auth/me` | any | Get current user + menus |
| POST | `/auth/refresh` | any | Refresh JWT token |
| POST | `/auth/admin/reset-password` | admin | Reset any account's password |

### POST /auth/register

**Body:**
```json
{
  "identifier": "jane@example.com",
  "identifier_type": "email",
  "password": "min8chars",
  "first_name": "Jane",
  "last_name": "Doe"
}
```
`identifier_type`: `"email"` | `"mobile"`

**Response 201:**
```json
{
  "token": "eyJ...",
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "role": "customer",
    "preferredStoreId": null,
    "storeIds": []
  },
  "menus": [...]
}
```

### POST /auth/login

**Body:**
```json
{
  "identifier": "jane@example.com",
  "password": "password123"
}
```

**Response 200:** Same shape as register — `{ token, user, menus }`.

### GET /auth/me

**Response 200:** `{ token, user, menus }`

`storeIds` is populated for `worker` role only. Admin and customer return `[]`.

### POST /auth/refresh

**Response 200:** `{ token }`

### POST /auth/admin/reset-password

**Body:**
```json
{
  "target_id": 5,
  "target_type": "customer",
  "new_password": "newpassword123"
}
```
`target_type`: `"customer"` | `"staff"`

**Response 200:** `{ message: "Password reset successful" }`

### Menu payloads by role

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
  { "key": "queue",   "label": "Order Queue", "icon": "inbox" },
  { "key": "done",    "label": "Completed",   "icon": "check-circle" },
  { "key": "profile", "label": "Profile",     "icon": "user" }
]
```

**admin**
```json
[
  { "key": "dashboard",     "label": "Dashboard",    "icon": "bar-chart" },
  { "key": "orders",        "label": "Orders",       "icon": "package" },
  { "key": "products",      "label": "Products",     "icon": "box" },
  { "key": "categories",    "label": "Categories",   "icon": "grid" },
  { "key": "stock",         "label": "Stock",        "icon": "layers" },
  { "key": "pricing",       "label": "Pricing",      "icon": "tag" },
  { "key": "staff",         "label": "Staff",        "icon": "users" },
  { "key": "customers",     "label": "Customers",    "icon": "user-check" },
  { "key": "item-requests", "label": "Item Requests","icon": "clipboard" },
  { "key": "import",        "label": "CSV Import",   "icon": "upload" }
]
```

---

## Stores

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stores` | public | List active stores |
| GET | `/stores/:id` | public | Store detail |
| POST | `/stores` | admin | Create store |
| PUT | `/stores/:id` | admin | Update store |
| POST | `/stores/:id/logo` | admin | Upload store logo (multipart) |
| DELETE | `/stores/:id/logo` | admin | Remove store logo |

### GET /stores

**Response 200:**
```json
[
  {
    "id": 1,
    "name": "Palakkad Store",
    "address": "123 Main St",
    "phone": "+64 9 000 0000",
    "bank_account": "12-3456-7890123-00",
    "icon": "store",
    "logo_filename": "store-1-logo-abc.jpg",
    "logo_url": "/uploads/store-1-logo-abc.jpg",
    "is_active": 1,
    "created_at": "2026-06-27T00:00:00.000Z",
    "updated_at": "2026-06-27T00:00:00.000Z"
  }
]
```

`logo_url` is `null` if no logo uploaded.

### POST /stores

**Body:**
```json
{
  "name": "Palakkad Store",
  "address": "123 Main St, Auckland",
  "phone": "+64 9 000 0000",
  "bank_account": "12-3456-7890123-00",
  "icon": "store"
}
```
`bank_account` and `icon` are optional.

**Response 201:** Store object with `logo_url`.

### POST /stores/:id/logo

`Content-Type: multipart/form-data`  
Field: `file` (image file)

**Response 200:** `{ "logo_url": "/uploads/store-1-logo-xyz.jpg" }`

---

## Categories

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/categories` | public | Tree of all categories |
| POST | `/categories` | admin | Create category |
| PUT | `/categories/:id` | admin | Update / reorder |
| DELETE | `/categories/:id` | admin | Soft-delete |
| POST | `/categories/:id/image` | admin | Upload banner image (multipart) |
| DELETE | `/categories/:id/image` | admin | Remove banner image |

### GET /categories

Returns a nested tree. Top-level categories contain `children[]`.

**Response 200:**
```json
[
  {
    "id": 1,
    "name": "Rice",
    "icon": "rice_bowl",
    "image_filename": null,
    "image_url": null,
    "parent_id": null,
    "sort_order": 0,
    "deleted_at": null,
    "children": [
      {
        "id": 5,
        "name": "Matta Rice",
        "icon": null,
        "image_url": null,
        "parent_id": 1,
        "sort_order": 0,
        "children": []
      }
    ]
  }
]
```

### POST /categories

**Body:**
```json
{
  "name": "Spices",
  "icon": "spa",
  "parent_id": null,
  "sort_order": 1
}
```
`icon`, `parent_id`, `sort_order` are optional.

**Response 201:** Category object.

### POST /categories/:id/image

`Content-Type: multipart/form-data`  
Field: `file`

**Response 200:** `{ "image_url": "/uploads/category-1-xyz.jpg" }`

---

## Products

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/products` | public | Browse products |
| GET | `/products/barcode/:barcode` | public | Lookup by barcode |
| GET | `/products/:id` | public | Product detail |
| POST | `/products` | admin | Create product |
| PUT | `/products/:id` | admin | Update product |
| DELETE | `/products/:id` | admin | Soft-delete |
| POST | `/products/:id/images` | admin | Upload image (max 5) |
| DELETE | `/products/:id/images/:imageId` | admin | Remove image |
| POST | `/products/import/csv` | admin | CSV bulk import |
| GET | `/products/import/logs` | admin | List import logs |
| GET | `/products/import/:importId/errors` | admin | Download error CSV |

### GET /products

**Query params:**

| Param | Type | Description |
|---|---|---|
| `category_id` | number | Filter by category |
| `search` | string | Search name or barcode |
| `store_id` | number | Filter with store context |
| `page` | number | Page (default 1) |
| `limit` | number | Per page (default 20, max 100) |

**Response 200:**
```json
{
  "items": [
    {
      "id": 1,
      "barcode": "8901234567890",
      "name": "Premium Matta Rice",
      "description": "Ancient nutrient-rich grain...",
      "category_id": 1,
      "brand": "Kerala Farms",
      "unit": "5kg Pack",
      "weight": 5000.000,
      "supplier": "Palakkad Co-op",
      "is_active": 1,
      "deleted_at": null,
      "created_at": "2026-06-27T00:00:00.000Z",
      "updated_at": "2026-06-27T00:00:00.000Z"
    }
  ],
  "total": 42
}
```

### GET /products/:id

**Response 200:** Product object plus:
```json
{
  "images": [
    { "id": 1, "product_id": 1, "filename": "product-1-abc.jpg", "sort_order": 0, "url": "/uploads/product-1-abc.jpg" }
  ]
}
```

### GET /products/barcode/:barcode

**Response 200:** Product object.  
**Response 404:** `{ "error": "Product not found" }` if barcode unknown.

### POST /products

**Body:**
```json
{
  "barcode": "8901234567890",
  "name": "Premium Matta Rice",
  "description": "Ancient nutrient-rich grain...",
  "category_id": 1,
  "brand": "Kerala Farms",
  "unit": "5kg Pack",
  "weight": 5000,
  "supplier": "Palakkad Co-op"
}
```
Optional: `description`, `brand`, `unit`, `weight`, `supplier`.  
Returns 409 if barcode already exists.

**Response 201:** Product object.

### POST /products/:id/images

`Content-Type: multipart/form-data`  
Field: `file`

Max 5 images per product — returns 422 if limit reached.

**Response 201:** `{ id, product_id, filename, sort_order, url }`

### POST /products/import/csv

`Content-Type: multipart/form-data`  
Field: `file` (CSV file)

**CSV columns:** `barcode`, `name`, `description`, `category_id`, `brand`, `unit`, `weight`, `supplier`

- Existing barcode → updates product
- New barcode → creates product
- Invalid row → skipped, recorded in error report

**Response 200:**
```json
{
  "id": 1,
  "filename": "products.csv",
  "imported_by": 2,
  "rows_total": 100,
  "rows_ok": 97,
  "rows_failed": 3,
  "error_report_filename": "import-errors-1719446400000.csv",
  "created_at": "2026-06-27T00:00:00.000Z"
}
```

### GET /products/import/:importId/errors

Returns the error report CSV as a file download.

---

## Stock

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stock` | admin | List stock levels |
| PUT | `/stock` | admin | Set stock for product+store |

### GET /stock

**Query params:** `store_id`, `product_id`, `low_stock=true`

`low_stock=true` filters rows where `quantity <= low_stock_threshold`.

**Response 200:**
```json
[
  { "product_id": 1, "store_id": 1, "quantity": 50, "low_stock_threshold": 10 }
]
```

### PUT /stock

**Body:**
```json
{
  "product_id": 1,
  "store_id": 1,
  "quantity": 50,
  "low_stock_threshold": 10
}
```
`low_stock_threshold` defaults to 10. Uses upsert (creates or updates).

**Response 200:** Stock row.

---

## Pricing

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/pricing` | admin | List prices |
| POST | `/pricing` | admin | Set price for product+store |
| PUT | `/pricing/:productId/:storeId` | admin | Update price |

### GET /pricing

**Query params:** `store_id`, `product_id`

**Response 200:**
```json
[
  { "product_id": 1, "store_id": 1, "price_nzd": "12.99", "effective_date": "2026-06-27" }
]
```

### POST /pricing

**Body:**
```json
{
  "product_id": 1,
  "store_id": 1,
  "price_nzd": 12.99,
  "effective_date": "2026-06-27"
}
```
`effective_date` format: `YYYY-MM-DD`. Uses upsert.

**Response 200:** Pricing row.

### PUT /pricing/:productId/:storeId

**Body:**
```json
{
  "price_nzd": 14.99,
  "effective_date": "2026-07-01"
}
```

**Response 200:** Updated pricing row.

---

## Cart

All cart endpoints require `customer` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/cart` | customer | Get cart with totals |
| POST | `/cart/items` | customer | Add item (or increment qty) |
| PUT | `/cart/items/:productId` | customer | Set exact quantity |
| DELETE | `/cart/items/:productId` | customer | Remove item |
| DELETE | `/cart` | customer | Clear cart |

Cart is store-scoped — tied to the customer's `preferred_store_id`. Products without a `store_pricing` row for the customer's store cannot be added (returns 422).

### GET /cart

**Response 200:**
```json
{
  "storeId": 1,
  "items": [
    {
      "productId": 1,
      "name": "Premium Matta Rice",
      "quantity": 2,
      "unitPrice": 12.99,
      "lineTotal": 25.98
    }
  ],
  "grandTotal": 25.98
}
```

### POST /cart/items

**Body:**
```json
{
  "product_id": 1,
  "quantity": 2
}
```

Returns 422 if product has no pricing at the customer's preferred store.

**Response 201:** Cart object (same as GET /cart).

### PUT /cart/items/:productId

**Body:**
```json
{ "quantity": 3 }
```
Quantity `0` removes the item.

**Response 200:** Updated cart row.

### DELETE /cart/items/:productId

**Response 204:** No content.

### DELETE /cart

**Response 204:** No content.

---

## Orders

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/orders` | customer | Submit order from cart |
| GET | `/orders` | customer | Order history |
| GET | `/orders/:id` | customer | Order detail |
| GET | `/orders/worker/queue` | worker/admin | Pending orders queue |
| PUT | `/orders/:id/approve` | worker/admin | Approve order |
| PUT | `/orders/:id/reject` | worker/admin | Reject order |
| GET | `/orders/admin` | admin | All orders (filtered) |
| GET | `/orders/admin/export` | admin | Export CSV |

### POST /orders

Submits the customer's current cart as an order. Cart is cleared after. Creates a stub Stripe PaymentIntent.

**Body:** none (uses authenticated customer's cart)

**Response 201:**
```json
{
  "id": 1,
  "reference_no": "MK-20260627-0001",
  "customer_id": 5,
  "store_id": 1,
  "status": "pending_approval",
  "total_nzd": "25.98",
  "stripe_payment_intent_id": "pi_stub_5_1719446400000",
  "payment_status": "unpaid",
  "rejection_reason": null,
  "actioned_by": null,
  "actioned_at": null,
  "created_at": "2026-06-27T00:00:00.000Z",
  "orderItems": [
    { "id": 1, "order_id": 1, "product_id": 1, "quantity": 2, "unit_price_nzd": "12.99" }
  ]
}
```

Order statuses: `pending_approval` | `approved` | `rejected`  
Payment statuses: `unpaid` | `paid` | `refunded`  
Reference format: `MK-YYYYMMDD-NNNN`

### GET /orders

**Query params:** `page`, `limit`

**Response 200:** `{ items: Order[], total: number }`

### GET /orders/:id

Customer can only view their own orders (403 otherwise).

**Response 200:** Order object with `orderItems[]`.

### GET /orders/worker/queue

Returns pending orders for the worker's assigned stores, oldest first.

**Response 200:** `Order[]`

### PUT /orders/:id/approve

Atomically deducts stock for each item. If any item has insufficient stock, returns 422 with details.

**Response 200:** Updated order object.

**Response 422 (insufficient stock):**
```json
{
  "error": "Insufficient stock for approval",
  "data": [
    { "product_id": 1, "requested": 5, "available": 2 }
  ]
}
```

### PUT /orders/:id/reject

**Body:**
```json
{ "reason": "Out of stock for the season" }
```

**Response 200:** Updated order object.

### GET /orders/admin

**Query params:** `store_id`, `status`, `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), `page`, `limit`

**Response 200:** `{ items: Order[], total: number }`

### GET /orders/admin/export

**Query params:** `store_id`, `from`, `to`

Returns a CSV file download (`Content-Type: text/csv`).

---

## Payments

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payments/create-intent` | customer | Create Stripe PaymentIntent |
| POST | `/payments/webhook` | public | Stripe webhook |

### POST /payments/create-intent

**Body:**
```json
{
  "order_id": 1,
  "amount_nzd": 25.98
}
```

**Response 200:**
```json
{
  "clientSecret": "stub_secret_1",
  "paymentIntentId": "pi_stub_1"
}
```

When `STRIPE_SECRET_KEY` is set, returns a real Stripe PaymentIntent.

### POST /payments/webhook

Stripe sends this. Verifies `stripe-signature` header. Updates `payment_status = 'paid'` on the order.

**Body:** Raw Stripe event payload  
**Response 200:** `{ "received": true }`

---

## Item Requests

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/item-requests` | customer | Submit a product request |
| GET | `/item-requests` | customer | Own requests |
| GET | `/item-requests/admin` | admin | All requests |
| PUT | `/item-requests/:id/status` | admin | Update status |

### POST /item-requests

Uses the customer's `preferred_store_id` automatically.

**Body:**
```json
{
  "product_name": "Chakka Varatti",
  "barcode": "8901234500000",
  "notes": "Prefer the Malabar brand"
}
```
`barcode` and `notes` are optional.

**Response 201:**
```json
{
  "id": 1,
  "customer_id": 5,
  "store_id": 1,
  "product_name": "Chakka Varatti",
  "barcode": null,
  "notes": "Prefer the Malabar brand",
  "status": "new",
  "admin_notes": null,
  "created_at": "2026-06-27T00:00:00.000Z"
}
```

Statuses: `new` | `sourced` | `declined`

### GET /item-requests/admin

**Query params:** `store_id`, `status`

**Response 200:** `ItemRequest[]`

### PUT /item-requests/:id/status

**Body:**
```json
{
  "status": "sourced",
  "admin_notes": "Now available in aisle 3"
}
```

**Response 200:** `{ "message": "Status updated" }`

---

## Admin

All admin endpoints require `admin` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/dashboard` | admin | Summary stats |
| GET | `/admin/staff` | admin | List all staff |
| POST | `/admin/staff` | admin | Create staff account |
| PUT | `/admin/staff/:id` | admin | Update staff |
| GET | `/admin/customers` | admin | Searchable customer list |
| GET | `/admin/customers/:id` | admin | Customer detail + order history |

### GET /admin/dashboard

**Response 200:**
```json
{
  "ordersToday": 12,
  "pendingOrders": 4,
  "completedOrders": 8,
  "revenueByStore": [
    { "storeId": 1, "name": "Palakkad Store", "revenueNzd": 1450.50 }
  ]
}
```

### POST /admin/staff

**Body:**
```json
{
  "identifier": "worker@example.com",
  "identifier_type": "email",
  "password": "password123",
  "name": "John Worker",
  "role": "worker",
  "store_ids": [1, 2]
}
```
`role`: `"worker"` | `"admin"`. `store_ids` optional (for workers).

**Response 201:** StaffUser object.

### PUT /admin/staff/:id

**Body:**
```json
{
  "name": "John Senior Worker",
  "role": "worker",
  "is_active": true,
  "store_ids": [1]
}
```
All fields optional.

**Response 200:** Updated StaffUser object.

### GET /admin/customers

**Query params:** `search` (searches identifier, first/last name), `page`, `limit`

**Response 200:** `{ items: Customer[], total: number }`

### GET /admin/customers/:id

**Response 200:** Customer object with `orders[]` (last 20 orders).

---

## Static Files

| Method | Path | Description |
|---|---|---|
| GET | `/uploads/:filename` | Serve uploaded images |

Product images, category banners, and store logos are served from this path. URLs are returned in their respective API responses as `url`, `image_url`, or `logo_url` fields.

---

## Error Responses

All errors follow this shape:

```json
{
  "error": "Human-readable message",
  "data": { }
}
```

`data` is present on validation errors (422) and contains structured field errors or detail arrays (e.g., insufficient stock items).

| Status | Meaning |
|---|---|
| 400 | Bad request |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but wrong role |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate barcode) |
| 422 | Validation error or business rule violation |
| 500 | Unexpected server error |

---

## Environment Variables

```
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=malayalikada
JWT_SECRET=change_me_in_production
STRIPE_SECRET_KEY=          # optional; stubbed when absent
CORS_ORIGIN=*
```
