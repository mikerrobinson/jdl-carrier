import type { BoxConfig, ShopifyCartItem, FedExPackageLineItem } from '../types';
import { GRAMS_PER_LB, DEFAULT_BOX_CONFIGS } from '../config/constants';

export interface PackedBox {
  box: BoxConfig;
  totalWeightLbs: number;
  itemWeightLbs: number;
}

export function gramsToLbs(grams: number): number {
  return grams / GRAMS_PER_LB;
}

export function calculateTotalCartWeightLbs(items: ShopifyCartItem[]): number {
  return items.reduce((total, item) => {
    return total + gramsToLbs(item.grams) * item.quantity;
  }, 0);
}

export function packItems(
  items: ShopifyCartItem[],
  boxConfigs: BoxConfig[] = DEFAULT_BOX_CONFIGS
): PackedBox[] {
  if (items.length === 0) {
    return [];
  }

  if (boxConfigs.length === 0) {
    throw new Error('No box configurations available');
  }

  const boxesByCapacityAsc = [...boxConfigs].sort((a, b) => a.maxWeightLbs - b.maxWeightLbs);
  const largestBox = boxesByCapacityAsc[boxesByCapacityAsc.length - 1];

  const itemWeights: number[] = [];
  for (const item of items) {
    const weightPerUnit = gramsToLbs(item.grams);
    for (let i = 0; i < item.quantity; i++) {
      itemWeights.push(weightPerUnit);
    }
  }

  itemWeights.sort((a, b) => b - a);

  const packedBoxes: PackedBox[] = [];

  for (const itemWeight of itemWeights) {
    let placed = false;

    for (const packedBox of packedBoxes) {
      const availableCapacity = packedBox.box.maxWeightLbs - packedBox.totalWeightLbs;
      if (itemWeight <= availableCapacity) {
        packedBox.itemWeightLbs += itemWeight;
        packedBox.totalWeightLbs += itemWeight;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const suitableBox = boxesByCapacityAsc.find(
        (box) => itemWeight <= box.maxWeightLbs - box.emptyWeightLbs
      );

      if (!suitableBox) {
        packedBoxes.push({
          box: largestBox,
          itemWeightLbs: itemWeight,
          totalWeightLbs: largestBox.emptyWeightLbs + itemWeight,
        });
      } else {
        packedBoxes.push({
          box: suitableBox,
          itemWeightLbs: itemWeight,
          totalWeightLbs: suitableBox.emptyWeightLbs + itemWeight,
        });
      }
    }
  }

  return packedBoxes;
}

export function packedBoxesToFedExPackages(packedBoxes: PackedBox[]): FedExPackageLineItem[] {
  return packedBoxes.map((packed) => ({
    weight: {
      units: 'LB',
      value: Math.round(packed.totalWeightLbs * 100) / 100,
    },
    dimensions: {
      length: packed.box.length,
      width: packed.box.width,
      height: packed.box.height,
      units: 'IN',
    },
    groupPackageCount: 1,
  }));
}

export function getPackagesForCart(
  items: ShopifyCartItem[],
  boxConfigs: BoxConfig[] = DEFAULT_BOX_CONFIGS
): FedExPackageLineItem[] {
  const shippableItems = items.filter((item) => item.requires_shipping);

  if (shippableItems.length === 0) {
    return [];
  }

  const packedBoxes = packItems(shippableItems, boxConfigs);
  return packedBoxesToFedExPackages(packedBoxes);
}
