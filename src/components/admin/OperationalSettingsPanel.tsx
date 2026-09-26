import React, {useEffect, useState} from 'react';
import {loadOperationalSettings, saveOperationalSettings, type OperationalSettings} from '../../lib/operational';

export const OperationalSettingsPanel = () => {
  const [settings, setSettings] = useState<OperationalSettings | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {let active = true; loadOperationalSettings().then(data => {if (active) setSettings(data);}).catch(error => {if (active) setMessage(error.message);}); return () => {active = false;};}, []);
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); if (!settings) return;
    setBusy(true); setMessage('');
    try {setSettings(await saveOperationalSettings(settings)); setMessage('Prazos salvos. SLAs já iniciados preservam seu prazo original.');}
    catch (error) {setMessage(error instanceof Error ? error.message : 'Erro ao salvar prazos.');}
    finally {setBusy(false);}
  }}>
    <div className="grid gap-4 sm:grid-cols-2">
      {([['executive_days', 'Projeto Executivo'], ['installation_days', 'Executivo Pronto até Instalação'], ['attention_days', 'Alerta de atenção'], ['urgent_days', 'Alerta urgente']] as const).map(([key, label]) => <label key={key} className="space-y-2 text-sm text-slate-600">
        <span className="block">{label} (dias úteis)</span>
        <input required type="number" min={key.endsWith('_days') && ['attention_days', 'urgent_days'].includes(key) ? 0 : 1} max={key === 'urgent_days' ? settings?.attention_days : 365} value={settings?.[key] ?? ''} disabled={!settings || busy} onChange={event => setSettings(current => current && ({...current, [key]: Number(event.target.value)}))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
      </label>)}
    </div>
    <p className="text-sm text-slate-500">Sábados, domingos e os feriados já utilizados pelo calendário não contam. Prioridade não altera os prazos.</p>
    <button disabled={!settings || busy} className="rounded-xl bg-brand-primary px-4 py-3 text-[#3F3A34] disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar prazos'}</button>
    {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
  </form>;
};
