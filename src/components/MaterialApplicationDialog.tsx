import {useEffect, useRef} from 'react';
import type {QuotePiece} from '../types';
import {normalizeMaterialSearch} from '../lib/quoteMaterials';

export type MaterialApplicationSelection = {
  materialId: string;
  variantKey?: string;
  mode: 'all' | 'specific';
  selectedIds: string[];
  search: string;
};

export function MaterialApplicationDialog({selection, name, pieces, onChange, onClose, onApply}: {
  selection: MaterialApplicationSelection;
  name: string;
  pieces: QuotePiece[];
  onChange: (selection: MaterialApplicationSelection) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const element = dialog.current;
    return () => element?.close();
  }, []);
  const selected = new Set(selection.selectedIds);
  const terms = normalizeMaterialSearch(selection.search).split(' ');
  const visible = pieces.filter((piece) => terms.every((term) => normalizeMaterialSearch(piece.name || '').includes(term)));
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="material-application-title" className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[90dvh] overflow-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-xl backdrop:bg-slate-900/50">
      <h2 id="material-application-title" className="text-lg font-semibold text-slate-900">Gerenciar aplicação</h2>
      <p className="mt-2 text-sm">Material: {name}</p>
      <div className="my-4 space-y-3 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="material-application-mode" checked={selection.mode === 'all'} onChange={() => onChange({...selection, mode: 'all'})} />Aplicar em todas as peças</label>
        <label className="flex items-center gap-2"><input type="radio" name="material-application-mode" checked={selection.mode === 'specific'} onChange={() => onChange({...selection, mode: 'specific'})} />Selecionar peças específicas</label>
      </div>
      {selection.mode === 'specific' && (
        <div className="space-y-3">
          <input aria-label="Pesquisar peças" value={selection.search} onChange={(event) => onChange({...selection, search: event.target.value})} placeholder="Pesquisar por nome da peça..." className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
          <div className="flex flex-wrap gap-3 text-xs">
            <button type="button" onClick={() => onChange({...selection, selectedIds: pieces.map((piece) => piece.id)})} className="text-brand-primary underline">Selecionar todas</button>
            <button type="button" onClick={() => onChange({...selection, selectedIds: []})} className="text-brand-primary underline">Limpar seleção</button>
            <span aria-live="polite">{pieces.filter((piece) => selected.has(piece.id)).length} de {pieces.length} peças selecionadas</span>
          </div>
          <div className="max-h-64 space-y-1 overflow-auto rounded-xl border border-slate-100 p-2">
            {visible.map((piece) => <label key={piece.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 text-sm hover:bg-slate-50"><input type="checkbox" checked={selected.has(piece.id)} onChange={(event) => onChange({...selection, selectedIds: event.target.checked ? [...selection.selectedIds, piece.id] : selection.selectedIds.filter((id) => id !== piece.id)})} />{piece.name || 'Peça sem nome'}</label>)}
            {!visible.length && <p className="p-3 text-sm text-slate-500">Nenhuma peça encontrada.</p>}
          </div>
        </div>
      )}
      <p className="my-4 text-xs text-slate-500">A aplicação atualiza as peças e a precificação. Use Salvar orçamento para gravar todas as alterações juntas.</p>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Cancelar</button>
        <button type="button" disabled={!pieces.length || (selection.mode === 'specific' && !selection.selectedIds.length)} onClick={onApply} className="rounded-xl bg-brand-primary px-4 py-2 text-sm text-[#3F3A34] disabled:opacity-40">Aplicar material</button>
      </div>
    </dialog>
  );
}
