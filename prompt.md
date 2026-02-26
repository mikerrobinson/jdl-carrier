GOAL:
Build a Shopify custom carrier service endpoint hosted as a Cloudflare Worker using TypeScript with Hono as the web framework. This service receives rate requests from Shopify at checkout and returns appropriate shipping options based on cart contents, customer type, and destination.

Business Context
The client is JDL, a Miami-based aviation coatings company shipping hazardous materials (flammable liquids, Class 3, UN1263/UN1210). All shipping is via FedEx. The carrier service handles all checkout rate logic — label generation is handled separately and is out of scope for this build.

Technical Stack

Runtime: Cloudflare Worker
Framework: Hono
Language: TypeScript
Config storage: Cloudflare KV (for lead times, box configs, zip code lists, handling fees)
FedEx API: REST API (OAuth2, not SOAP)
Deployment: Wrangler CLI

Shopify CarrierService Integration
Shopify sends a POST request to your callback URL at checkout with this payload shape:
typescriptinterface ShopifyRateRequest {
rate: {
origin: Address;
destination: Address;
items: CartItem[];
currency: string;
locale: string;
}
}

interface Address {
country: string;
postal_code: string;
province: string;
city: string;
name: string;
address1: string;
address2: string;
phone: string;
}

interface CartItem {
name: string;
sku: string;
quantity: number;
grams: number;
price: number;
vendor: string;
requires_shipping: boolean;
taxable: boolean;
fulfillment_service: string;
properties: Record<string, string>;
product_id: number;
variant_id: number;
}
Cart attributes (set by Shopify theme Liquid) will be available in item properties and should be read to determine customer type. Specifically look for a \_customer_type property on any item — values will be international_military, freight_forwarding, fedex_own_account, or absent for standard customers.
Your response must be a JSON array of rate objects:
typescriptinterface ShopifyRate {
service_name: string;
service_code: string;
total_price: string; // in cents, as string e.g. "4500" = $45.00
description?: string; // shown as subtitle in checkout
currency: string;
min_delivery_date: string; // ISO 8601
max_delivery_date: string; // ISO 8601
}

```

Return `{ rates: [] }` with HTTP 200 to show no options (e.g. to block checkout for unsupported routes). Return HTTP 500 only on hard errors to trigger Shopify's fallback rates.

---

## Routing Logic

Implement the following decision tree in order:

### 1. Local Delivery
If destination postal code is in the Miami-Dade or Broward County zip code list (stored in KV as `zip_codes:local_delivery`), return a single rate:
- Name: `"Local Delivery"`
- Price: `"0"` (free)
- Delivery date: tomorrow (next business day)

### 2. US Domestic (including AK/HI)
If destination country is `"US"`, call the FedEx Rate API with DG parameters and return all available services with handling fees applied. See FedEx integration section below.

### 3. International Military
If destination country is not `"US"` AND `_customer_type` cart attribute is `"international_military"`, call the FedEx Rate API for international services with DG parameters and return available services with handling fees applied.

### 4. Freight Forwarding
If destination country is not `"US"` AND `_customer_type` is NOT `"international_military"`, return a single placeholder rate:
- Name: `"International Freight Forwarding"`
- Service code: `"FREIGHT_FORWARDING"`
- Price: `"0"` (placeholder — JDL will invoice separately)
- Description: `"Our team will contact you to confirm freight details and final shipping cost"`
- Delivery dates: 14–21 days from today

---

## FedEx REST API Integration

### Authentication
FedEx REST uses OAuth2 client credentials. Credentials stored in Worker secrets:
- `FEDEX_CLIENT_ID`
- `FEDEX_CLIENT_SECRET`
- `FEDEX_ACCOUNT_NUMBER`

Cache the bearer token in memory (it's valid for 3600 seconds). Refresh when expired.
```

POST https://apis.fedex.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={id}&client_secret={secret}
Rate Request
Endpoint: POST https://apis.fedex.com/rate/v1/rates/quotes
Build the rate request with these requirements:

rateRequestTypes: ["LIST", "ACCOUNT"] — always request account-specific (negotiated) rates
requestedShipment.shipper.address: JDL's Miami warehouse address (stored in KV as config:shipper_address)
requestedShipment.preferredCurrency: "USD"
requestedShipment.shipDatestamp: today's date formatted as YYYY-MM-DD
requestedShipment.packagingType: "YOUR_PACKAGING"
requestedShipment.requestedPackageLineItems: derived from packaging algorithm (see below)
Dangerous Goods flag — this is critical. Each package must include:

typescriptspecialServicesRequested: {
specialServiceTypes: ["DANGEROUS_GOODS"],
dangerousGoodsDetail: {
accessibility: "ACCESSIBLE",
regulationType: "DOT_IATA", // use IATA for air, DOT for ground — or pass both
cargo: true,
signatory: {
contactName: "JDL Shipping",
title: "Shipping Manager",
place: "Miami, FL"
}
}
}
Parse the rate response and extract ratedShipmentDetails where rateType === "PAYOR_ACCOUNT_PACKAGE" (negotiated rates). Fall back to PAYOR_LIST_PACKAGE if account rates are not returned.
Service Filtering
From the returned services, filter to show only relevant ones:

For domestic Ground options: FEDEX_GROUND, GROUND_HOME_DELIVERY
For domestic Air options: FEDEX_2_DAY, FEDEX_2_DAY_AM, FEDEX_EXPRESS_SAVER, STANDARD_OVERNIGHT, PRIORITY_OVERNIGHT, FIRST_OVERNIGHT
For international: INTERNATIONAL_PRIORITY, INTERNATIONAL_ECONOMY, INTERNATIONAL_FIRST

Packaging Algorithm
Determine the number and size of boxes needed based on cart weight. Box configurations are stored in KV as config:box_sizes with this shape:
typescriptinterface BoxConfig {
name: string;
length: number; // inches
width: number;
height: number;
maxWeightLbs: number;
emptyWeightLbs: number; // box + packing materials
}
Seed KV with these initial box configurations:
json[
{ "name": "2-gallon", "length": 18, "width": 12, "height": 10, "maxWeightLbs": 30, "emptyWeightLbs": 2 },
{ "name": "4-gallon", "length": 18, "width": 18, "height": 10, "maxWeightLbs": 55, "emptyWeightLbs": 3 },
{ "name": "6-gallon", "length": 24, "width": 18, "height": 10, "maxWeightLbs": 80, "emptyWeightLbs": 4 }
]
Algorithm — greedy bin packing by weight:

Convert all item weights from grams to lbs (Shopify sends grams)
Calculate total cart weight
Sort available boxes by maxWeightLbs descending
Greedily fill boxes: assign items to the largest box that can still accept them, add box empty weight, start a new box when current is full
Return an array of requestedPackageLineItems for the FedEx API

Each package line item needs:
typescript{
weight: { units: "LB", value: number },
dimensions: { length: number, width: number, height: number, units: "IN" },
groupPackageCount: 1
}

Handling Fees
Stored in KV as config:handling_fees:
json{
"ground_per_order": 30,
"air_per_order": 125
}
Apply to the FedEx base rate before returning to Shopify:

Ground services (FEDEX_GROUND, GROUND_HOME_DELIVERY): add ground fee
All air/express services: add air fee
Convert to cents for Shopify response

Lead Times & Delivery Date Calculation
SKU lead times stored in KV as config:lead_times:
json{
"default": 1,
"SKU-EXAMPLE-LONG": 14,
"SKU-EXAMPLE-MED": 3
}

```

Logic:
1. For each cart item, look up its SKU in the lead times map
2. Use `default` if SKU not found
3. Take the maximum lead time across all cart items — this is `fulfillmentDays`
4. For priority handling orders (see below), use `Math.max(1, fulfillmentDays - 2)` capped at 1 minimum
5. `shipDate = today + fulfillmentDays` (skip weekends)
6. `deliveryDate = shipDate + transitDays` from FedEx response (skip weekends)
7. Set `min_delivery_date = max_delivery_date = deliveryDate`

---

## Priority Handling

For every FedEx service returned, add a second variant with "Priority Handling":
- Name: `"{original service name} — Priority Handling"`
- Service code: `"{original_code}_PRIORITY"`
- Price: original price + `config:priority_fee` (default `3000` cents = $30)
- Description: `"Order moved to front of fulfillment queue — ships within 1 business day"`
- Delivery dates: recalculated using priority lead time (max 1 day fulfillment)

---

## Error Handling

- If FedEx API returns an error or times out (set 8 second timeout), log the error and return HTTP 500 so Shopify falls back to backup rates
- If KV read fails for non-critical config, use hardcoded defaults and log a warning
- If cart has zero shippable items, return `{ rates: [] }` with HTTP 200
- All errors should be logged with enough context to debug (destination zip, cart item count, error message)

---

## Project Structure
```

/src
index.ts # Hono app, route registration
/handlers
rates.ts # Main rate handler — orchestrates routing logic
/services
fedex.ts # FedEx OAuth + rate API calls
packaging.ts # Box packing algorithm
routing.ts # Decision tree (local/domestic/military/freight)
leadtimes.ts # Lead time calculation + delivery date logic
/types
shopify.ts # Shopify request/response types
fedex.ts # FedEx API request/response types
/config
constants.ts # Service code lists, fallback defaults
/test
packaging.test.ts # Unit tests for bin packing algorithm
routing.test.ts # Unit tests for routing decision tree
rates.test.ts # Integration test with mock FedEx responses
wrangler.toml

KV Namespace
Declare a KV namespace called JDL_CONFIG in wrangler.toml. All KV reads should use this binding. Provide a scripts/seed-kv.ts script that populates all initial config values so the Worker can be bootstrapped from scratch.

Wrangler Config
Generate a wrangler.toml with:

Worker name: jdl-shipping-rates
Compatibility date: current
KV namespace binding for JDL_CONFIG
Secret placeholders for FEDEX_CLIENT_ID, FEDEX_CLIENT_SECRET, FEDEX_ACCOUNT_NUMBER

Deliverables

Complete working TypeScript Cloudflare Worker project
All source files per the structure above
Unit tests for packaging algorithm with at least 10 test cases covering: single item, max weight per box, multi-box orders, and edge cases
seed-kv.ts bootstrap script
README.md with setup steps, how to run locally with wrangler dev, how to deploy, and how to register the carrier service with Shopify via a one-time API call (include the curl command)
