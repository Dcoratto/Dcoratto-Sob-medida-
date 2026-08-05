import type {DeliveryConfig, QuoteDeliveryDetails} from '../types';

const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const calculateDeliveryFee = (distanceKm: number, config: DeliveryConfig) => {
  if (!config.enabled) return 0;

  const normalizedDistance = Math.min(10000, Math.max(0, Number(distanceKm) || 0));
  const ratePerKm = Math.min(10000, Math.max(0, Number(config.ratePerKm) || 0));
  const minimumFee = Math.min(10000000, Math.max(0, Number(config.minimumFee) || 0));
  const maximumFee = config.maximumFee == null
    ? null
    : Math.min(10000000, Math.max(minimumFee, Number(config.maximumFee) || 0));
  const calculatedFee = Math.max(minimumFee, normalizedDistance * ratePerKm);

  return roundCurrency(maximumFee == null ? calculatedFee : Math.min(calculatedFee, maximumFee));
};

export const buildDeliveryDetails = ({
  mode,
  distanceKm,
  durationMinutes,
  originAddress,
  destinationAddress,
  config,
}: {
  mode: QuoteDeliveryDetails['mode'];
  distanceKm: number;
  durationMinutes?: number | null;
  originAddress: string;
  destinationAddress: string;
  config: DeliveryConfig;
}): QuoteDeliveryDetails => ({
  mode,
  distanceKm: Math.round(Math.min(10000, Math.max(0, Number(distanceKm) || 0)) * 10) / 10,
  durationMinutes: durationMinutes == null
    ? null
    : Math.round(Math.min(100000, Math.max(0, Number(durationMinutes) || 0))),
  ratePerKm: roundCurrency(Math.min(10000, Math.max(0, Number(config.ratePerKm) || 0))),
  minimumFee: roundCurrency(Math.min(10000000, Math.max(0, Number(config.minimumFee) || 0))),
  maximumFee: config.maximumFee == null
    ? null
    : roundCurrency(Math.min(10000000, Math.max(0, Number(config.maximumFee) || 0))),
  fee: calculateDeliveryFee(distanceKm, config),
  originAddress: String(originAddress || '').trim().slice(0, 256),
  destinationAddress: String(destinationAddress || '').trim().slice(0, 256),
  provider: mode === 'automatic' ? 'mapbox' : mode === 'manual' ? 'manual' : undefined,
  calculatedAt: new Date().toISOString(),
});
