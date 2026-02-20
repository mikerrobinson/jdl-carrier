export interface ShopifyRateRequest {
  rate: {
    origin: ShopifyAddress;
    destination: ShopifyAddress;
    items: ShopifyCartItem[];
    currency: string;
    locale: string;
  };
}

export interface ShopifyAddress {
  country: string;
  postal_code: string;
  province: string;
  city: string;
  name: string;
  address1: string;
  address2: string;
  phone: string;
}

export interface ShopifyCartItem {
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

export interface ShopifyRate {
  service_name: string;
  service_code: string;
  total_price: string;
  description?: string;
  currency: string;
  min_delivery_date: string;
  max_delivery_date: string;
}

export interface ShopifyRateResponse {
  rates: ShopifyRate[];
}

export type CustomerType =
  | 'international_military'
  | 'freight_forwarding'
  | 'fedex_own_account'
  | 'standard';
