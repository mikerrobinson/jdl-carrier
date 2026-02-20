import { describe, it, expect } from 'vitest';
import {
  getMaxLeadTimeDays,
  getPriorityLeadTimeDays,
  isWeekend,
  addBusinessDays,
  getNextBusinessDay,
  calculateShipDate,
  calculateDeliveryDate,
  formatDateISO,
  calculateDeliveryDates,
} from './leadtimes';
import type { ShopifyCartItem, LeadTimes } from '../types';

function createCartItem(sku: string): ShopifyCartItem {
  return {
    name: 'Test Product',
    sku,
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
  };
}

const testLeadTimes: LeadTimes = {
  default: 1,
  'LONG-LEAD': 14,
  'MED-LEAD': 5,
  'SHORT-LEAD': 2,
};

describe('getMaxLeadTimeDays', () => {
  it('returns default for items not in lead times', () => {
    const items = [createCartItem('UNKNOWN-SKU')];
    expect(getMaxLeadTimeDays(items, testLeadTimes)).toBe(1);
  });

  it('returns specific lead time for known SKU', () => {
    const items = [createCartItem('LONG-LEAD')];
    expect(getMaxLeadTimeDays(items, testLeadTimes)).toBe(14);
  });

  it('returns maximum lead time across all items', () => {
    const items = [
      createCartItem('SHORT-LEAD'),
      createCartItem('LONG-LEAD'),
      createCartItem('MED-LEAD'),
    ];
    expect(getMaxLeadTimeDays(items, testLeadTimes)).toBe(14);
  });

  it('returns default for empty cart', () => {
    expect(getMaxLeadTimeDays([], testLeadTimes)).toBe(1);
  });

  it('handles mixed known and unknown SKUs', () => {
    const items = [
      createCartItem('UNKNOWN-SKU'),
      createCartItem('MED-LEAD'),
    ];
    expect(getMaxLeadTimeDays(items, testLeadTimes)).toBe(5);
  });
});

describe('getPriorityLeadTimeDays', () => {
  it('reduces lead time by 2 days', () => {
    expect(getPriorityLeadTimeDays(5)).toBe(3);
  });

  it('caps minimum at 1 day', () => {
    expect(getPriorityLeadTimeDays(1)).toBe(1);
    expect(getPriorityLeadTimeDays(2)).toBe(1);
  });

  it('returns 1 for 3 day lead time', () => {
    expect(getPriorityLeadTimeDays(3)).toBe(1);
  });

  it('handles large lead times', () => {
    expect(getPriorityLeadTimeDays(14)).toBe(12);
  });
});

describe('isWeekend', () => {
  it('returns true for Saturday', () => {
    const saturday = new Date('2024-01-06');
    expect(isWeekend(saturday)).toBe(true);
  });

  it('returns true for Sunday', () => {
    const sunday = new Date('2024-01-07');
    expect(isWeekend(sunday)).toBe(true);
  });

  it('returns false for Monday', () => {
    const monday = new Date('2024-01-08');
    expect(isWeekend(monday)).toBe(false);
  });

  it('returns false for Friday', () => {
    const friday = new Date('2024-01-05');
    expect(isWeekend(friday)).toBe(false);
  });
});

describe('addBusinessDays', () => {
  it('adds business days skipping weekends', () => {
    const friday = new Date('2024-01-05');
    const result = addBusinessDays(friday, 1);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-08');
  });

  it('adds multiple business days', () => {
    const monday = new Date('2024-01-08');
    const result = addBusinessDays(monday, 5);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-15');
  });

  it('handles starting on weekend', () => {
    const saturday = new Date('2024-01-06');
    const result = addBusinessDays(saturday, 1);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-08');
  });
});

describe('getNextBusinessDay', () => {
  it('returns Monday for Friday', () => {
    const friday = new Date('2024-01-05');
    const result = getNextBusinessDay(friday);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-08');
  });

  it('returns Monday for Saturday', () => {
    const saturday = new Date('2024-01-06');
    const result = getNextBusinessDay(saturday);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-08');
  });

  it('returns Monday for Sunday', () => {
    const sunday = new Date('2024-01-07');
    const result = getNextBusinessDay(sunday);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-08');
  });

  it('returns next day for weekday', () => {
    const wednesday = new Date('2024-01-10');
    const result = getNextBusinessDay(wednesday);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-11');
  });
});

describe('calculateShipDate', () => {
  it('returns next business day for 0 lead time', () => {
    const monday = new Date('2024-01-08');
    const result = calculateShipDate(0, monday);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-09');
  });

  it('calculates ship date with lead time', () => {
    const monday = new Date('2024-01-08');
    const result = calculateShipDate(3, monday);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-11');
  });
});

describe('calculateDeliveryDate', () => {
  it('returns ship date for 0 transit days', () => {
    const shipDate = new Date('2024-01-10');
    const result = calculateDeliveryDate(shipDate, 0);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-10');
  });

  it('adds transit days skipping weekends', () => {
    const friday = new Date('2024-01-12');
    const result = calculateDeliveryDate(friday, 2);
    expect(result.toISOString().split('T')[0]).toBe('2024-01-16');
  });
});

describe('formatDateISO', () => {
  it('formats date as YYYY-MM-DD', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(formatDateISO(date)).toBe('2024-01-15');
  });
});

describe('calculateDeliveryDates', () => {
  it('calculates standard delivery dates', () => {
    const items = [createCartItem('MED-LEAD')];
    const fromDate = new Date('2024-01-08');
    const result = calculateDeliveryDates(items, 2, testLeadTimes, false, fromDate);

    expect(result.shipDate.toISOString().split('T')[0]).toBe('2024-01-15');
    expect(result.deliveryDate.toISOString().split('T')[0]).toBe('2024-01-17');
  });

  it('calculates priority delivery dates with reduced lead time', () => {
    const items = [createCartItem('MED-LEAD')];
    const fromDate = new Date('2024-01-08');
    const result = calculateDeliveryDates(items, 2, testLeadTimes, true, fromDate);

    expect(result.shipDate.toISOString().split('T')[0]).toBe('2024-01-11');
    expect(result.deliveryDate.toISOString().split('T')[0]).toBe('2024-01-15');
  });

  it('returns ISO formatted dates', () => {
    const items = [createCartItem('SHORT-LEAD')];
    const fromDate = new Date('2024-01-08');
    const result = calculateDeliveryDates(items, 1, testLeadTimes, false, fromDate);

    expect(result.minDeliveryDateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.maxDeliveryDateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.minDeliveryDateISO).toBe(result.maxDeliveryDateISO);
  });
});
