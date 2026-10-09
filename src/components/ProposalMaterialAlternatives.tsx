import type {QuotePresentationSnapshot} from '../lib/quoteDigital';
import {simulateMaterialAlternatives, type MaterialSelections} from '../lib/quoteMaterialAlternatives';
import {formatCurrency} from '../lib/utils';
import {formatMaterialSpecs} from '../lib/materialSpecs';

export function ProposalMaterialAlternatives({snapshot, selections, disabled, onChange, onConfirm, onZoom}: {
  snapshot: QuotePresentationSnapshot; selections: MaterialSelections; disabled: boolean;
  onChange: (selections: MaterialSelections) => void; onConfirm: () => void;
  onZoom: (image: {src: string; alt: string}) => void;
}) {
  const config = snapshot.materialAlternatives;
  if (!config?.options.length) return null;
  const simulation = simulateMaterialAlternatives(snapshot, selections);
  const groups = new Map<string, NonNullable<QuotePresentationSnapshot['pieces']>>();
  for (const piece of snapshot.pieces || []) {
    const offered = config.options.filter((option) => option.pieceIds.includes(piece.id)).map((option) => option.id).sort();
    if (!offered.length) continue;
    // Keep each record independently selectable even when a legacy quote uses one global environment.
    const key = JSON.stringify([piece.environment || '', piece.id, piece.materialId, offered]);
    groups.set(key, [...(groups.get(key) || []), piece]);
  }
  const signed = (value: number) => `${value < 0 ? '−' : '+'} ${formatCurrency(Math.abs(value))}`;
  return <section className="border-t border-white/10 px-5 py-16" aria-labelledby="proposal-material-options">
    <div className="mx-auto max-w-6xl space-y-8">
      <div><h2 id="proposal-material-options" className="text-2xl font-semibold text-[#f7f1ea]">Personalize os materiais do seu projeto</h2><p className="mt-3 text-sm leading-7 text-[#d6c6b4]">Conheça outras opções de materiais e veja como cada escolha influencia o valor da sua proposta.</p></div>
      {[...groups].map(([key, pieces]) => {
        const first = pieces[0];
        const principal = (snapshot.materials || []).find((material) => material.id === first.materialId) || snapshot.material;
        const offered = config.options.filter((option) => option.pieceIds.includes(first.id));
        const cleared = {...selections};
        pieces.forEach((piece) => delete cleared[piece.id]);
        const baseTotal = simulateMaterialAlternatives(snapshot, cleared).total;
        const choices = [{id: '', material: principal || {name: first.materialName}, reviewReason: '', pieceDeltas: {}}, ...offered];
        return <div key={key} className="space-y-4">
          <h3 className="font-semibold text-[#f7f1ea]">Escolha o material de {first.name || 'sua peça'}</h3>
          {first.environment && <p className="text-xs text-[#d6c6b4]">{first.environment}</p>}
          <p className="text-sm text-[#d6c6b4]">{pieces.map((piece) => piece.name).join(' · ')} — {pieces.length} registros, {pieces.reduce((sum, piece) => sum + (piece.quantity || 1), 0)} unidades</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{choices.map((choice) => {
            const candidate = {...cleared};
            if (choice.id) pieces.forEach((piece) => {candidate[piece.id] = choice.id;});
            const difference = choice.reviewReason ? 0 : simulateMaterialAlternatives(snapshot, candidate).total - baseTotal;
            const selected = pieces.every((piece) => (selections[piece.id] || '') === choice.id);
            return <div key={choice.id} className={`overflow-hidden rounded-2xl border ${selected ? 'border-[#e1c6a4] bg-[#292017]' : 'border-white/10 bg-[#171411]'}`}>
              <button type="button" disabled={disabled || Boolean(choice.reviewReason)} aria-pressed={selected} onClick={() => onChange(candidate)} className="w-full text-left disabled:opacity-60">
                {choice.material?.imageUrl ? <img src={choice.material.imageUrl} alt={choice.material.name || 'Material'} loading="lazy" onError={(event) => {event.currentTarget.onerror = null; event.currentTarget.src = '/material-placeholder.svg';}} className="h-44 w-full object-cover" /> : <div className="flex h-44 items-center justify-center bg-white/5 text-sm text-[#d6c6b4]">Imagem indisponível</div>}
                <span className="block space-y-2 p-4 text-[#f7f1ea]"><span className="block">{choice.material?.name || first.materialName}</span><span className="block text-xs text-[#d6c6b4]">{formatMaterialSpecs(choice.material || {})}</span><span className="block text-sm">{choice.id ? choice.reviewReason || signed(difference) : 'Material principal'}</span>{selected && <span className="block text-xs text-[#e1c6a4]">Selecionado</span>}</span>
              </button>
              {choice.material?.imageUrl && <button type="button" aria-label={`Ampliar imagem de ${choice.material.name}`} onClick={() => onZoom({src: choice.material!.imageUrl!, alt: choice.material!.name || 'Material'})} className="px-4 pb-4 text-xs text-[#d6c6b4] underline">Ampliar imagem</button>}
            </div>;
          })}</div>
        </div>;
      })}
      <div aria-live="polite" className="space-y-3 rounded-2xl border border-white/10 p-5 text-[#f7f1ea]">
        <p>Proposta original: {formatCurrency(snapshot.investment?.totalPrice || 0)}</p>
        {simulation.changes.map((change) => <p key={change.pieceId} className="text-sm text-[#d6c6b4]">{snapshot.pieces?.find((piece) => piece.id === change.pieceId)?.name} — {change.materialName}: {signed('difference' in change ? Number(change.difference) : 0)}</p>)}
        <p>Diferença total: {signed(simulation.difference)}</p>
        <p className="text-xl">Novo valor da proposta: {formatCurrency(simulation.total)}</p>
        <button type="button" disabled={disabled} onClick={onConfirm} className="rounded-xl bg-[#e1c6a4] px-4 py-3 text-sm text-[#3a2d22] disabled:opacity-50">Confirmar materiais escolhidos</button>
        <p className="text-xs text-[#d6c6b4]">A confirmação será registrada no aceite desta versão da proposta.</p>
      </div>
    </div>
  </section>;
}
