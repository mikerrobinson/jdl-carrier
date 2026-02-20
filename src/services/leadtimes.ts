import type { ShopifyCartItem, LeadTimes } from '../types';
import { DEFAULT_LEAD_TIMES } from '../config/constants';

export function getMaxLeadTimeDays(
  items: ShopifyCartItem[],
  leadTimes: LeadTimes = DEFAULT_LEAD_TIMES
): number {
  const defaultLeadTime = leadTimes.default ?? 1;

  if (items.length === 0) {
    return defaultLeadTime;
  }

  let maxLeadTime = 0;

  for (const item of items) {
    const itemLeadTime = leadTimes[item.sku] ?? defaultLeadTime;
    if (itemLeadTime > maxLeadTime) {
      maxLeadTime = itemLeadTime;
    }
  }

  return maxLeadTime || defaultLeadTime;
}

export function getPriorityLeadTimeDays(standardLeadTime: number): number {
  return Math.max(1, standardLeadTime - 2);
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < businessDays) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (!isWeekend(result)) {
      daysAdded++;
    }
  }

  return result;
}

export function getNextBusinessDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + 1);

  while (isWeekend(result)) {
    result.setUTCDate(result.getUTCDate() + 1);
  }

  return result;
}

export function calculateShipDate(leadTimeDays: number, fromDate: Date = new Date()): Date {
  if (leadTimeDays <= 0) {
    return getNextBusinessDay(fromDate);
  }

  return addBusinessDays(fromDate, leadTimeDays);
}

export function calculateDeliveryDate(
  shipDate: Date,
  transitDays: number
): Date {
  if (transitDays <= 0) {
    return shipDate;
  }

  return addBusinessDays(shipDate, transitDays);
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export interface DeliveryDateResult {
  shipDate: Date;
  deliveryDate: Date;
  minDeliveryDateISO: string;
  maxDeliveryDateISO: string;
}

export function calculateDeliveryDates(
  items: ShopifyCartItem[],
  transitDays: number,
  leadTimes: LeadTimes = DEFAULT_LEAD_TIMES,
  isPriority: boolean = false,
  fromDate: Date = new Date()
): DeliveryDateResult {
  const standardLeadTime = getMaxLeadTimeDays(items, leadTimes);
  const leadTimeDays = isPriority
    ? getPriorityLeadTimeDays(standardLeadTime)
    : standardLeadTime;

  const shipDate = calculateShipDate(leadTimeDays, fromDate);
  const deliveryDate = calculateDeliveryDate(shipDate, transitDays);

  const deliveryDateISO = formatDateISO(deliveryDate);

  return {
    shipDate,
    deliveryDate,
    minDeliveryDateISO: deliveryDateISO,
    maxDeliveryDateISO: deliveryDateISO,
  };
}
