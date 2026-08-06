import {QuoteComplexityOption, QuoteLocationCityRule, QuoteLocationPricingConfig} from '../types';
import {repairText} from './utils';

const normalize = (value?: string) =>
  repairText(String(value || ''))
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const makeId = (prefix: string, value: string) =>
  `${prefix}-${normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'}`;

export const DEFAULT_QUOTE_COMPLEXITY_OPTIONS: QuoteComplexityOption[] = [
  {key: 'normal', label: 'Normal', percent: 0, active: true, sortOrder: 0},
  {key: 'baixa', label: 'Baixa', percent: 1, active: true, sortOrder: 1},
  {key: 'media', label: 'Media', percent: 5, active: true, sortOrder: 2},
  {key: 'alta', label: 'Alta', percent: 10, active: true, sortOrder: 3},
];

export const sanitizeLocationPricingConfig = (
  config: QuoteLocationPricingConfig | undefined,
  fallbackMode: 'linear' | 'fixed' | 'location',
): QuoteLocationPricingConfig => {
  const cityRules = (config?.cityRules || [])
    .map((cityRule) => ({
      id: cityRule.id || makeId('city', cityRule.city || ''),
      city: repairText(String(cityRule.city || '')).trim(),
      amount: Math.max(0, Number(cityRule.amount) || 0),
      active: cityRule.active !== false,
      districts: (cityRule.districts || [])
        .map((districtRule) => ({
          id: districtRule.id || makeId('district', districtRule.district || ''),
          district: repairText(String(districtRule.district || '')).trim(),
          amount: Math.max(0, Number(districtRule.amount) || 0),
          active: districtRule.active !== false,
        }))
        .filter((districtRule) => districtRule.district)
        .sort((a, b) => a.district.localeCompare(b.district, 'pt-BR', {sensitivity: 'base'})),
    }))
    .filter((cityRule) => cityRule.city)
    .sort((a, b) => a.city.localeCompare(b.city, 'pt-BR', {sensitivity: 'base'}));

  return {
    mode: config?.mode || fallbackMode,
    fixedAmount: Math.max(0, Number(config?.fixedAmount) || 0),
    defaultAmount: Math.max(0, Number(config?.defaultAmount) || 0),
    cityRules,
  };
};

export const sanitizeQuoteComplexityOptions = (options: QuoteComplexityOption[] | undefined) => {
  const rows = (options || DEFAULT_QUOTE_COMPLEXITY_OPTIONS)
    .map((option, index) => ({
      key: repairText(String(option.key || '')).trim().toLowerCase() || makeId('complexity', option.label || `${index}`),
      label: repairText(String(option.label || '')).trim() || `Opcao ${index + 1}`,
      percent: Number(option.percent) || 0,
      active: option.active !== false,
      sortOrder: Number.isFinite(Number(option.sortOrder)) ? Number(option.sortOrder) : index,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR', {sensitivity: 'base'}));

  return rows.length ? rows : DEFAULT_QUOTE_COMPLEXITY_OPTIONS;
};

export const resolveLocationAmount = (
  config: QuoteLocationPricingConfig | undefined,
  location: {city?: string; district?: string},
) => {
  const normalizedCity = normalize(location.city);
  const normalizedDistrict = normalize(location.district);
  const safeConfig = sanitizeLocationPricingConfig(config, 'location');

  const activeCityRule = safeConfig.cityRules.find((cityRule) => cityRule.active !== false && normalize(cityRule.city) === normalizedCity);
  const activeDistrictRule = activeCityRule?.districts.find((districtRule) => (
    districtRule.active !== false
    && normalize(districtRule.district) === normalizedDistrict
  ));

  if (activeDistrictRule) {
    return {
      amount: Math.max(0, Number(activeDistrictRule.amount) || 0),
      source: 'district' as const,
      city: activeCityRule?.city || '',
      district: activeDistrictRule.district,
    };
  }

  if (activeCityRule) {
    return {
      amount: Math.max(0, Number(activeCityRule.amount) || 0),
      source: 'city' as const,
      city: activeCityRule.city,
      district: '',
    };
  }

  return {
    amount: Math.max(0, Number(safeConfig.defaultAmount) || 0),
    source: 'default' as const,
    city: '',
    district: '',
  };
};

export const resolveLaborAmount = (
  config: QuoteLocationPricingConfig | undefined,
  location: {city?: string; district?: string},
) => {
  const safeConfig = sanitizeLocationPricingConfig(config, 'linear');
  if (safeConfig.mode === 'fixed') {
    return {
      amount: Math.max(0, Number(safeConfig.fixedAmount) || 0),
      source: 'fixed' as const,
      city: '',
      district: '',
    };
  }

  if (safeConfig.mode === 'location') {
    return resolveLocationAmount(safeConfig, location);
  }

  return {
    amount: 0,
    source: 'linear' as const,
    city: '',
    district: '',
  };
};

export const ensureCityRule = (cityRule?: Partial<QuoteLocationCityRule>): QuoteLocationCityRule => ({
  id: cityRule?.id || makeId('city', cityRule?.city || ''),
  city: repairText(String(cityRule?.city || '')).trim(),
  amount: Math.max(0, Number(cityRule?.amount) || 0),
  active: cityRule?.active !== false,
  districts: (cityRule?.districts || []).map((districtRule) => ({
    id: districtRule.id || makeId('district', districtRule.district || ''),
    district: repairText(String(districtRule.district || '')).trim(),
    amount: Math.max(0, Number(districtRule.amount) || 0),
    active: districtRule.active !== false,
  })),
});
