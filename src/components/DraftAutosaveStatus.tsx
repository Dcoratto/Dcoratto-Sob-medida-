import React from 'react';

type DraftAutosaveStatusProps = {
  savedAt?: string | null;
  className?: string;
};

const formatSavedAt = (savedAt?: string | null) => {
  if (!savedAt) return 'Salvamento automatico ativo';
  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) return 'Salvamento automatico ativo';
  return `Salvo automaticamente as ${parsed.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

export const DraftAutosaveStatus: React.FC<DraftAutosaveStatusProps> = ({
  savedAt,
  className = '',
}) => (
  <div className={`text-xs font-semibold text-slate-400 ${className}`.trim()}>
    {formatSavedAt(savedAt)}
  </div>
);
