# malayalikada-api

Fastify backend API for Malayali Kada grocery store app.

## Setup
```bash
npm install
cp .env.example .env
# edit .env with your GEMINI_API_KEY
npm run dev
```

## Endpoints
- GET  /health
- GET  /products
- GET  /products/barcode?code=...
- GET  /cart (x-user-id header)
- POST /cart
- GET  /orders
- POST /orders
- POST /orders/update
- POST /auth/login
- POST /auth/register
- POST /auth/update
- POST /gemini/consult
