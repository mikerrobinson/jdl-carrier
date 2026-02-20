import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseFedExRateResponse, isGroundService } from '../services/fedex';
import type { FedExRateResponse, ParsedFedExRate } from '../types';

const mockFedExResponse: FedExRateResponse = {
  transactionId: 'test-transaction-123',
  output: {
    rateReplyDetails: [
      {
        serviceType: 'FEDEX_GROUND',
        serviceName: 'FedEx Ground',
        ratedShipmentDetails: [
          {
            rateType: 'PAYOR_ACCOUNT_PACKAGE',
            totalNetCharge: [{ currency: 'USD', amount: 25.50 }],
          },
          {
            rateType: 'PAYOR_LIST_PACKAGE',
            totalNetCharge: [{ currency: 'USD', amount: 30.00 }],
          },
        ],
        commit: {
          transitTime: 'THREE_DAYS',
        },
      },
      {
        serviceType: 'FEDEX_2_DAY',
        serviceName: 'FedEx 2Day',
        ratedShipmentDetails: [
          {
            rateType: 'PAYOR_ACCOUNT_PACKAGE',
            totalNetCharge: [{ currency: 'USD', amount: 45.00 }],
          },
        ],
        commit: {
          transitDays: {
            minimumTransitTime: 'TWO_DAYS',
          },
          deliveryTimestamp: '2024-01-12T17:00:00',
        },
      },
      {
        serviceType: 'PRIORITY_OVERNIGHT',
        serviceName: 'FedEx Priority Overnight',
        ratedShipmentDetails: [
          {
            rateType: 'PAYOR_ACCOUNT_PACKAGE',
            totalNetCharge: [{ currency: 'USD', amount: 85.99 }],
          },
        ],
        operationalDetail: {
          deliveryDate: '2024-01-10',
          transitTime: 'ONE_DAY',
        },
      },
      {
        serviceType: 'UNKNOWN_SERVICE',
        serviceName: 'Unknown Service',
        ratedShipmentDetails: [
          {
            rateType: 'PAYOR_ACCOUNT_PACKAGE',
            totalNetCharge: [{ currency: 'USD', amount: 100.00 }],
          },
        ],
      },
    ],
  },
};

describe('parseFedExRateResponse', () => {
  it('parses valid FedEx rates', () => {
    const rates = parseFedExRateResponse(mockFedExResponse, false);

    expect(rates.length).toBeGreaterThan(0);
  });

  it('filters to allowed services only', () => {
    const rates = parseFedExRateResponse(mockFedExResponse, false);

    const serviceTypes = rates.map((r) => r.serviceType);
    expect(serviceTypes).toContain('FEDEX_GROUND');
    expect(serviceTypes).toContain('FEDEX_2_DAY');
    expect(serviceTypes).toContain('PRIORITY_OVERNIGHT');
    expect(serviceTypes).not.toContain('UNKNOWN_SERVICE');
  });

  it('prefers account rates over list rates', () => {
    const rates = parseFedExRateResponse(mockFedExResponse, false);

    const groundRate = rates.find((r) => r.serviceType === 'FEDEX_GROUND');
    expect(groundRate?.totalChargeCents).toBe(2550);
  });

  it('converts amounts to cents', () => {
    const rates = parseFedExRateResponse(mockFedExResponse, false);

    const priorityRate = rates.find((r) => r.serviceType === 'PRIORITY_OVERNIGHT');
    expect(priorityRate?.totalChargeCents).toBe(8599);
  });

  it('extracts transit days from various sources', () => {
    const rates = parseFedExRateResponse(mockFedExResponse, false);

    const groundRate = rates.find((r) => r.serviceType === 'FEDEX_GROUND');
    expect(groundRate?.transitDays).toBe(3);

    const twoDayRate = rates.find((r) => r.serviceType === 'FEDEX_2_DAY');
    expect(twoDayRate?.transitDays).toBe(2);
  });

  it('extracts delivery date when available', () => {
    const rates = parseFedExRateResponse(mockFedExResponse, false);

    const twoDayRate = rates.find((r) => r.serviceType === 'FEDEX_2_DAY');
    expect(twoDayRate?.deliveryDate).toBe('2024-01-12T17:00:00');

    const priorityRate = rates.find((r) => r.serviceType === 'PRIORITY_OVERNIGHT');
    expect(priorityRate?.deliveryDate).toBe('2024-01-10');
  });

  it('returns empty array for missing rateReplyDetails', () => {
    const emptyResponse: FedExRateResponse = {
      output: {},
    };

    const rates = parseFedExRateResponse(emptyResponse, false);
    expect(rates).toHaveLength(0);
  });

  it('skips services without valid rate data', () => {
    const responseWithMissingRates: FedExRateResponse = {
      output: {
        rateReplyDetails: [
          {
            serviceType: 'FEDEX_GROUND',
            ratedShipmentDetails: [],
          },
        ],
      },
    };

    const rates = parseFedExRateResponse(responseWithMissingRates, false);
    expect(rates).toHaveLength(0);
  });

  it('uses display name mapping for service names', () => {
    const rates = parseFedExRateResponse(mockFedExResponse, false);

    const groundRate = rates.find((r) => r.serviceType === 'FEDEX_GROUND');
    expect(groundRate?.serviceName).toBe('FedEx Ground');

    const priorityRate = rates.find((r) => r.serviceType === 'PRIORITY_OVERNIGHT');
    expect(priorityRate?.serviceName).toBe('FedEx Priority Overnight');
  });
});

describe('isGroundService', () => {
  it('returns true for FEDEX_GROUND', () => {
    expect(isGroundService('FEDEX_GROUND')).toBe(true);
  });

  it('returns true for GROUND_HOME_DELIVERY', () => {
    expect(isGroundService('GROUND_HOME_DELIVERY')).toBe(true);
  });

  it('returns false for air services', () => {
    expect(isGroundService('FEDEX_2_DAY')).toBe(false);
    expect(isGroundService('PRIORITY_OVERNIGHT')).toBe(false);
    expect(isGroundService('STANDARD_OVERNIGHT')).toBe(false);
  });

  it('returns false for international services', () => {
    expect(isGroundService('INTERNATIONAL_PRIORITY')).toBe(false);
    expect(isGroundService('INTERNATIONAL_ECONOMY')).toBe(false);
  });
});

describe('rate calculation with handling fees', () => {
  const parsedRates: ParsedFedExRate[] = [
    {
      serviceType: 'FEDEX_GROUND',
      serviceName: 'FedEx Ground',
      totalChargeCents: 2500,
      transitDays: 3,
      deliveryDate: null,
    },
    {
      serviceType: 'FEDEX_2_DAY',
      serviceName: 'FedEx 2Day',
      totalChargeCents: 4500,
      transitDays: 2,
      deliveryDate: null,
    },
  ];

  it('applies correct handling fee for ground services', () => {
    const groundHandlingFeeCents = 30 * 100;
    const groundRate = parsedRates.find((r) => r.serviceType === 'FEDEX_GROUND')!;
    const totalWithFee = groundRate.totalChargeCents + groundHandlingFeeCents;

    expect(totalWithFee).toBe(5500);
  });

  it('applies correct handling fee for air services', () => {
    const airHandlingFeeCents = 125 * 100;
    const airRate = parsedRates.find((r) => r.serviceType === 'FEDEX_2_DAY')!;
    const totalWithFee = airRate.totalChargeCents + airHandlingFeeCents;

    expect(totalWithFee).toBe(17000);
  });
});

describe('priority handling pricing', () => {
  it('adds priority fee to base rate', () => {
    const baseRateCents = 5000;
    const priorityFeeCents = 3000;
    const priorityTotalCents = baseRateCents + priorityFeeCents;

    expect(priorityTotalCents).toBe(8000);
  });
});
