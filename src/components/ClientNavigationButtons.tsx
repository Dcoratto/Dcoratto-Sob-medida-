import React from 'react';
import {Client} from '../types';
import {cn} from '../lib/utils';

const cleanAddressPart = (value: unknown) => String(value || '').trim();

export const buildClientNavigationAddress = (client?: Client | null) => {
  if (!client) return '';

  const parts = [
    client.streetAddress || client.address,
    client.neighborhood,
    client.city,
    client.zipCode,
    client.condominiumName ? `Condomínio ${client.condominiumName}` : '',
    client.block ? `Quadra/Bloco ${client.block}` : '',
    client.lot ? `Lote ${client.lot}` : '',
    client.tower ? `Torre ${client.tower}` : '',
    client.apartmentNumber ? `Apartamento ${client.apartmentNumber}` : '',
  ].map(cleanAddressPart).filter(Boolean);

  return Array.from(new Set(parts)).join(', ');
};

const openExternalUrl = (url: string) => {
  const electronShell = (window as any).electron?.shell || (window as any).electronAPI?.shell;
  if (electronShell?.openExternal) {
    void electronShell.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
};

export const ClientNavigationButtons = ({client, className}: {client?: Client | null; className?: string}) => {
  const address = buildClientNavigationAddress(client);
  const hasAddress = Boolean(address);
  const encodedAddress = encodeURIComponent(address);
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
  const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

  const openRoute = (url: string) => {
    if (!hasAddress) return;
    openExternalUrl(url);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          title={hasAddress ? 'Abrir rota no Google Maps' : 'Endereço do cliente não cadastrado.'}
          disabled={!hasAddress}
          onClick={() => openRoute(googleMapsUrl)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          <img src="/icons/google-maps.svg" alt="" className="h-5 w-5 shrink-0" />
          Google Maps
        </button>
        <button
          type="button"
          title={hasAddress ? 'Abrir rota no Waze' : 'Endereço do cliente não cadastrado.'}
          disabled={!hasAddress}
          onClick={() => openRoute(wazeUrl)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          <img src="/icons/waze.svg" alt="" className="h-5 w-5 shrink-0" />
          Waze
        </button>
      </div>
      {!hasAddress && (
        <div className="text-xs font-semibold text-amber-600 dark:text-amber-300">Endereço do cliente não cadastrado.</div>
      )}
    </div>
  );
};
