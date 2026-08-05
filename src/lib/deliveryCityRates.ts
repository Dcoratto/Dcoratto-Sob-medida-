import {QuoteDeliveryDetails, QuoteDeliveryMode} from '../types';

const normalizeText = (value?: string) =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);

export const normalizeDeliveryCity = (value?: string) => normalizeText(value);
export const normalizeDeliveryDistrict = (value?: string) => normalizeText(value);
export const buildDeliveryRegionKey = (district?: string, city?: string) =>
  `${normalizeDeliveryDistrict(district)}::${normalizeDeliveryCity(city)}`;

export const buildCityRateDeliveryDetails = ({
  district,
  city,
  fee,
  regionRateId,
  mode = 'region_rate',
  source,
  appliedByUserId,
  appliedByUserName,
}: {
  district?: string;
  city?: string;
  fee?: number;
  regionRateId?: string;
  mode?: QuoteDeliveryMode;
  source?: QuoteDeliveryDetails['source'];
  appliedByUserId?: string;
  appliedByUserName?: string;
}): QuoteDeliveryDetails => ({
  mode,
  fee: Math.max(0, Number(fee || 0)),
  district: String(district || '').trim().slice(0, 120),
  districtNormalized: normalizeDeliveryDistrict(district),
  city: String(city || '').trim().slice(0, 120),
  cityNormalized: normalizeDeliveryCity(city),
  regionRateId: String(regionRateId || '').trim() || undefined,
  source: source || (mode === 'manual' ? 'manual' : mode === 'disabled' ? undefined : 'region_rate'),
  appliedByUserId: String(appliedByUserId || '').trim() || undefined,
  appliedByUserName: String(appliedByUserName || '').trim().slice(0, 120) || undefined,
  calculatedAt: new Date().toISOString(),
});

export const getDeliveryDetailsFee = (details?: QuoteDeliveryDetails) =>
  Math.max(0, Number(details?.fee || 0));

export const getDeliveryDetailsCity = (details?: QuoteDeliveryDetails) =>
  String(details?.city || '').trim();

export const getDeliveryDetailsDistrict = (details?: QuoteDeliveryDetails) =>
  String(details?.district || '').trim();
