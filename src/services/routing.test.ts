import { describe, it, expect } from 'vitest';
import {
  extractCustomerType,
  isLocalDeliveryZip,
  isDomesticDestination,
  determineRoute,
  hasShippableItems,
} from './routing';
import type { ShopifyRateRequest, ShopifyCartItem, ShopifyAddress } from '../types';

function createCartItem(overrides: Partial<ShopifyCartItem> = {}): ShopifyCartItem {
  return {
    name: 'Test Product',
    sku: 'TEST-SKU',
    quantity: 1,
    grams: 1000,
    price: 5000,
    vendor: 'JDL',
    requires_shipping: true,
    taxable: true,
    fulfillment_service: 'manual',
    properties: {},
    product_id: 12345,
    variant_id: 67890,
    ...overrides,
  };
}

function createAddress(overrides: Partial<ShopifyAddress> = {}): ShopifyAddress {
  return {
    country: 'US',
    postal_code: '33172',
    province: 'FL',
    city: 'Miami',
    name: 'Test Customer',
    address1: '123 Test St',
    address2: '',
    phone: '305-555-1234',
    ...overrides,
  };
}

function createRateRequest(
  destinationOverrides: Partial<ShopifyAddress> = {},
  items: ShopifyCartItem[] = [createCartItem()]
): ShopifyRateRequest {
  return {
    rate: {
      origin: createAddress(),
      destination: createAddress(destinationOverrides),
      items,
      currency: 'USD',
      locale: 'en',
    },
  };
}

const localZips = new Set(['33172', '33101', '33133', '33301', '33060']);

describe('extractCustomerType', () => {
  it('returns standard when no customer type property', () => {
    const items = [createCartItem()];
    expect(extractCustomerType(items)).toBe('standard');
  });

  it('extracts international_military customer type', () => {
    const items = [createCartItem({ properties: { _customer_type: 'international_military' } })];
    expect(extractCustomerType(items)).toBe('international_military');
  });

  it('extracts freight_forwarding customer type', () => {
    const items = [createCartItem({ properties: { _customer_type: 'freight_forwarding' } })];
    expect(extractCustomerType(items)).toBe('freight_forwarding');
  });

  it('extracts fedex_own_account customer type', () => {
    const items = [createCartItem({ properties: { _customer_type: 'fedex_own_account' } })];
    expect(extractCustomerType(items)).toBe('fedex_own_account');
  });

  it('returns standard for unknown customer type', () => {
    const items = [createCartItem({ properties: { _customer_type: 'unknown_type' } })];
    expect(extractCustomerType(items)).toBe('standard');
  });

  it('checks all items for customer type', () => {
    const items = [
      createCartItem({ properties: {} }),
      createCartItem({ properties: { _customer_type: 'international_military' } }),
    ];
    expect(extractCustomerType(items)).toBe('international_military');
  });
});

describe('isLocalDeliveryZip', () => {
  it('returns true for zip in local delivery list', () => {
    expect(isLocalDeliveryZip('33172', localZips)).toBe(true);
  });

  it('returns false for zip not in local delivery list', () => {
    expect(isLocalDeliveryZip('90210', localZips)).toBe(false);
  });

  it('normalizes zip codes with extra characters', () => {
    expect(isLocalDeliveryZip('33172-1234', localZips)).toBe(true);
  });

  it('handles whitespace in zip codes', () => {
    expect(isLocalDeliveryZip(' 33172 ', localZips)).toBe(true);
  });
});

describe('isDomesticDestination', () => {
  it('returns true for US', () => {
    expect(isDomesticDestination('US')).toBe(true);
  });

  it('returns true for lowercase us', () => {
    expect(isDomesticDestination('us')).toBe(true);
  });

  it('returns false for other countries', () => {
    expect(isDomesticDestination('CA')).toBe(false);
    expect(isDomesticDestination('MX')).toBe(false);
    expect(isDomesticDestination('GB')).toBe(false);
  });
});

describe('determineRoute', () => {
  it('routes to local_delivery for Miami-Dade zip', () => {
    const request = createRateRequest({ postal_code: '33172' });
    const route = determineRoute(request, localZips);

    expect(route.routeType).toBe('local_delivery');
    expect(route.isInternational).toBe(false);
  });

  it('routes to local_delivery for Broward zip', () => {
    const request = createRateRequest({ postal_code: '33301' });
    const route = determineRoute(request, localZips);

    expect(route.routeType).toBe('local_delivery');
    expect(route.isInternational).toBe(false);
  });

  it('routes to domestic for US non-local zip', () => {
    const request = createRateRequest({ postal_code: '90210' });
    const route = determineRoute(request, localZips);

    expect(route.routeType).toBe('domestic');
    expect(route.isInternational).toBe(false);
  });

  it('routes to domestic for Alaska zip', () => {
    const request = createRateRequest({ postal_code: '99501', province: 'AK' });
    const route = determineRoute(request, localZips);

    expect(route.routeType).toBe('domestic');
    expect(route.isInternational).toBe(false);
  });

  it('routes to domestic for Hawaii zip', () => {
    const request = createRateRequest({ postal_code: '96801', province: 'HI' });
    const route = determineRoute(request, localZips);

    expect(route.routeType).toBe('domestic');
    expect(route.isInternational).toBe(false);
  });

  it('routes to international_military for international military orders', () => {
    const items = [createCartItem({ properties: { _customer_type: 'international_military' } })];
    const request = createRateRequest({ country: 'DE', postal_code: '10115' }, items);
    const route = determineRoute(request, localZips);

    expect(route.routeType).toBe('international_military');
    expect(route.customerType).toBe('international_military');
    expect(route.isInternational).toBe(true);
  });

  it('routes to freight_forwarding for standard international orders', () => {
    const request = createRateRequest({ country: 'CA', postal_code: 'M5V 2H1' });
    const route = determineRoute(request, localZips);

    expect(route.routeType).toBe('freight_forwarding');
    expect(route.isInternational).toBe(true);
  });

  it('routes to freight_forwarding for international orders with no customer type', () => {
    const request = createRateRequest({ country: 'MX', postal_code: '06600' });
    const route = determineRoute(request, localZips);

    expect(route.routeType).toBe('freight_forwarding');
    expect(route.customerType).toBe('standard');
  });
});

describe('hasShippableItems', () => {
  it('returns true when cart has shippable items', () => {
    const items = [createCartItem({ requires_shipping: true })];
    expect(hasShippableItems(items)).toBe(true);
  });

  it('returns false when cart has no shippable items', () => {
    const items = [createCartItem({ requires_shipping: false })];
    expect(hasShippableItems(items)).toBe(false);
  });

  it('returns true when at least one item is shippable', () => {
    const items = [
      createCartItem({ requires_shipping: false }),
      createCartItem({ requires_shipping: true }),
    ];
    expect(hasShippableItems(items)).toBe(true);
  });

  it('returns false for empty cart', () => {
    expect(hasShippableItems([])).toBe(false);
  });
});
