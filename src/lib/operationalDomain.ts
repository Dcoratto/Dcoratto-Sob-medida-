import {getHolidayInfo} from './holidays';
import type {BoardFilter, OperationalBoard} from './operational';

export const stages = [
  ['sold', 'Vendido'], ['measurement', 'Medição'], ['executive', 'Projeto Executivo'],
  ['approval', 'Aprovação'], ['ready', 'Executivo Pronto'], ['cutting', 'Corte'],
  ['finishing', 'Acabamento'], ['assembly', 'Montagem'], ['inspection', 'Conferência'],
  ['final_finishing', 'Acabamento Final'], ['delivery', 'Entrega'], ['installation', 'Instalação'],
  ['completed', 'Finalizado'], ['aftercare', 'Pós-Instalação'],
] as const;
export type Stage = typeof stages[number][0];
export const stageLabel = (key: string) => stages.find(([id]) => id === key)?.[1] || key;
export const priorities = {normal: 'Normal', high: 'Alta', urgent: 'Urgente'} as const;
export const dependencyTypes = {furniture: 'Móveis', sink: 'Cuba', appliance: 'Eletrodoméstico', metalwork: 'Serralheria', civil: 'Obra civil', client: 'Cliente', other: 'Outro'};
export const blockTypes = {client: 'Cliente', furniture: 'Móveis', material: 'Material', civil: 'Obra civil', supplier: 'Fornecedor', payment: 'Pagamento', other: 'Outro'};
export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const parseDay = (key: string) => new Date(`${key}T12:00:00`);
export const isBusinessDay = (date: Date, city = '') => date.getDay() !== 0 && date.getDay() !== 6 && !getHolidayInfo(date, city).isHoliday;
export function addBusinessDays(key: string, days: number, city = '') {
  const date = parseDay(key);
  for (let count = 0; count < days;) {
    date.setDate(date.getDate() + 1);
    if (isBusinessDay(date, city)) count++;
  }
  return dateKey(date);
}
export function businessDaysBetween(from: string, to: string, city = '') {
  if (from > to) return -businessDaysBetween(to, from, city);
  const date = parseDay(from);
  let count = 0;
  while (dateKey(date) < to) {
    date.setDate(date.getDate() + 1);
    if (isBusinessDay(date, city)) count++;
  }
  return count;
}
export const deadlineStatus = (days: number | null, attention: number, urgent: number) => days === null ? 'none' : days < 0 ? 'late' : days <= urgent ? 'urgent' : days <= attention ? 'attention' : 'normal';

export const safeDriveUrl = (value?: string | null) => {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
};
export function filterOperationalBoard(board: OperationalBoard, filter: BoardFilter, today = new Date()): OperationalBoard {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const start = new Date(today); start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const key = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const inWeek = (value: string | null) => !!value && value >= key(start) && value <= key(end);
  const cards = board.cards.filter(card =>
    (!filter.search || normalize(`${card.client_name} ${card.contract_number}`).includes(normalize(filter.search))) &&
    (!filter.stage || card.stage === filter.stage) && (!filter.priority || card.priority === filter.priority) &&
    (filter.completed || filter.stage === 'completed' || card.stage !== 'completed') &&
    (!filter.situation || (filter.situation === 'late' ? (card.remaining_days ?? 0) < 0 :
      filter.situation === 'blocked' ? card.blocked || card.dependent_count > 0 :
      filter.situation === 'measurement' ? inWeek(card.measurement_date) :
      filter.situation === 'installation' ? inWeek(card.installation_date) : card.stage !== 'completed')));
  return {...board, total: cards.length, cards: cards.slice(filter.offset || 0, (filter.offset || 0) + 100)};
}
