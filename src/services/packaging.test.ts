import { describe, it, expect } from "vitest";
import {
  gramsToLbs,
  calculateTotalCartWeightLbs,
  packItems,
  packedBoxesToFedExPackages,
  getPackagesForCart,
} from "./packaging";
import type { ShopifyCartItem, BoxConfig } from "../types";
import { GRAMS_PER_LB } from "../config/constants";

const TEST_BOX_CONFIGS: BoxConfig[] = [
  {
    name: "small",
    length: 12,
    width: 12,
    height: 8,
    maxWeightLbs: 20,
    emptyWeightLbs: 1,
  },
  {
    name: "medium",
    length: 18,
    width: 12,
    height: 10,
    maxWeightLbs: 40,
    emptyWeightLbs: 2,
  },
  {
    name: "large",
    length: 24,
    width: 18,
    height: 12,
    maxWeightLbs: 70,
    emptyWeightLbs: 3,
  },
];

function createCartItem(
  overrides: Partial<ShopifyCartItem> = {},
): ShopifyCartItem {
  return {
    name: "Test Product",
    sku: "TEST-SKU",
    quantity: 1,
    grams: 1000,
    price: 5000,
    vendor: "JDL",
    requires_shipping: true,
    taxable: true,
    fulfillment_service: "manual",
    properties: {},
    product_id: 12345,
    variant_id: 67890,
    ...overrides,
  };
}

describe("gramsToLbs", () => {
  it("converts grams to pounds correctly", () => {
    expect(gramsToLbs(453.592)).toBeCloseTo(1, 2);
    expect(gramsToLbs(1000)).toBeCloseTo(2.205, 2);
    expect(gramsToLbs(0)).toBe(0);
  });
});

describe("calculateTotalCartWeightLbs", () => {
  it("calculates total weight for single item", () => {
    const items = [createCartItem({ grams: 1000, quantity: 1 })];
    expect(calculateTotalCartWeightLbs(items)).toBeCloseTo(2.205, 2);
  });

  it("calculates total weight for multiple items", () => {
    const items = [
      createCartItem({ grams: 1000, quantity: 2 }),
      createCartItem({ grams: 500, quantity: 3 }),
    ];
    const expected = (1000 * 2 + 500 * 3) / GRAMS_PER_LB;
    expect(calculateTotalCartWeightLbs(items)).toBeCloseTo(expected, 2);
  });

  it("returns 0 for empty cart", () => {
    expect(calculateTotalCartWeightLbs([])).toBe(0);
  });
});

describe("packItems", () => {
  it("packs a single lightweight item into smallest suitable box", () => {
    const items = [createCartItem({ grams: 2000, quantity: 1 })];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].box.name).toBe("small");
  });

  it("packs multiple items that fit in one box", () => {
    // With 80% fill factor, small box effective capacity: (20-1)*0.8 = 15.2 lbs
    // Items: 2*2lb + 3*1lb = 7 lbs - should fit in small box
    const items = [
      createCartItem({ grams: Math.round(2 * GRAMS_PER_LB), quantity: 2 }),
      createCartItem({ grams: Math.round(1 * GRAMS_PER_LB), quantity: 3 }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
  });

  it("uses larger box when weight exceeds small box capacity", () => {
    const items = [
      createCartItem({ grams: Math.round(25 * GRAMS_PER_LB), quantity: 1 }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].box.name).toBe("medium");
  });

  it("splits items across multiple boxes when needed", () => {
    const items = [
      createCartItem({ grams: Math.round(30 * GRAMS_PER_LB), quantity: 3 }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed.length).toBeGreaterThan(1);
  });

  it("handles items heavier than max box capacity", () => {
    const items = [
      createCartItem({ grams: Math.round(100 * GRAMS_PER_LB), quantity: 1 }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].box.name).toBe("large");
  });

  it("returns empty array for empty cart", () => {
    expect(packItems([], TEST_BOX_CONFIGS)).toHaveLength(0);
  });

  it("includes box empty weight in total weight", () => {
    const items = [
      createCartItem({ grams: Math.round(10 * GRAMS_PER_LB), quantity: 1 }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed[0].totalWeightLbs).toBeCloseTo(
      10 + packed[0].box.emptyWeightLbs,
      1,
    );
    expect(packed[0].itemWeightLbs).toBeCloseTo(10, 1);
  });

  it("efficiently packs items using first-fit decreasing", () => {
    // With 80% fill factor, effective capacities are:
    // small: (20-1)*0.8 = 15.2 lbs, medium: (40-2)*0.8 = 30.4 lbs, large: (70-3)*0.8 = 53.6 lbs
    // Items: 15 + 10 + 5 + 3 = 33 lbs total
    // Should fit in 2 boxes (e.g., large + small, or medium + medium)
    const items = [
      createCartItem({ grams: Math.round(12 * GRAMS_PER_LB), quantity: 1 }),
      createCartItem({ grams: Math.round(3 * GRAMS_PER_LB), quantity: 1 }),
      createCartItem({ grams: Math.round(8 * GRAMS_PER_LB), quantity: 1 }),
      createCartItem({ grams: Math.round(5 * GRAMS_PER_LB), quantity: 1 }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    const totalBoxes = packed.length;
    expect(totalBoxes).toBeLessThanOrEqual(2);
  });

  it("handles high quantity items correctly", () => {
    const items = [
      createCartItem({ grams: Math.round(5 * GRAMS_PER_LB), quantity: 10 }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    const totalItemWeight = packed.reduce((sum, p) => sum + p.itemWeightLbs, 0);
    expect(totalItemWeight).toBeCloseTo(50, 1);
  });

  it("throws error when no box configurations available", () => {
    const items = [createCartItem({ grams: 1000, quantity: 1 })];
    expect(() => packItems(items, [])).toThrow(
      "No box configurations available",
    );
  });
});

describe("packedBoxesToFedExPackages", () => {
  it("converts packed boxes to FedEx package format", () => {
    const packedBoxes = [
      {
        box: TEST_BOX_CONFIGS[0],
        totalWeightLbs: 15.5,
        itemWeightLbs: 14.5,
        usedFloorArea: 100,
      },
    ];

    const packages = packedBoxesToFedExPackages(packedBoxes);

    expect(packages).toHaveLength(1);
    expect(packages[0].weight.units).toBe("LB");
    expect(packages[0].weight.value).toBe(15.5);
    expect(packages[0].dimensions.length).toBe(12);
    expect(packages[0].dimensions.width).toBe(12);
    expect(packages[0].dimensions.height).toBe(8);
    expect(packages[0].dimensions.units).toBe("IN");
    expect(packages[0].groupPackageCount).toBe(1);
  });

  it("rounds weight to 2 decimal places", () => {
    const packedBoxes = [
      {
        box: TEST_BOX_CONFIGS[0],
        totalWeightLbs: 15.5555,
        itemWeightLbs: 14.5555,
        usedFloorArea: 100,
      },
    ];

    const packages = packedBoxesToFedExPackages(packedBoxes);
    expect(packages[0].weight.value).toBe(15.56);
  });
});

describe("getPackagesForCart", () => {
  it("filters out non-shippable items", () => {
    const items = [
      createCartItem({ grams: 1000, requires_shipping: true }),
      createCartItem({ grams: 5000, requires_shipping: false }),
    ];

    const packages = getPackagesForCart(items, TEST_BOX_CONFIGS);

    expect(packages).toHaveLength(1);
    expect(packages[0].weight.value).toBeCloseTo(1000 / GRAMS_PER_LB + 1, 1);
  });

  it("returns empty array when all items are non-shippable", () => {
    const items = [
      createCartItem({ requires_shipping: false }),
      createCartItem({ requires_shipping: false }),
    ];

    expect(getPackagesForCart(items, TEST_BOX_CONFIGS)).toHaveLength(0);
  });

  it("returns empty array for empty cart", () => {
    expect(getPackagesForCart([], TEST_BOX_CONFIGS)).toHaveLength(0);
  });
});

describe("dimension-based packing", () => {
  it("uses dimensions from item properties when available", () => {
    // Item with dimensions that fit in small box (12x12x8)
    const items = [
      createCartItem({
        grams: Math.round(5 * GRAMS_PER_LB),
        quantity: 1,
        properties: {
          _length: "6 in",
          _width: "6 in",
          _height: "6 in",
        },
      }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].box.name).toBe("small");
    expect(packed[0].usedFloorArea).toBe(36); // 6x6
  });

  it("splits items when floor area exceeds box capacity", () => {
    // Two items with 10x10 footprint each = 200 sq in total
    // Small box floor area: 12x12 = 144 sq in (effective: ~122 sq in)
    // Should need 2 boxes
    const items = [
      createCartItem({
        grams: Math.round(2 * GRAMS_PER_LB),
        quantity: 2,
        properties: {
          _length: "10 in",
          _width: "10 in",
          _height: "6 in",
        },
      }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed.length).toBe(2);
  });

  it("uses larger box when item height exceeds small box", () => {
    // Item height 9" exceeds small box height 8"
    const items = [
      createCartItem({
        grams: Math.round(5 * GRAMS_PER_LB),
        quantity: 1,
        properties: {
          _length: "6 in",
          _width: "6 in",
          _height: "9 in",
        },
      }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].box.name).toBe("medium"); // height 10"
  });

  it("falls back to weight-only when dimensions are missing", () => {
    const items = [
      createCartItem({
        grams: Math.round(5 * GRAMS_PER_LB),
        quantity: 1,
        properties: {
          _length: "6 in",
          // width and height missing
        },
      }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].usedFloorArea).toBe(0); // no valid dimensions
  });

  it("handles mixed items with and without dimensions", () => {
    const items = [
      createCartItem({
        grams: Math.round(3 * GRAMS_PER_LB),
        quantity: 1,
        properties: {
          _length: "5 in",
          _width: "5 in",
          _height: "5 in",
        },
      }),
      createCartItem({
        grams: Math.round(3 * GRAMS_PER_LB),
        quantity: 1,
        properties: {}, // no dimensions
      }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    // Both should fit in one small box
    expect(packed).toHaveLength(1);
    expect(packed[0].usedFloorArea).toBe(25); // only the dimensioned item counts
  });

  it("ignores invalid dimension values", () => {
    const items = [
      createCartItem({
        grams: Math.round(5 * GRAMS_PER_LB),
        quantity: 1,
        properties: {
          _length: "invalid",
          _width: "6 in",
          _height: "6 in",
        },
      }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].usedFloorArea).toBe(0); // invalid = no dimensions
  });

  it("handles dimension values with trailing spaces", () => {
    const items = [
      createCartItem({
        grams: Math.round(5 * GRAMS_PER_LB),
        quantity: 1,
        properties: {
          _length: "7 in ",
          _width: "7 in ",
          _height: "7 in ",
        },
      }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].usedFloorArea).toBe(49); // 7x7
  });

  it("handles decimal dimension values with units", () => {
    const items = [
      createCartItem({
        grams: Math.round(5 * GRAMS_PER_LB),
        quantity: 1,
        properties: {
          _length: "6.5 in",
          _width: "6.5 in",
          _height: "6 in",
        },
      }),
    ];
    const packed = packItems(items, TEST_BOX_CONFIGS);

    expect(packed).toHaveLength(1);
    expect(packed[0].usedFloorArea).toBeCloseTo(42.25, 2); // 6.5x6.5
  });
});
