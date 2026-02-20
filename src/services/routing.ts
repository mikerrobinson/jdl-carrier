import type { ShopifyRateRequest, ShopifyCartItem, CustomerType } from '../types';

export type RouteType = 'local_delivery' | 'domestic' | 'international_military' | 'freight_forwarding';

export interface RouteDecision {
  routeType: RouteType;
  customerType: CustomerType;
  isInternational: boolean;
}

export function extractCustomerType(items: ShopifyCartItem[]): CustomerType {
  for (const item of items) {
    const customerTypeProperty = item.properties?._customer_type || item.properties?.['_customer_type'];
    if (customerTypeProperty) {
      if (customerTypeProperty === 'international_military') {
        return 'international_military';
      }
      if (customerTypeProperty === 'freight_forwarding') {
        return 'freight_forwarding';
      }
      if (customerTypeProperty === 'fedex_own_account') {
        return 'fedex_own_account';
      }
    }
  }
  return 'standard';
}

export function isLocalDeliveryZip(postalCode: string, localZipSet: Set<string>): boolean {
  const normalizedZip = postalCode.trim().substring(0, 5);
  return localZipSet.has(normalizedZip);
}

export function isDomesticDestination(countryCode: string): boolean {
  return countryCode.toUpperCase() === 'US';
}

export function determineRoute(
  request: ShopifyRateRequest,
  localDeliveryZips: Set<string>
): RouteDecision {
  const { destination, items } = request.rate;
  const customerType = extractCustomerType(items);
  const isDomestic = isDomesticDestination(destination.country);

  if (isDomestic && isLocalDeliveryZip(destination.postal_code, localDeliveryZips)) {
    return {
      routeType: 'local_delivery',
      customerType,
      isInternational: false,
    };
  }

  if (isDomestic) {
    return {
      routeType: 'domestic',
      customerType,
      isInternational: false,
    };
  }

  if (customerType === 'international_military') {
    return {
      routeType: 'international_military',
      customerType,
      isInternational: true,
    };
  }

  return {
    routeType: 'freight_forwarding',
    customerType,
    isInternational: true,
  };
}

export function hasShippableItems(items: ShopifyCartItem[]): boolean {
  return items.some((item) => item.requires_shipping);
}
