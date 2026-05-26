import {InventoryItem} from '../types';

const toPositiveNumber = (value: unknown) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export const getInventoryItemArea = (item: Pick<InventoryItem, 'area' | 'length' | 'width'>) => {
  const length = toPositiveNumber(item.length);
  const width = toPositiveNumber(item.width);
  const storedArea = toPositiveNumber(item.area);

  if (length > 0 && width > 0) {
    return (length * width) / 10000;
  }

  return storedArea;
};
