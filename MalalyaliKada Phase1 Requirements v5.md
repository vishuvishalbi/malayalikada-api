**MALAYALI KADA**

Multi-Store Mobile Commerce Platform

**Phase 1 Requirements & Acceptance Criteria**

**Target Delivery: 8 Weeks**

| Prepared by             | Valartech Ltd.                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client                  | Malayali Kada                                                                                                                                          |
| Version                 | 1.2                                                                                                                                                    |
| Date                    | June 22<sup>nd</sup> 2026                                                                                                                              |
| Scope                   | Phase 1 MVP - 8 Week Build                                                                                                                             |
| Phase -1 Total Estimate | NZ\$3,800 + GST (my budget is 3000+Gst) for phase 1 need to workout what can we need to do for meeting this target                                     |
| Auth Model              | Email or Mobile + Password (no OTP)<br><br>But need way to avoid spam or bot accounts registering and phishing. Captcha or visually align images etc … |
| Payment                 | Pay at Shop - no online payment.<br><br>We need ONLINE Payment no need to pay at shop we are not integrating with EPOSNOW.                             |

Alternatively quote for below requirements:

Phase 1 requirement simplified as

- Admins should be able to bulk upload products, images, weight, category and price using excel file.
- Customer should register with NZ Phone number (enter twice), first name, last name, email, and capatcha or image matching visual.
- Customer should be able to add products to cart by searching with name or barcode or by **scanning product barcode using mobile camera.**
- Customers should be able to ADD QTY + or -
- Customer while completing transactions there should be two options be presented
- Bank Transfer or pay the purchase by Card.
- When selecting bank transfer the Malayali kada Bank details to be presented + the transaction or docket reference number customers can copy the details and do the bank transfer and click next and finish the checkout - the order will be pending in the backend with date/ time details and a Transaction number
- When selecting card it should be ecommerce integration. Accept visa/ master card and amex.
- Admins should be able to see what is the customer order and print out.
- Admins should be able to fulfil order when its given to customer.
- Every transactions should generate an invoice or docket number and that needs to be visible in the order print our or can be searched for future reference. While searching it should show customer details who purchased items.

# 1\. Introduction

This document defines the Phase 1 scope, functional requirements, and acceptance criteria for the Malayali Kada multi-store mobile commerce platform. Target delivery is 8 weeks from project kick-off.

## 1.1 What We Are Building

- Customer Mobile App (iOS + Android) - browse, scan, cart, order.
- Shop Worker App (iOS + Android) - order queue, approve/reject in-store.
- Admin Dashboard (Web) - product, stock, pricing, staff, customer, order management.
- Admin should be able to print orders
- Customer should get orders email to them when the payments are done.
- Own backend and database - full data ownership, no third-party POS.

## 1.2 Simplified Decisions for 8-Week Target

- Authentication: email or mobile number + password. No OTP, no SMS gateway cost. But need way to prevent unwanted registrations and scammers.
- Payment: Pay at Shop only. No Stripe or online payment in Phase 1. Need to do ecommerce payment gateway. We not integrating with EPOSNOW.
- No EPOS integration. Products managed via CSV import or manual admin entry.

## 1.3 Out of Scope - Phase 1

- OTP / SMS verification.
- Online payment (Stripe or any gateway). This should be included
- Push notifications (order status via in-app polling only).
- Delivery / shipping module.
- Loyalty points or promotions.
- Multi-language support.
- Forgot password via email/SMS (Phase 2 - admin can reset passwords manually for MVP).

# 2\. Core Data Entities

| **Entity**     | **Key Attributes**                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Store          | store_id, name, address, phone, is_active                                                                                         |
| Product        | product_id, name, description, barcode (EAN/UPC), category_id, brand, unit, weight, images\[ \], is_active, supplier, brand, UNIT |
| Product Stock  | product_id, store_id, quantity, low_stock_threshold                                                                               |
| Store Pricing  | product_id, store_id, price_nzd, effective_date, prize2_NZD, price3_NZD, price4_NZD                                               |
| Category       | category_id, name, parent_category_id, sort_order                                                                                 |
| Customer       | customer_id, identifier (email or mobile), password_hash, name, preferred_store_id, created_at                                    |
| Staff User     | user_id, identifier (email or mobile), password_hash, name, role (worker/admin), store_id\[ \], is_active                         |
| Order          | order_id, customer_id, store_id, status, items\[ \], total_nzd, created_at, actioned_by, actioned_at                              |
| Order Item     | order_item_id, order_id, product_id, quantity, unit_price_nzd                                                                     |
| Item Request   | request_id, customer_id, store_id, product_name, barcode, notes, status, created_at                                               |
| CSV Import Log | import_id, filename, imported_by, rows_total, rows_ok, rows_failed, created_at                                                    |

# 3\. User Flows

## 3.1 Customer

- Sign up with email or mobile number + password. No OTP step.
- Select preferred store on first login (required before ordering).
- Browse by category or search by name/barcode.
- Scan product barcode via in-app scanner to open product or trigger Request an Item.
- Add to cart (store-specific prices shown), review, submit order.
- Track order status in real time.
- Request an Item for products not in catalogue.

## 3.2 Shop Worker

- Log in with email or mobile + password (worker role).
- View queue of Pending Approval orders for assigned store.
- Open order detail, verify items with customer.
- Approve (mark as fulfilled) or Reject with reason.
- Should be able to print the order in an A4 page.

## 3.3 Admin

- Log in with email or mobile + password (admin role).
- Full product, stock, pricing, category, and CSV import management.
- Staff and customer account management.
- Order oversight across all stores; can approve or reject any order.
- Review and action customer item requests.
- Should be able to print orders or customer details if needed

# 4\. Functional Requirements & Acceptance Criteria

### F1 Authentication

- Signup: customer provides email or mobile number + password (min 8 chars). Both identifier types accepted - user chooses.
- Login: email or mobile + password for all roles (customer, worker, admin).
- Staff accounts (worker/admin) created by admin only - no self-signup.
- Password stored as bcrypt hash. Plain text never stored or logged.
- Session token (JWT) valid for 30 days with silent refresh.
- Forgot Password: admin manually resets password via Admin Dashboard in Phase 1 (no self-service reset email/SMS).

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                          | **Test Method**                                                      | **Pass Condition**                                              |
| ----- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1     | Customer can sign up with email + password                        | Manual: register with valid email and 8+ char password               | Account created; customer lands on store selection screen       |
| 2     | Customer can sign up with mobile number + password                | Manual: register with valid NZ mobile and 8+ char password           | Account created; customer lands on store selection screen       |
| 3     | Duplicate email or mobile rejected at signup                      | Manual: attempt signup with already-registered identifier            | Error shown; account not created                                |
| 4     | Login with correct credentials succeeds                           | Manual: log in with registered email/mobile + password               | User authenticated; lands on correct home screen for their role |
| 5     | Login with wrong password fails                                   | Manual: enter wrong password                                         | Error shown; no session created                                 |
| 6     | Worker logs in and sees Worker Queue, not Customer Home           | Manual: log in with worker-role account                              | Worker app queue shown                                          |
| 7     | Admin can reset a customer or staff password from Admin Dashboard | Manual: use admin reset function, have user log in with new password | New password works; old password no longer valid                |
| 8     | JWT session persists across app restarts within 30 days           | Manual: close and reopen app                                         | User remains authenticated                                      |

### F2 Store Selection & Store-Level Pricing

- Customer selects preferred store after first login. Required before cart checkout.
- Store can be changed in profile settings. Changing store clears cart with prompt.
- All prices shown are specific to the customer's selected store.
- Product with no price at selected store shows "Price not available" and cannot be added to cart.
- Admin sets and edits price per product per store.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                                               | **Test Method**                                                | **Pass Condition**                                   |
| ----- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| 1     | New customer prompted to select store after first login                                | End-to-end: create account, complete login                     | Store selection screen shown before Home             |
| 2     | Product shows price for selected store                                                 | Manual: set different prices for two stores, toggle in profile | Price updates to selected store price on toggle      |
| 3     | Product with no price at selected store is non-purchasable                             | Manual: browse product with no price at current store          | "Price not available" shown; Add to Cart disabled    |
| 4     | Changing store with items in cart shows confirmation prompt and clears cart on confirm | Manual: add items, switch store                                | Prompt shown; cart cleared only after user confirms  |
| 5     | Admin can add/edit store-specific price; reflects in customer app                      | End-to-end: set price in admin, check customer app             | Correct price shown for that store within 60 seconds |

### F3 Product Catalogue - Manual Management

- Admin creates/edits product: name, description, barcode (unique), category, brand, unit, weight/volume, up to 5 images, active/inactive.
- Deactivating a product hides it from customers immediately.
- Categories: create, rename, reorder, one level of nesting (parent/child).
- Barcode unique across catalogue; duplicate rejected on save.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                           | **Test Method**                             | **Pass Condition**                      |
| ----- | ------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------- |
| 1     | Admin creates product; visible in customer app in correct category | End-to-end: add product, check customer app | Product visible without app restart     |
| 2     | Duplicate barcode rejected                                         | Manual: enter barcode already in use        | Save blocked; error shown               |
| 3     | Deactivated product disappears from customer app immediately       | Manual: deactivate, check customer app      | Product no longer in listings or search |
| 4     | 6th image upload blocked                                           | Manual: try to upload 6 images              | Error shown after 5th; 6th not saved    |

### F4 Product Catalogue - CSV Import

- Admin uploads CSV to bulk create or update products.
- Columns: barcode, name, description, category, brand, unit, weight, active.
- Existing barcode = update. New barcode = create.
- Prices and stock NOT in CSV; managed per store separately.
- Invalid rows skipped; valid rows processed. Partial import is acceptable.
- Post-import summary: total rows, imported, failed.
- Downloadable CSV error report with row number and reason.
- Import log retained per upload.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                        | **Test Method**                               | **Pass Condition**                              |
| ----- | --------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| 1     | Valid 100-row CSV imports all rows successfully                 | Manual: upload clean CSV                      | Summary shows 100 imported, 0 failed            |
| 2     | Row with existing barcode updates product, no duplicate created | Manual: CSV with known barcode                | Product attributes updated; no new record       |
| 3     | Row missing required name field is skipped and in error report  | Manual: CSV with one row missing name         | Row skipped; error report includes row + reason |
| 4     | Error report downloadable as CSV                                | Manual: import with bad rows, download report | CSV downloaded with row numbers and error text  |
| 5     | Import does not change store prices or stock levels             | Manual: import CSV, check pricing and stock   | No change to prices or stock after import       |

### F5 Stock Management

- Stock tracked per product per store.
- Admin sets/adjusts stock quantity for any product at any store.
- Low-stock threshold per product per store (default: 10 units).
- Products below threshold flagged in Admin Dashboard.
- Stock auto-deducted when an order is Approved (quantity reduced per ordered item at that store).
- Product shows Out of Stock in customer app when store stock reaches zero.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                              | **Test Method**                                                    | **Pass Condition**                                     |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| 1     | Admin sets stock for product at specific store; value saved           | Manual: set stock, reload inventory view                           | Value persisted and shown correctly                    |
| 2     | Product below threshold shows low-stock alert in dashboard            | Manual: set stock below threshold                                  | Alert shown in inventory view                          |
| 3     | Two stores show independent stock levels for same product             | Manual: set different stock per store for one product              | Each store shows its own value                         |
| 4     | Approving an order deducts correct quantities from store stock        | End-to-end: set stock to 5, approve order for 2 units, check stock | Stock reduced to 3 at that store                       |
| 5     | Product shows Out of Stock when store stock hits zero after deduction | End-to-end: approve order that exhausts stock, check customer app  | Product badge shows Out of Stock; Add to Cart disabled |

### F6 Product Browsing & Barcode Scanner

- Home: category grid, search bar, product listings.
- Product Details: swipeable images, name, price (NZD, store-specific), brand, weight, description, stock status badge.
- Search: partial match on name, brand, barcode.
- Barcode scanner via FAB and top bar icon.
- Known barcode scan: opens Product Details.
- Unknown barcode scan: opens Request an Item with barcode pre-filled.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                           | **Test Method**                                | **Pass Condition**                         |
| ----- | ------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------ |
| 1     | Home loads within 2 seconds on 4G                                  | Performance test on 4G                         | Renders in under 2 seconds                 |
| 2     | Product Details shows store-specific price                         | Manual: open product, compare to admin pricing | Correct store price shown                  |
| 3     | Partial name search returns matching products                      | Manual: type partial name                      | Matching products listed                   |
| 4     | Known barcode scan opens correct product                           | Manual: scan in-catalogue barcode              | Correct Product Details opened             |
| 5     | Unknown barcode scan opens Request an Item with barcode pre-filled | Manual: scan unlisted barcode                  | Request form opened with barcode populated |

### F7 Cart & Order Submission

- Cart persists across sessions per authenticated customer.
- Cart scoped to selected store (store prices applied).
- Cart shows: product, quantity controls, unit price, line total, cart total (NZD).
- Minimum 1 item to checkout.
- Order submitted with status: Pending Approval.
- Order confirmation: reference number, store name, items, total.
- Order goes to worker queue for the customer's selected store.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                     | **Test Method**                           | **Pass Condition**                      |
| ----- | ------------------------------------------------------------ | ----------------------------------------- | --------------------------------------- |
| 1     | Cart total equals sum of store-specific line totals          | Manual: add multiple items, verify        | Total matches manual calculation        |
| 2     | Cart persists after app restart                              | Manual: add items, close and reopen       | Items and quantities unchanged          |
| 3     | Order appears in worker queue within 5 seconds of submission | End-to-end: place order, check worker app | Order visible in queue within 5 seconds |
| 4     | Confirmation screen shows reference, store, items, total     | Manual: place order, view confirmation    | All four elements present and correct   |
| 5     | Empty cart checkout blocked                                  | Manual: attempt checkout with empty cart  | Error shown; no order created           |

### F8 Order Tracking

- Customer views current and past orders.
- Statuses: Pending Approval, Approved (Sold), Rejected.
- Status updates via in-app polling (30s interval). No push notifications in Phase 1.
- Rejection shows reason to customer.
- Full order history retained.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                                      | **Test Method**                                          | **Pass Condition**                                       |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| 1     | Tracking shows Pending Approval immediately after order placed                | End-to-end: place order, open tracking                   | Status shows Pending Approval                            |
| 2     | Status updates to Approved within 30 seconds of worker approval (via polling) | End-to-end: approve order, check customer app within 30s | Status updated without requiring manual refresh          |
| 3     | Rejected order shows rejection reason to customer                             | End-to-end: reject with reason, check customer app       | Reason text visible on order tracking screen             |
| 4     | Past orders visible in order history                                          | Manual: view history after order completed               | Orders listed with reference, store, date, status, total |

### F9 Shop Worker App

- Login: email or mobile + password (worker role).
- Queue: Pending Approval orders for assigned store only, sorted oldest first.
- Order Detail: customer name, mobile, items, quantities, NZD prices, total.
- Tap-to-call customer mobile from order detail.
- Approve & Mark as Sold: payment confirmed in person; status -> Approved.
- Reject: requires written reason; status -> Rejected; customer notified.
- Completed orders (approved/rejected) move to a done tab; not deleted.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                                             | **Test Method**                                                  | **Pass Condition**                         |
| ----- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------ |
| 1     | Worker sees only orders for their assigned store                                     | End-to-end: place orders at two stores, log in as store A worker | Only store A orders visible                |
| 2     | Queue oldest first                                                                   | End-to-end: place two orders, check order                        | Earlier order at top                       |
| 3     | Order detail shows all items and NZD total matching placed order                     | Manual: compare detail to placed order                           | Items, quantities, and total match exactly |
| 4     | Approve updates status; customer app reflects Approved within 30 seconds via polling | End-to-end: approve, check customer app                          | Status updated within 30 seconds           |
| 5     | Reject without reason is blocked                                                     | Manual: tap reject, leave reason blank                           | Submit blocked; error shown                |
| 6     | Reject with reason updates status; reason visible on customer order tracking         | End-to-end: reject with reason, check customer app               | Status Rejected; reason text shown         |
| 7     | Approved orders in done tab and not deletable                                        | Manual: approve order, check done tab                            | Order in done tab; no delete option        |

### F10 Admin Dashboard

- Summary cards per store and all-stores aggregate: orders today, pending, completed, revenue (NZD).
- Admin can filter by store.
- Admin can approve or reject any Pending Approval order.
- Staff Management: create, edit, deactivate worker/admin accounts; assign stores.
- Customer Management: searchable list with profile, identifier, preferred store, order history.
- Item Requests: list; update status (New / Sourced / Declined) with notes.
- Order export as CSV (date range filter).

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                                | **Test Method**                                        | **Pass Condition**                       |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| 1     | Dashboard cards show correct counts for today                           | Manual: place known orders, check cards                | Counts match actual orders               |
| 2     | Store filter updates all cards and lists to selected store              | Manual: apply store filter                             | Data reflects selected store only        |
| 3     | Admin approves order; status reflects in customer app within 30 seconds | End-to-end: approve from dashboard, check customer app | Order status updated via polling         |
| 4     | Admin creates worker account; worker can log in to correct store queue  | End-to-end: create worker, log in as worker            | Worker authenticated; sees correct queue |
| 5     | Customer order history visible in Customer Management                   | Manual: look up customer, view orders                  | All orders listed correctly              |
| 6     | Order CSV export contains all orders in date range                      | Manual: export 7-day range                             | Row count matches order count for period |

### F11 Request an Item

- Customer submits request: product name (required), barcode (optional, pre-filled from scan), notes (optional), store (pre-filled).
- Customer views their submitted requests and current status.
- Admin reviews in dashboard; updates status (New / Sourced / Declined) with notes.

**Acceptance Criteria**

| **#** | **Acceptance Criterion**                                            | **Test Method**                            | **Pass Condition**                |
| ----- | ------------------------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| 1     | Request with name only submits successfully                         | Manual: submit with name only              | Request saved; confirmation shown |
| 2     | Unknown barcode scan pre-fills barcode in request form              | Manual: scan unknown barcode, open request | Barcode field populated           |
| 3     | Request appears in Admin dashboard with timestamp and customer info | End-to-end: submit, check admin            | Request visible with correct data |
| 4     | Admin status update saved and displayed                             | Manual: update status and notes, reload    | Status and notes persisted        |

# 5\. Non-Functional Requirements

## 5.1 Performance

- App cold start under 3 seconds on mid-range Android (2022+) and iPhone SE (2020+).
- API response under 500ms at p95.
- CSV import of 1,000 rows completes within 60 seconds.
- Order status polling interval: 30 seconds.

## 5.2 Security

- All API traffic over HTTPS / TLS 1.2+.
- Passwords stored as bcrypt hash (min cost factor 10). Never logged.
- Role-based access enforced server-side.
- Customer PII encrypted at rest.
- Rate limiting on login endpoint (max 10 attempts per 15 minutes per IP).

## 5.3 Data Retention

- All customer profiles, orders, item requests retained indefinitely.
- Soft-delete only in Phase 1 - no permanent deletion.
- CSV import logs retained 12 months minimum.

## 5.4 Compatibility

- Customer and Worker Apps: iOS 15+ and Android 10+.
- Admin Dashboard (Web): Chrome, Firefox, Safari - latest two major versions, desktop-primary.

# 6\. Risks & Mitigations

The 8-week target is achievable but requires strict scope discipline and timely client inputs. Key risks:

| **Risk**                                                            | **Mitigation**                                                                                 | **Residual Impact**                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **8 weeks is aggressive for 3 apps + backend**                      | Parallel development across customer app, worker app, and admin from Week 2. No feature creep. | Any scope addition in-flight will require deadline extension.     |
| **App Store review times (Apple: 1-3 days, Google: hours to days)** | Submit to stores by end of Week 7 to have buffer                                               | If Apple rejects first submission, delivery may slip by 2-5 days. |
| **Client content not ready (products, images, store data)**         | Dev uses seeded dummy data; replaced at deployment                                             | Client must provide real product CSV and store list by Week 3.    |
| **UAT feedback late in cycle**                                      | Internal QA from Week 5; client UAT window Week 6-7 only                                       | Feedback received after Week 7 deferred to post-launch patch.     |

# 7\. Investment & Payment Terms

All prices are in New Zealand Dollars (NZD) and exclude GST.

| **Payment**                 | **Amount (NZD)**    |
| --------------------------- | ------------------- |
| Advance (on sign-off)       | NZ\$1,000           |
| Final Payment (on delivery) | NZ\$2,500           |
| **TOTAL**                   | **NZ\$3,500 + GST** |

# 8\. 8-Week Milestone Plan

| **Week(s)** | **Milestone**                  | **Deliverable**                                                                | **Client Dependency**                        |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------- |
| 1           | Discovery & Setup              | Tech spec, data model, repo, CI/CD, backend scaffold                           |                                              |
| 1-2         | Product Catalogue + CSV Import | Admin can manage products, categories, store prices, stock; CSV import working | Client provides initial product CSV          |
| 2-4         | Customer App - Core            | Auth, browse, barcode scan, cart, order submission, store selection            |                                              |
| 3-5         | Admin Dashboard                | Full admin panel, order management, staff + customer views                     |                                              |
| 4-5         | Worker App                     | Login, queue, order detail, approve/reject flow                                |                                              |
| 5-6         | Integration & End-to-End       | Full flow testing across all three apps                                        | Client UAT availability required             |
| 6-7         | QA & Bug Fixes                 | Test report, regression fixes                                                  |                                              |
| 8           | Deployment & Handover          | Production release, App Store + Play Store submission, documentation           | Client Apple/Google accounts ready by Week 6 |

Note: Weeks run concurrently where shown. Parallel tracks require adequate resourcing from Valartech. Any change to scope after Week 2 is a formal change request and may affect the delivery date.

# 9\. Assumptions & Dependencies

- Client provides store names, addresses, and contact info before Week 1 ends.
- Client provides initial product CSV before end of Week 2.
- Client provides product images or approves placeholder images by Week 2.
- Apple Developer and Google Play accounts provided by client before Week 7 (required for app submission).
- Client nominates one sign-off contact available for approvals within 24 hours during the build.
- Client available for UAT during Weeks 6-7. Feedback after Week 7 is post-launch.

# 10\. Sign-Off

By signing below, both parties confirm agreement with the scope, requirements, acceptance criteria, 8-week timeline, and pricing in this document. Any scope change after signing requires a written change request.

| **Valartech Ltd.**                                                                                                                                                                                     | **Malayali Kada**                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name: \_**\_**\_**\_**\_**\_**\_**\_**\_**<br><br>Title: \_**\_**\_**\_**\_**\_**\_**\_**\_**<br><br>Signature: \_**\_**\_**\_**\_**\_**\_**\_**\_**<br><br>Date: \_**\_**\_**\_**\_**\_**\_**\_**\_** | Name: \_**\_**\_**\_**\_**\_**\_**\_**\_**<br><br>Title: \_**\_**\_**\_**\_**\_**\_**\_**\_**<br><br>Signature: \_**\_**\_**\_**\_**\_**\_**\_**\_**<br><br>Date: \_**\_**\_**\_**\_**\_**\_**\_**\_** |