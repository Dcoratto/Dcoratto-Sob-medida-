import {normalizeDeliveryCity, normalizeDeliveryDistrict} from './deliveryCityRates';

export const buildLaborRegionKey = (district?: string, city?: string) =>
  `${normalizeDeliveryDistrict(district)}::${normalizeDeliveryCity(city)}`;

export const normalizeLaborRegionDistrict = normalizeDeliveryDistrict;
export const normalizeLaborRegionCity = normalizeDeliveryCity;
