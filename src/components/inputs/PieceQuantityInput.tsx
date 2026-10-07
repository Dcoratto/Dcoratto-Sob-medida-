import {useEffect, useState} from 'react';
import {getPieceQuantity, isValidPieceQuantity, MAX_PIECE_QUANTITY} from '../../lib/quotePieceQuantity';

export function PieceQuantityInput({quantity, onChange}: {quantity?: number; onChange: (quantity: number) => void}) {
  const effective = getPieceQuantity({quantity});
  const [text, setText] = useState(String(effective));
  useEffect(() => setText(String(effective)), [effective]);
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-900">Quantidade</div>
      <div className="inline-flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
        <button type="button" aria-label="Diminuir quantidade" disabled={effective <= 1} onClick={() => onChange(effective - 1)} className="h-11 w-11 text-lg disabled:opacity-30">-</button>
        <input aria-label="Quantidade de unidades" type="text" inputMode="numeric" value={text} onBlur={() => setText(String(effective))} onChange={(event) => {
          const raw = event.target.value;
          if (!raw) {setText(''); return;}
          if (!/^\d+$/.test(raw) || !isValidPieceQuantity(Number(raw))) return;
          setText(raw);
          onChange(Number(raw));
        }} className="h-11 w-20 border-x border-slate-200 text-center text-sm outline-none focus:bg-slate-50" />
        <button type="button" aria-label="Aumentar quantidade" disabled={effective >= MAX_PIECE_QUANTITY} onClick={() => onChange(effective + 1)} className="h-11 w-11 text-lg disabled:opacity-30">+</button>
      </div>
      <div className="text-xs text-slate-500">{effective} {effective === 1 ? 'unidade' : 'unidades'} idênticas. Medidas e preço manual são por unidade.</div>
    </div>
  );
}
