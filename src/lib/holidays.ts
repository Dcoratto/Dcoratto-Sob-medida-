const pad = (value: number) => String(value).padStart(2, '0');
const keyFromDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const cityHolidayByMd: Record<string, Record<string, string>> = {
  'sao paulo': {'01-25': 'Anivers?rio de S?o Paulo'},
  'aruja': {'06-08': 'Anivers?rio de Aruj?'},
  'mogi das cruzes': {'09-01': 'Anivers?rio de Mogi das Cruzes'},
  'mogi': {'09-01': 'Anivers?rio de Mogi das Cruzes'},
  'suzano': {'04-02': 'Anivers?rio de Suzano'},
  'poa': {'03-26': 'Anivers?rio de Po?'},
  'po?': {'03-26': 'Anivers?rio de Po?'},
  'itaquaquecetuba': {'09-08': 'Anivers?rio de Itaquaquecetuba'},
  'itaqua': {'09-08': 'Anivers?rio de Itaquaquecetuba'},
  'ferraz de vasconcelos': {'10-14': 'Anivers?rio de Ferraz de Vasconcelos'},
  'guarulhos': {'12-08': 'Anivers?rio de Guarulhos'},
  'biritiba mirim': {'05-05': 'Anivers?rio de Biritiba Mirim'},
  'salesopolis': {'11-30': 'Anivers?rio de Sales?polis'},
  'sales?polis': {'11-30': 'Anivers?rio de Sales?polis'},
  'santa isabel': {'07-10': 'Anivers?rio de Santa Isabel'},
};

const addDays = (date: Date, days: number) => {
  const output = new Date(date);
  output.setDate(output.getDate() + days);
  return output;
};

const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

export const getHolidayMapForYear = (year: number) => {
  const map: Record<string, string> = {};
  const add = (date: Date, label: string) => {
    map[keyFromDate(date)] = label;
  };

  add(new Date(year, 0, 1), 'Confraternização Universal');
  add(new Date(year, 3, 21), 'Tiradentes');
  add(new Date(year, 4, 1), 'Dia do Trabalho');
  add(new Date(year, 8, 7), 'Independência do Brasil');
  add(new Date(year, 9, 12), 'Nossa Senhora Aparecida');
  add(new Date(year, 10, 2), 'Finados');
  add(new Date(year, 10, 15), 'Proclamação da República');
  add(new Date(year, 11, 25), 'Natal');

  const easter = easterSunday(year);
  add(addDays(easter, -48), 'Carnaval');
  add(addDays(easter, -47), 'Carnaval');
  add(addDays(easter, -2), 'Sexta-feira Santa');
  add(addDays(easter, 60), 'Corpus Christi');

  return map;
};

export const getCityHolidayName = (date: Date, city?: string) => {
  const normalizedCity = normalize(city);
  const cityHolidays = cityHolidayByMd[normalizedCity];
  if (!cityHolidays) return '';
  return cityHolidays[`${pad(date.getMonth() + 1)}-${pad(date.getDate())}`] || '';
};

export const getHolidayInfo = (date: Date, city?: string) => {
  const nationalMap = getHolidayMapForYear(date.getFullYear());
  const national = nationalMap[keyFromDate(date)] || '';
  const cityName = getCityHolidayName(date, city);
  return {
    national,
    city: cityName,
    isHoliday: Boolean(national || cityName),
  };
};
