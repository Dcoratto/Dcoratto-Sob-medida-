import React from 'react';
import {DraftAutosaveStatus} from './DraftAutosaveStatus';

type DraftNoticeProps = {
  message?: string;
  onClear: () => void;
  className?: string;
  savedAt?: string | null;
};

export const DraftNotice: React.FC<DraftNoticeProps> = ({
  message = 'Rascunho recuperado automaticamente. Voce pode continuar de onde parou.',
  onClear,
  className = '',
  savedAt,
}) => (
  <div className={`flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:flex-row md:items-center md:justify-between ${className}`.trim()}>
    <div>
      <div className="font-bold">Rascunho recuperado</div>
      <div className="text-amber-800/80">{message}</div>
      <DraftAutosaveStatus savedAt={savedAt} className="mt-1 text-amber-800/70" />
    </div>
    <button
      type="button"
      onClick={onClear}
      className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 transition-all hover:bg-amber-100"
    >
      Limpar rascunho
    </button>
  </div>
);
