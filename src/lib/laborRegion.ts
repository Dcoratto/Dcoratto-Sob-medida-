import {Settings} from '../types';
import {repairText} from './utils';

export type LaborRegionKey = 'altoTiete' | 'saoPaulo';

const ALTO_TIETE_CITIES = [
  'Arujá',
  'Mogi das Cruzes',
  'Suzano',
  'Poá',
  'Itaquaquecetuba',
  'Ferraz de Vasconcelos',
  'Guarulhos',
  'Biritiba Mirim',
  'Salesópolis',
  'Santa Isabel',
];

const normalize = (value?: string) =>
  repairText(String(value || ''))
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizedAltoTieteCities = new Set(ALTO_TIETE_CITIES.map(normalize));

export const inferLaborRegion = ({city, address}: {city?: string; address?: string}): LaborRegionKey | null => {
  const normalizedCity = normalize(city);
  if (normalizedCity === 'sao paulo') return 'saoPaulo';
  if (normalizedAltoTieteCities.has(normalizedCity)) return 'altoTiete';

  const normalizedAddress = normalize(address);
  if (!normalizedAddress) return null;
  if (normalizedAddress.includes('sao paulo')) return 'saoPaulo';

  for (const altoTieteCity of normalizedAltoTieteCities) {
    if (normalizedAddress.includes(altoTieteCity)) return 'altoTiete';
  }

  return null;
};

export const getRegionalLaborMinimum = (
  settings: Settings,
  location: {city?: string; address?: string},
) => {
  const region = inferLaborRegion(location);
  if (!region) return 0;
  return Math.max(0, Number(settings.laborMinimumByRegion?.[region] || 0));
};
