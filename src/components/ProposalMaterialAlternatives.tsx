import {useEffect, useMemo, useRef, useState} from 'react';
import type {QuotePresentationSnapshot} from '../lib/quoteDigital';
import {simulateMaterialAlternatives, type MaterialSelections} from '../lib/quoteMaterialAlternatives';
import {applyMaterialGroup, buildAlternativeGallery, buildOriginalMaterialGroups, resolveGroupAlternative, restoreMaterialGroup} from '../lib/quoteMaterialGroups';
import {formatCurrency} from '../lib/utils';

export function ProposalMaterialAlternatives({snapshot, selections, disabled, onChange, onConfirm, onZoom}: {
  snapshot: QuotePresentationSnapshot; selections: MaterialSelections; disabled: boolean;
  onChange: (selections: MaterialSelections) => void; onConfirm: () => void;
  onZoom: (image: {src: string; alt: string}) => void;
}) {
  const config = snapshot.materialAlternatives;
  const groups = useMemo(() => buildOriginalMaterialGroups(snapshot), [snapshot]);
  const gallery = useMemo(() => buildAlternativeGallery(snapshot), [snapshot]);
  const availability = useMemo(() => new Map(groups.map((group) => [group.id,
    new Map(gallery.map((item) => [item.id, resolveGroupAlternative(snapshot, group.id, item.id, groups)])),
  ])), [snapshot, groups, gallery]);
  const simulation = useMemo(() => simulateMaterialAlternatives(snapshot, selections), [snapshot, selections]);
  const [chosenMaterial, setChosenMaterial] = useState('');
  const [chosenGroup, setChosenGroup] = useState('');
  const [preferredGroup, setPreferredGroup] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chosenMaterial) dialog.current?.showModal();
    else dialog.current?.close();
  }, [chosenMaterial]);
  if (!config?.options.length) return null;
  const signed = (value: number) => `${value < 0 ? '−' : '+'} ${formatCurrency(Math.abs(value))}`;
  const selectedMaterial = gallery.find((item) => item.id === chosenMaterial);
  const resolution = availability.get(chosenGroup)?.get(chosenMaterial);
  const chooseForGroup = (groupId: string) => {
    setPreferredGroup(groupId);
    galleryRef.current?.scrollIntoView({behavior: 'smooth', block: 'center'});
    galleryRef.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
  };
  return <section className="border-t border-white/10 px-5 py-16" aria-labelledby="proposal-material-options">
    <div className="mx-auto max-w-6xl space-y-8">
      <div><h2 id="proposal-material-options" className="text-2xl font-semibold text-[#f7f1ea]">Personalize o material do seu projeto</h2><p className="mt-3 text-sm leading-7 text-[#d6c6b4]">Conheça outras opções de materiais e personalize seu projeto. Selecione uma alternativa para visualizar a diferença no valor da proposta.</p></div>
      {preferredGroup && <p className="text-sm text-[#e1c6a4]">Escolha uma alternativa para {groups.find((group) => group.id === preferredGroup)?.name}.</p>}
      <div ref={galleryRef} aria-label="Galeria de materiais alternativos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {gallery.map((item) => {
          const selected = config.options.some((option) => option.materialId === item.id && Object.values(selections).includes(option.id));
          return <div key={item.id} className={`overflow-hidden rounded-2xl border ${selected ? 'border-[#e1c6a4] bg-[#292017]' : 'border-white/10 bg-[#171411]'}`}>
            <button type="button" disabled={disabled} aria-label={`Escolher ${item.material.name}`} aria-pressed={selected} onClick={() => {setChosenGroup(preferredGroup); setChosenMaterial(item.id);}} className="w-full text-left disabled:opacity-60">
              <img src={item.material.imageUrl || '/material-placeholder.svg'} alt={item.material.name || 'Material'} loading="lazy" onError={(event) => {event.currentTarget.onerror = null; event.currentTarget.src = '/material-placeholder.svg';}} className="h-28 w-full object-cover sm:h-36" />
              <span className="block space-y-2 p-3 text-sm text-[#f7f1ea]"><span className="block">{item.material.name}</span>{item.finishes.length > 0 && <span className="block text-xs text-[#d6c6b4]">{item.finishes.join(' · ')}</span>}{selected && <span className="block text-xs text-[#e1c6a4]">Selecionado</span>}</span>
            </button>
            {item.material.imageUrl && <button type="button" aria-label={`Ampliar imagem de ${item.material.name}`} onClick={() => onZoom({src: item.material.imageUrl!, alt: item.material.name || 'Material'})} className="min-h-11 px-3 pb-3 text-xs text-[#d6c6b4] underline">Ampliar imagem</button>}
          </div>;
        })}
      </div>
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[#f7f1ea]">Materiais do seu projeto</h3>
        {groups.map((group) => {
          const changes = simulation.changes.filter((change) => group.pieces.some((piece) => piece.id === change.pieceId));
          const names = [...new Set(changes.map((change) => change.materialName))];
          const difference = changes.reduce((sum, change) => sum + ('difference' in change ? Number(change.difference) : 0), 0);
          const legacyPartial = changes.length > 0 && (changes.length !== group.pieces.length || names.length !== 1);
          const canChoose = [...(availability.get(group.id)?.values() || [])].some((result) => result.selections);
          return <div key={group.id} className="space-y-2 rounded-xl border border-white/10 p-4 text-sm text-[#d6c6b4]">
            <h4 className="font-semibold text-[#f7f1ea]">{group.name}</h4>
            <p>{group.pieces.length} registros — {group.units} unidades</p>
            <p>{changes.length ? `${legacyPartial ? 'Escolhas anteriores preservadas' : 'Substituído por'}: ${names.join(' · ')}` : 'Material original mantido.'}</p>
            {changes.length > 0 && <p>Diferença: {signed(difference)}</p>}
            {!canChoose && !disabled && <p className="text-xs text-[#e1c6a4]">Para trocar este grupo inteiro, peça ao vendedor para ajustar as alternativas.</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={disabled || !canChoose} onClick={() => chooseForGroup(group.id)} className="min-h-11 rounded-lg border border-white/20 px-3 py-2 disabled:opacity-50">{changes.length ? 'Alterar' : 'Escolher alternativa'}</button>
              {changes.length > 0 && <button type="button" disabled={disabled} onClick={() => onChange(restoreMaterialGroup(snapshot, selections, group.id))} className="min-h-11 rounded-lg px-3 py-2 underline disabled:opacity-50">Restaurar original</button>}
            </div>
          </div>;
        })}
      </div>
      <div aria-live="polite" className="space-y-3 rounded-2xl border border-white/10 p-5 text-[#f7f1ea]">
        <p>Valor original: {formatCurrency(snapshot.investment?.totalPrice || 0)}</p>
        <p>Diferença dos materiais: {signed(simulation.difference)}</p>
        <p className="text-xl">Novo valor da proposta: {formatCurrency(simulation.total)}</p>
        <button type="button" disabled={disabled} onClick={onConfirm} className="rounded-xl bg-[#e1c6a4] px-4 py-3 text-sm text-[#3a2d22] disabled:opacity-50">Confirmar materiais escolhidos</button>
        <p className="text-xs text-[#d6c6b4]">A confirmação será registrada no aceite desta versão da proposta.</p>
      </div>
      <dialog ref={dialog} onCancel={() => setChosenMaterial('')} aria-labelledby="replace-material-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-auto rounded-2xl border border-white/15 bg-[#211a14] p-5 text-[#f7f1ea] shadow-xl backdrop:bg-black/70">
        <h3 id="replace-material-title" className="text-lg font-semibold">Substituir qual material do projeto?</h3>
        <p className="mt-3 text-sm">Material escolhido: {selectedMaterial?.material.name}</p>
        <fieldset className="my-5 space-y-3"><legend className="mb-3 text-sm text-[#d6c6b4]">Selecione o material que deseja substituir:</legend>
          {groups.map((group) => {
            const result = availability.get(group.id)?.get(chosenMaterial);
            return <label key={group.id} className="block rounded-xl border border-white/15 p-3 text-sm">
              <span className="flex items-center gap-3"><input type="radio" name="original-material" disabled={disabled || !result?.selections} checked={chosenGroup === group.id} onChange={() => setChosenGroup(group.id)} />{group.name}</span>
              <span className="mt-2 block text-xs text-[#d6c6b4]">Aplicado em {group.pieces.length} registros — {group.units} unidades.</span>
              {!result?.selections && <span className="mt-2 block text-xs text-[#e1c6a4]">{result?.error}</span>}
            </label>;
          })}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={() => setChosenMaterial('')} className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={disabled || !resolution?.selections} onClick={() => {onChange(applyMaterialGroup(snapshot, selections, chosenGroup, chosenMaterial)); setChosenMaterial(''); setPreferredGroup('');}} className="min-h-11 rounded-xl bg-[#e1c6a4] px-4 py-2 text-sm text-[#3a2d22] disabled:opacity-50">Aplicar material</button></div>
      </dialog>
    </div>
  </section>;
}
