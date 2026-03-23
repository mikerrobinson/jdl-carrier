import type { LeadTimes } from "../types";

// FedEx API endpoints - use FEDEX_SANDBOX=true for test environment
export const FEDEX_API_BASE_PRODUCTION = "https://apis.fedex.com";
export const FEDEX_API_BASE_SANDBOX = "https://apis-sandbox.fedex.com";

export function getFedExApiBase(useSandbox: boolean): string {
  return useSandbox ? FEDEX_API_BASE_SANDBOX : FEDEX_API_BASE_PRODUCTION;
}

export function getFedExOAuthEndpoint(useSandbox: boolean): string {
  return `${getFedExApiBase(useSandbox)}/oauth/token`;
}

export function getFedExRateEndpoint(useSandbox: boolean): string {
  return `${getFedExApiBase(useSandbox)}/rate/v1/rates/quotes`;
}

// Legacy constants for backwards compatibility (default to production)
export const FEDEX_API_BASE = FEDEX_API_BASE_PRODUCTION;
export const FEDEX_OAUTH_ENDPOINT = `${FEDEX_API_BASE}/oauth/token`;
export const FEDEX_RATE_ENDPOINT = `${FEDEX_API_BASE}/rate/v1/rates/quotes`;

export const FEDEX_TOKEN_EXPIRY_BUFFER_SECONDS = 60;
export const FEDEX_API_TIMEOUT_MS = 8000;

export const DOMESTIC_GROUND_SERVICES = [
  "FEDEX_GROUND",
  "GROUND_HOME_DELIVERY",
] as const;

export const DOMESTIC_AIR_SERVICES = [
  "FEDEX_2_DAY",
  "FEDEX_2_DAY_AM",
  "FEDEX_EXPRESS_SAVER",
  "STANDARD_OVERNIGHT",
  "PRIORITY_OVERNIGHT",
  "FIRST_OVERNIGHT",
] as const;

export const INTERNATIONAL_SERVICES = [
  "INTERNATIONAL_PRIORITY",
  "INTERNATIONAL_ECONOMY",
  "INTERNATIONAL_FIRST",
] as const;

export const ALL_ALLOWED_SERVICES = [
  ...DOMESTIC_GROUND_SERVICES,
  ...DOMESTIC_AIR_SERVICES,
  ...INTERNATIONAL_SERVICES,
] as const;

export const GROUND_SERVICE_SET = new Set<string>(DOMESTIC_GROUND_SERVICES);

export const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  FEDEX_GROUND: "FedEx Ground",
  GROUND_HOME_DELIVERY: "FedEx Home Delivery",
  FEDEX_2_DAY: "FedEx 2Day",
  FEDEX_2_DAY_AM: "FedEx 2Day AM",
  FEDEX_EXPRESS_SAVER: "FedEx Express Saver",
  STANDARD_OVERNIGHT: "FedEx Standard Overnight",
  PRIORITY_OVERNIGHT: "FedEx Priority Overnight",
  FIRST_OVERNIGHT: "FedEx First Overnight",
  INTERNATIONAL_PRIORITY: "FedEx International Priority",
  INTERNATIONAL_ECONOMY: "FedEx International Economy",
  INTERNATIONAL_FIRST: "FedEx International First",
};

export const DEFAULT_LEAD_TIMES: LeadTimes = {
  default: 1,
};

export const GRAMS_PER_LB = 453.592;
