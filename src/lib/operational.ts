import {supabase} from './supabase';
import type {Stage} from './operationalDomain';

export type OperationalSettings = {executive_days: number; installation_days: number; attention_days: number; urgent_days: number};
export type OperationalCard = {
  contract_id: string; client_id: string; client_name: string; contract_number: string;
  stage: Stage; priority: 'normal' | 'high' | 'urgent'; version: number;
  piece_count: number; installed_count: number; dependent_count: number; blocked: boolean;
  due_date: string | null; remaining_days: number | null; paused: boolean;
  measurement_date: string | null; measurement_time: string | null;
  installation_date: string | null; installation_time: string | null;
};
export type OperationalDetail = {
  card: OperationalCard; drive_url: string | null; settings: OperationalSettings;
  pieces: {id: string; label: string; stage: Stage; installed: boolean; installed_at: string | null}[];
  dependencies: {id: string; piece_id: string; kind: string; note: string; released_at: string | null}[];
  blocks: {id: string; reason: string; note: string; pause_sla: boolean; started_at: string; ended_at: string | null}[];
  slas: {id: string; kind: string; started_on: string; original_due: string; due_date: string; closed_at: string | null}[];
  events: {id: string; kind: string; payload: Record<string, any>; actor_name: string; created_at: string}[];
  schedules: {id: string; operational_kind: string; date_key: string; event_time: string | null; status: string | null}[];
  visits: {id: string; calendar_event_id: string; completed_at: string; piece_count: number; corrected_count: number}[];
  aftercare: {id: string; description: string; note: string; opened_at: string; resolved_at: string | null; resolution: string | null; piece_ids: string[]}[];
};
export type OperationalBoard = {cards: OperationalCard[]; total: number; settings: OperationalSettings; indicators: Record<string, number>};
export type BoardFilter = {search?: string; stage?: string; priority?: string; situation?: string; completed?: boolean; offset?: number};
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const {data, error} = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const loadOperationalBoard = (filter: BoardFilter = {}) => rpc<OperationalBoard>('operational_board', {p_filter: filter});
export const loadOperationalDetail = (id: string) => rpc<OperationalDetail>('operational_detail', {p_contract_id: id});
export const loadOperationalEvents = (id: string, before: OperationalDetail['events'][number]) => rpc<OperationalDetail['events']>('operational_events_page', {p_contract_id: id, p_before: before.created_at, p_before_id: before.id});
export const mutateOperational = (card: OperationalCard, action: string, payload: Record<string, unknown>) => rpc<OperationalDetail>('operational_mutate', {p_contract_id: card.contract_id, p_version: card.version, p_action: action, p_payload: payload});
export const loadOperationalSettings = () => rpc<OperationalSettings>('operational_settings_get');
export const saveOperationalSettings = (settings: OperationalSettings) => rpc<OperationalSettings>('operational_settings_save', {p_settings: settings});
