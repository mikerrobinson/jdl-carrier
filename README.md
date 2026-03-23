# JDL Shipping Rates - Shopify Carrier Service

A Cloudflare Worker that implements a Shopify carrier rate service to provide customm shipping rates for JDL's Shopify store. Handles hazardous materials, accounts for boxing using using the Fedex (Class 3, UN1263/UN1210) shipping via FedEx with proper dangerous goods declarations.

## Features

- **Local Delivery**: Free delivery for Miami-Dade and Broward County zip codes
- **US Domestic Shipping**: FedEx Ground and Express services with negotiated rates
- **International Military**: FedEx International services for military customers
- **Freight Forwarding**: Placeholder rates for non-military international orders
- **Dangerous Goods Handling**: All shipments flagged with proper DG parameters
- **Priority Handling**: Optional expedited fulfillment for all FedEx services
- **Dynamic Box Packing**: Greedy bin-packing algorithm for optimal packaging

## Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- FedEx Developer Account with REST API credentials
- Shopify store with Carrier Service API access

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Secrets

```bash
npx wrangler secret put FEDEX_CLIENT_ID
npx wrangler secret put FEDEX_CLIENT_SECRET
npx wrangler secret put FEDEX_ACCOUNT_NUMBER
```

### 3. Update Configuration (if needed)

Edit `src/config/config.ts` to update shipper address, box sizes, handling fees, or local delivery zip codes.

## Development

### Run Locally

```bash
npm run dev
```

This starts the worker at `http://localhost:8787`.

### Test the Endpoint

```bash
curl -X POST http://localhost:8787/rates \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: $(echo -n '{"rate":...}' | openssl dgst -sha256 -hmac 'your-secret' -binary | base64)" \
  -d '{"rate":{"origin":{},"destination":{"country":"US","postal_code":"90210","province":"CA","city":"Beverly Hills","name":"Test","address1":"123 Test St","address2":"","phone":""},"items":[{"name":"Test","sku":"TEST","quantity":1,"grams":1000,"price":5000,"vendor":"JDL","requires_shipping":true,"taxable":true,"fulfillment_service":"manual","properties":{},"product_id":1,"variant_id":1}],"currency":"USD","locale":"en"}}'
```

### Run Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run
```

## Deployment

```bash
npm run deploy
```

## Register an App and the Carrier Service with Shopify

A Shopify app needs to be created and installed in the JDL store in order to get the admin api token needed to register this custom carrier service using the admin api. This is best done in the [Shopify dev dashboard](https://dev.shopify.com/dashboard). Use the "Start from Dev Dashboard" option and specify:

- App name: JDL Custom Shipping
- scope(s): write_shipping

After creating the app, select the distribution method using the link in the right sidebar (opt for one store only). Then install the app in the JDL store.

Once the app has been installed, fetch an admin api access token using the [client credential grant flow](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant) as follows:

```bash
curl -X POST \
  "https://jdl-industries-inc-aviation.myshopify.com/admin/oauth/access_token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=CLIENT_ID_FROM_DEV_DASHBOARD" \
  -d "client_secret=CLIENT_SECRET_FROM_DEV_DASHBOARD"
```

After deploying, register the carrier service with Shopify using the Admin API:

```bash
curl -X POST "https://jdl-industries-inc-aviation.myshopify.com/admin/api/2024-01/carrier_services.json" \
  -H "X-Shopify-Access-Token: ADMIN_API_TOKEN_FROM_RESPONSE_ABOVE" \
  -H "Content-Type: application/json" \
  -d '{
    "carrier_service": {
      "name": "JDL Custom Shipping",
      "callback_url": "https://carrier-rate-service.jdlindustries.workers.dev/rates",
      "service_discovery": true,
      "carrier_service_type": "api",
      "format": "json"
    }
  }'
```

## Configuration

All configuration is stored in `src/config/config.ts`:

| Export                | Description                                    |
| --------------------- | ---------------------------------------------- |
| `LOCAL_DELIVERY_ZIPS` | Set of Miami-Dade and Broward County zip codes |
| `SHIPPER_ADDRESS`     | JDL warehouse address for FedEx                |
| `BOX_CONFIGS`         | Box configurations for packing algorithm       |
| `HANDLING_FEES`       | Ground and air handling fees                   |
| `PRIORITY_FEE_CENTS`  | Priority handling surcharge (cents)            |

## Routing Logic

1. **Local Delivery**: Destination zip in Miami-Dade/Broward list → Free local delivery
2. **US Domestic**: US destinations → FedEx rates with handling fees
3. **International Military**: Non-US + `_customer_type=international_military` → FedEx International
4. **Freight Forwarding**: All other international → Placeholder rate for manual follow-up

## API Endpoints

### `POST /rates`

Shopify carrier service callback. Requires `X-Shopify-Hmac-Sha256` header for authentication.

### `GET /health`

Health check endpoint. Returns `{ "status": "ok", "timestamp": "..." }`.

## Project Structure

```
/src
  index.ts                 # Hono app entry point
  /handlers
    rates.ts               # Main rate handler
  /services
    fedex.ts               # FedEx OAuth + Rate API
    packaging.ts           # Box packing algorithm
    routing.ts             # Routing decision tree
    leadtimes.ts           # Lead time calculations
    *.test.ts              # Unit tests
  /types
    shopify.ts             # Shopify types
    fedex.ts               # FedEx API types
    config.ts              # Configuration types
  /config
    config.ts              # App configuration (addresses, fees, zip codes)
    constants.ts           # Service codes, defaults
```

## Handling Fees

- **Ground Services** (FEDEX_GROUND, GROUND_HOME_DELIVERY): $30 per order
- **Air/Express Services**: $125 per order
- **Priority Handling**: +$30 for expedited fulfillment (ships within 1 business day)

## Error Handling

- FedEx API errors or timeouts → HTTP 500 (triggers Shopify fallback rates)
- Invalid HMAC signature → HTTP 401
- No shippable items → HTTP 200 with empty rates array
- KV config errors → Uses hardcoded defaults with logged warning
