import {useEffect, useRef, useState} from 'react';
import type {Material, QuoteMaterialAlternative, QuotePiece} from '../types';
import {belongsToPrincipal, validateAlternative} from '../lib/quoteMaterialAlternatives';
import {matchesMaterialSearch, normalizeMaterialSearch} from '../lib/quoteMaterials';
import {formatMaterialSpecs} from '../lib/materialSpecs';
import {getPieceQuantity} from '../lib/quotePieceQuantity';

export function MaterialAlternativeDialog({initial, options, catalog, pieces, environment, onClose, onSave}: {
  initial: QuoteMaterialAlternative; options: QuoteMaterialAlternative[];
  catalog: Array<Material & {variantKey: string}>; pieces: QuotePiece[]; environment: string;
  onClose: () => void; onSave: (option: QuoteMaterialAlternative) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(initial);
  const [search, setSearch] = useState('');
  const [pieceSearch, setPieceSearch] = useState('');
  const [mode, setMode] = useState<'all' | 'specific'>('specific');
  useEffect(() => {const element = dialog.current; element?.showModal(); return () => element?.close();}, []);
  const group = pieces.filter((piece) => belongsToPrincipal(piece, initial));
  const selectedIds = mode === 'all' ? group.map((piece) => piece.id) : draft.pieceIds;
  const candidate = {...draft, pieceIds: selectedIds};
  const error = validateAlternative(candidate, [...options.filter((option) => option.id !== draft.id), candidate], pieces);
  const selected = new Set(selectedIds);
  const visiblePieces = group.filter((piece) => normalizeMaterialSearch(`${piece.name} ${piece.presentationEnvironment || environment}`).includes(normalizeMaterialSearch(pieceSearch)));
  const visibleMaterials = catalog.filter((material) => material.id !== initial.principalMaterialId && matchesMaterialSearch(material, search)
    && !options.some((option) => option.id !== draft.id && option.principalMaterialId === initial.principalMaterialId
      && (option.principalVariantKey || '') === (initial.principalVariantKey || '') && option.materialId === material.id && option.materialVariantKey === material.variantKey));
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="alternative-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-2xl bg-white p-5 text-slate-700 shadow-xl backdrop:bg-slate-900/50">
    <h2 id="alternative-title" className="text-lg font-semibold text-slate-900">Opções de materiais</h2>
    <input aria-label="Pesquisar materiais alternativos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, categoria, acabamento, espessura..." className="my-4 w-full rounded-xl border border-slate-200 p-3 text-sm" />
    <div className="grid max-h-64 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
      {visibleMaterials.map((material) => <button key={material.variantKey} type="button" aria-pressed={draft.materialId === material.id && draft.materialVariantKey === material.variantKey} onClick={() => setDraft({...draft, materialId: material.id, materialVariantKey: material.variantKey})} className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm ${draft.materialId === material.id && draft.materialVariantKey === material.variantKey ? 'border-brand-primary bg-amber-50' : 'border-slate-200'}`}>
        {material.thumbnailUrl || material.imageUrl ? <img src={material.thumbnailUrl || material.imageUrl} alt="" loading="lazy" className="h-14 w-14 rounded-lg object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs">Sem foto</span>}
        <span>{material.name}<span className="mt-1 block text-xs text-slate-500">{formatMaterialSpecs(material)}</span></span>
      </button>)}
      {!visibleMaterials.length && <p className="p-3 text-sm">Nenhum material encontrado.</p>}
    </div>
    <div className="my-4 space-y-2 text-sm">
      <label className="flex gap-2"><input type="radio" name="alternative-scope" checked={mode === 'all'} onChange={() => setMode('all')} />Todas as peças atuais do grupo principal</label>
      <label className="flex gap-2"><input type="radio" name="alternative-scope" checked={mode === 'specific'} onChange={() => setMode('specific')} />Selecionar peças específicas</label>
    </div>
    {mode === 'specific' && <div className="space-y-3">
      <input aria-label="Pesquisar peças ou ambiente" value={pieceSearch} onChange={(event) => setPieceSearch(event.target.value)} placeholder="Pesquisar peça ou ambiente..." className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
      <div className="flex gap-4 text-xs"><button type="button" onClick={() => setDraft({...draft, pieceIds: group.map((piece) => piece.id)})} className="underline">Selecionar todas</button><button type="button" onClick={() => setDraft({...draft, pieceIds: []})} className="underline">Limpar seleção</button></div>
      <div className="max-h-48 overflow-auto">{visiblePieces.map((piece) => <label key={piece.id} className="flex items-center gap-3 rounded-lg p-3 text-sm hover:bg-slate-50"><input type="checkbox" checked={selected.has(piece.id)} onChange={(event) => setDraft({...draft, pieceIds: event.target.checked ? [...draft.pieceIds, piece.id] : draft.pieceIds.filter((id) => id !== piece.id)})} />{piece.name || 'Peça'} · {getPieceQuantity(piece)} un.</label>)}</div>
    </div>}
    <p className="my-4 text-xs" aria-live="polite">{selectedIds.length} registros · {group.filter((piece) => selected.has(piece.id)).reduce((sum, piece) => sum + getPieceQuantity(piece), 0)} unidades. As alternativas serão gravadas ao salvar o orçamento.</p>
    {error && draft.materialId && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={Boolean(error)} onClick={() => onSave(candidate)} className="rounded-xl bg-brand-primary px-4 py-2 text-sm disabled:opacity-40">Confirmar alternativa</button></div>
  </dialog>;
}
