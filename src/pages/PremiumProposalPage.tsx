import React, {useEffect, useMemo, useState} from 'react';
import {collection, doc, getDoc, onSnapshot} from 'firebase/firestore';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {ArrowLeft, FileText, Printer, Sparkles} from 'lucide-react';
import {useNavigate, useParams} from 'react-router-dom';
import {db} from '../lib/firebase';
import {useSettings} from '../hooks/useSettings';
import {Material, Quote, QuotePiece} from '../types';
import {formatCurrency, formatNumber} from '../lib/utils';

const toDate = (value: any) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date();
};

const safe = (value?: string) => value?.trim() || '-';
const pieceArea = (piece: QuotePiece) => Number(piece.totalArea || piece.manualArea || piece.area || 0);
const pieceImage = (piece: QuotePiece) => piece.proposalImageUrl?.trim() || piece.previewUrl || '';

const sideLabel = (type: string) => ({
  frontao: 'Frontão',
  saia: 'Saia',
  virada: 'Virada',
  acabamento: 'Acabamento',
}[type] || type);

const cutoutCount = (quote?: Quote) =>
  (quote?.cutouts?.cooktop || 0) +
  (quote?.cutouts?.sinkUnder || 0) +
  (quote?.cutouts?.sinkOver || 0) +
  (quote?.cutouts?.faucetHole || 0);

export const PremiumProposalPage: React.FC = () => {
  const {id} = useParams();
  const navigate = useNavigate();
  const {settings} = useSettings();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material)));
    });

    const loadQuote = async () => {
      if (!id) return;
      const snapshot = await getDoc(doc(db, 'quotes', id));
      if (snapshot.exists()) setQuote({id: snapshot.id, ...snapshot.data()} as Quote);
      setLoading(false);
    };

    loadQuote();
    return unsubscribeMaterials;
  }, [id]);

  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === quote?.materialId),
    [materials, quote?.materialId],
  );

  const materialCards = useMemo(() => {
    const cards = new Map<string, {name: string; category: string; image?: string}>();
    if (selectedMaterial) {
      cards.set(selectedMaterial.id, {
        name: selectedMaterial.name,
        category: [selectedMaterial.category, selectedMaterial.provider].filter(Boolean).join(' · ') || 'Material principal',
        image: quote?.pieces?.find((piece) => pieceImage(piece)) ? pieceImage(quote.pieces.find((piece) => pieceImage(piece))!) : undefined,
      });
    }
    (quote?.pieces || []).forEach((piece) => {
      if (!cards.has(piece.materialId)) {
        const material = materials.find((item) => item.id === piece.materialId);
        cards.set(piece.materialId || piece.id, {
          name: material?.name || piece.materialId || piece.name,
          category: material?.category || 'Material do ambiente',
          image: pieceImage(piece) || undefined,
        });
      }
    });
    return Array.from(cards.values()).slice(0, 3);
  }, [materials, quote?.pieces, selectedMaterial]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#D4A853]/20 border-t-[#D4A853]" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] p-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <FileText className="mx-auto mb-4 h-10 w-10 text-[#D4A853]" />
          <h1 className="text-2xl font-display font-bold">Proposta não encontrada</h1>
          <button type="button" onClick={() => navigate('/quotes')} className="mt-6 rounded-full bg-[#D4A853] px-5 py-3 text-sm font-bold text-black">
            Voltar aos orçamentos
          </button>
        </div>
      </div>
    );
  }

  const totalPieces = quote.pieces?.length || 0;
  const quoteNumber = quote.id ? `#${quote.id.slice(0, 8).toUpperCase()}` : '#--------';
  const halfValue = (quote.totalPrice || 0) / 10;
  const cashValue = (quote.totalPrice || 0) * 0.9;

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white print:bg-white print:text-slate-950">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/45 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <button type="button" onClick={() => navigate('/quotes')} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition hover:text-[#D4A853]">
            <ArrowLeft className="h-4 w-4" />
            Orçamentos
          </button>
          <div className="hidden items-center gap-6 md:flex">
            <a href="#manifesto" className="text-xs font-bold uppercase tracking-widest text-white/45 hover:text-[#D4A853]">Manifesto</a>
            <a href="#materiais" className="text-xs font-bold uppercase tracking-widest text-white/45 hover:text-[#D4A853]">Materiais</a>
            <a href="#pecas" className="text-xs font-bold uppercase tracking-widest text-white/45 hover:text-[#D4A853]">Ambientes</a>
            <a href="#resumo" className="text-xs font-bold uppercase tracking-widest text-[#D4A853]">Resumo</a>
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-[#D4A853] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black shadow-lg shadow-[#D4A853]/20">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      <Hero quote={quote} settings={settings} totalPieces={totalPieces} quoteNumber={quoteNumber} />

      <section id="manifesto" className="relative px-6 py-28 print:py-12">
        <SectionNumber value="00" />
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div>
            <Eyebrow>Manifesto de design</Eyebrow>
            <h2 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">
              Sonhos únicos merecem uma apresentação <span className="italic text-[#D4A853]">memorável</span>
            </h2>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/52 print:text-slate-600">
              Esta proposta reúne as informações técnicas e comerciais do projeto com leitura clara, visual sofisticado e foco na percepção de valor do acabamento sob medida.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 print:border-slate-200 print:bg-white">
            <InfoRow label="Cliente" value={safe(quote.clientName)} />
            <InfoRow label="Ambiente" value={safe(quote.environment)} />
            <InfoRow label="Status" value={safe(quote.status)} />
            <InfoRow label="Responsável" value={safe(quote.responsible)} />
            <InfoRow label="Validade" value={format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR})} />
            <InfoRow label="Emissão" value={format(toDate(quote.createdAt), 'dd/MM/yyyy', {locale: ptBR})} last />
          </div>
        </div>
      </section>

      <section id="materiais" className="px-6 py-24 print:py-12">
        <div className="mx-auto max-w-5xl">
          <SectionHeading eyebrow="Seleção de materiais" title="Materiais selecionados" />
          <div className="grid gap-5 md:grid-cols-3">
            {materialCards.map((material, index) => (
              <div key={`${material.name}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] print:border-slate-200 print:bg-white">
                <div className="aspect-[4/3] bg-[#15110c]">
                  {material.image ? (
                    <img src={material.image} alt={material.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#e7e2d7,#9d9a93)] text-xs font-bold uppercase tracking-widest text-black/30">
                      Material
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-bold">{material.name}</h3>
                  <p className="mt-2 text-xs text-white/40 print:text-slate-500">{material.category}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pecas" className="px-6 py-20 print:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="space-y-28">
            {(quote.pieces || []).map((piece, index) => (
              <PieceSection
                key={piece.id}
                piece={piece}
                index={index}
                materialName={materials.find((material) => material.id === piece.materialId)?.name || selectedMaterial?.name || 'Material'}
                reverse={index % 2 === 1}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="resumo" className="relative px-6 py-28 print:py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(212,168,83,0.16),transparent_24%),linear-gradient(to_bottom,transparent,rgba(212,168,83,0.04),transparent)] print:hidden" />
        <div className="relative mx-auto max-w-4xl">
          <SectionHeading eyebrow="Consolidação" title="Resumo do investimento" />
          <div className="overflow-hidden rounded-3xl border border-[#D4A853]/20 bg-black/35 backdrop-blur print:border-slate-200 print:bg-white">
            {(quote.pieces || []).map((piece, index) => (
              <div key={piece.id} className="flex items-center justify-between gap-4 border-b border-white/[0.04] px-6 py-4 print:border-slate-100">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-[#D4A853]/45">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-sm font-semibold text-white/78 print:text-slate-800">{piece.name}</span>
                </div>
                <span className="font-mono text-sm font-semibold text-white/70 print:text-slate-600">{formatNumber(pieceArea(piece), 4)} m²</span>
              </div>
            ))}
            <div className="grid gap-4 border-t border-[#D4A853]/20 bg-[#D4A853]/[0.05] p-6 md:grid-cols-3">
              <SummaryItem label="Recortes" value={`${cutoutCount(quote)} un`} />
              <SummaryItem label="Pagamento" value={safe(quote.paymentMethod)} />
              <SummaryItem label="Prazo" value={`${quote.deliveryDays || 0} dias úteis`} />
            </div>
            <div className="flex items-end justify-between border-t border-[#D4A853]/30 px-6 py-6">
              <span className="font-display text-xl font-bold text-[#D4A853]">Investimento total</span>
              <span className="font-mono text-3xl font-bold text-[#D4A853]">{formatCurrency(quote.totalPrice || 0)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-28 print:pb-12">
        <div className="mx-auto max-w-4xl">
          <SectionHeading eyebrow="Condições" title="Condições de pagamento" />
          <div className="grid gap-6 md:grid-cols-2">
            <PaymentCard title="Cartão de crédito" subtitle="Parcelamento facilitado" lines={[`Entrada: ${formatCurrency(halfValue)}`, `9 parcelas de: ${formatCurrency(halfValue)}`, `Total: ${formatCurrency(quote.totalPrice || 0)}`]} />
            <PaymentCard title="Pagamento à vista" subtitle="Desconto especial" badge="10% OFF" lines={[`Desconto: - ${formatCurrency((quote.totalPrice || 0) * 0.1)}`, `À vista: ${formatCurrency(cashValue)}`]} highlight />
          </div>

          <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.035] p-8 print:border-slate-200 print:bg-white">
            <h3 className="mb-6 font-display text-xl font-bold">Observações importantes</h3>
            <div className="space-y-4 text-sm leading-relaxed text-white/52 print:text-slate-600">
              <p><span className="mr-2 text-[#D4A853]">01.</span>Valores incluem material e mão de obra conforme discriminado em cada ambiente.</p>
              <p><span className="mr-2 text-[#D4A853]">02.</span>Cubas, eletros e torneiras não fazem parte deste orçamento, salvo quando descritos nas observações comerciais.</p>
              <p><span className="mr-2 text-[#D4A853]">03.</span>Furos, recortes e acabamentos especiais seguem as quantidades informadas no projeto.</p>
              <p><span className="mr-2 text-[#D4A853]">04.</span>Prazo de entrega: até {quote.deliveryDays || 0} dias úteis após confirmação do pedido e medição final.</p>
              <p><span className="mr-2 text-[#D4A853]">05.</span>Proposta válida até {format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR})}.</p>
              {quote.commercialNotes && <p><span className="mr-2 text-[#D4A853]">06.</span>{quote.commercialNotes}</p>}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-14 text-center print:border-slate-200">
        <div className="mx-auto max-w-4xl">
          <div className="font-display text-2xl font-bold">{settings.companyName || 'D’coratto Sob Medida'}</div>
          <p className="mt-3 text-sm text-white/35 print:text-slate-500">{[settings.phone, settings.email, settings.address].filter(Boolean).join(' · ')}</p>
          <div className="mx-auto my-8 h-px w-20 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-white/20 print:text-slate-400">Proposta premium gerada pelo sistema D’coratto</p>
        </div>
      </footer>
    </main>
  );
};

const Hero = ({quote, settings, totalPieces, quoteNumber}: {quote: Quote; settings: any; totalPieces: number; quoteNumber: string}) => (
  <section className="relative isolate min-h-screen overflow-hidden px-6 pt-28 print:min-h-0 print:pt-8">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(212,168,83,0.18),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_28%),linear-gradient(135deg,#050505,#16110d_48%,#030303)]" />
    <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(115deg,transparent_0%,transparent_42%,rgba(212,168,83,0.16)_43%,transparent_44%,transparent_100%),linear-gradient(35deg,transparent_0%,transparent_62%,rgba(255,255,255,0.08)_63%,transparent_64%,transparent_100%)]" />
    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-[#050505]" />
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-7rem)] max-w-6xl flex-col items-center justify-center text-center print:min-h-0">
      {settings.logoUrl ? (
        <img src={settings.logoUrl} alt={settings.companyName} className="mb-8 h-16 max-w-[220px] object-contain opacity-85" />
      ) : (
        <div className="mb-8 text-sm font-bold uppercase tracking-[0.4em] text-white/35">{settings.companyName || 'D’coratto Sob Medida'}</div>
      )}
      <div className="mb-5 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.42em] text-[#D4A853]">
        <Sparkles className="h-4 w-4" />
        Proposta exclusiva · Marmoraria
      </div>
      <h1 className="max-w-5xl text-balance font-display text-5xl font-bold leading-none md:text-7xl">
        {safe(quote.clientName)}
      </h1>
      <div className="my-8 h-px w-28 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
      <p className="max-w-2xl text-lg leading-relaxed text-white/62">
        Uma apresentação premium do seu projeto com estética contemporânea, acabamento sofisticado e experiência visual pensada para traduzir exclusividade, conforto e valor percebido.
      </p>
      <div className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Investimento total" value={formatCurrency(quote.totalPrice || 0)} highlight />
        <MetricCard label="Ambientes" value={String(totalPieces)} />
        <MetricCard label="Pedido" value={quoteNumber} />
      </div>
    </div>
  </section>
);

const PieceSection = ({piece, index, materialName, reverse}: {key?: React.Key; piece: QuotePiece; index: number; materialName: string; reverse: boolean}) => {
  const additions = (piece.sides || []).filter((side) => side.type && side.type !== 'none');
  const rows = [
    {description: 'Pedra principal', measure: `${piece.length || 0} x ${piece.width || 0} cm`, area: `${formatNumber(pieceArea(piece), 4)} m²`, material: materialName, subtotal: 'Incluído'},
    ...(piece.sculptedSink?.active ? [{
      description: `Pia esculpida ${piece.sculptedSink.type}`,
      measure: `${piece.sculptedSink.width || 0} x ${piece.sculptedSink.depth || 0} ${piece.sculptedSink.unit}`,
      area: `${formatNumber(piece.sculptedSink.calculatedArea || 0, 4)} m²`,
      material: `${piece.sculptedSink.quantity || 1} un`,
      subtotal: 'Incluído',
    }] : []),
    ...additions.map((side) => ({
      description: sideLabel(side.type),
      measure: side.sideLabel || side.side,
      area: `${formatNumber(side.areaTotal || side.area || 0, 4)} m²`,
      material: `${side.height || 0} cm · qtd ${side.quantity || 1}`,
      subtotal: 'Incluído',
    })),
    ...(piece.cutouts || []).map((cutout) => ({
      description: `Recorte ${cutout.type}`,
      measure: `${cutout.width || 0} x ${cutout.height || 0}`,
      area: '-',
      material: 'No desenho',
      subtotal: 'Projeto',
    })),
  ];

  return (
    <article className="relative">
      <SectionNumber value={String(index + 1).padStart(2, '0')} />
      <Eyebrow>Ambiente {String(index + 1).padStart(2, '0')}</Eyebrow>
      <h2 className="mb-2 mt-3 font-display text-3xl font-bold md:text-4xl">{piece.name}</h2>
      <p className="mb-8 text-xs text-white/35 print:text-slate-500">
        Material: {materialName} · Área: {formatNumber(pieceArea(piece), 4)} m²
      </p>
      <div className={`grid gap-8 lg:grid-cols-12 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] print:border-slate-200 print:bg-white">
            <div className="aspect-[4/3] bg-[#15110c]">
              {pieceImage(piece) ? (
                <img src={pieceImage(piece)} alt={piece.name} className="h-full w-full object-contain bg-white" />
              ) : (
                <div className="flex h-full items-center justify-center text-center text-xs font-bold uppercase tracking-widest text-white/28 print:text-slate-400">
                  Adicione uma imagem no orçamento
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35 print:border-slate-200 print:bg-white">
            <div className="grid grid-cols-12 gap-2 border-b border-white/5 bg-white/[0.025] px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 print:border-slate-100 print:text-slate-400">
              <span className="col-span-4">Descrição</span>
              <span className="col-span-2 text-center">Medidas</span>
              <span className="col-span-2 text-center">Área</span>
              <span className="col-span-2 text-right">Material</span>
              <span className="col-span-2 text-right text-[#D4A853]">Status</span>
            </div>
            {rows.map((row, rowIndex) => <TableRow key={`${row.description}-${rowIndex}`} {...row} />)}
            <div className="flex justify-between border-t border-[#D4A853]/20 bg-[#D4A853]/[0.05] px-4 py-4">
              <span className="text-sm font-semibold text-[#D4A853]">Total {piece.name}</span>
              <span className="font-mono text-sm font-bold text-[#D4A853]">{formatNumber(pieceArea(piece), 4)} m²</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

const TableRow = ({description, measure, area, material, subtotal}: {key?: React.Key; description: string; measure: string; area: string; material: string; subtotal: string}) => (
  <div className="grid grid-cols-12 gap-2 border-b border-white/[0.035] px-4 py-3 text-xs transition hover:bg-white/[0.025] print:border-slate-100">
    <span className="col-span-4 font-semibold text-white/82 print:text-slate-800">{description}</span>
    <span className="col-span-2 text-center font-mono text-white/50 print:text-slate-500">{measure}</span>
    <span className="col-span-2 text-center font-mono text-white/50 print:text-slate-500">{area}</span>
    <span className="col-span-2 text-right text-white/42 print:text-slate-500">{material}</span>
    <span className="col-span-2 text-right font-mono font-bold text-white/80 print:text-slate-700">{subtotal}</span>
  </div>
);

const MetricCard = ({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) => (
  <div className={`rounded-xl border p-6 backdrop-blur ${highlight ? 'border-[#D4A853]/45 bg-[#D4A853]/[0.05]' : 'border-white/10 bg-white/[0.035]'}`}>
    <div className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-white/38">{label}</div>
    <div className={`font-mono text-2xl font-bold ${highlight ? 'text-[#D4A853]' : 'text-white'}`}>{value}</div>
  </div>
);

const SectionHeading = ({eyebrow, title}: {eyebrow: string; title: string}) => (
  <div className="mb-12 text-center">
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">{title}</h2>
    <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
  </div>
);

const Eyebrow = ({children}: {children: React.ReactNode}) => (
  <div className="text-xs font-bold uppercase tracking-[0.35em] text-[#D4A853]">{children}</div>
);

const SectionNumber = ({value}: {value: string}) => (
  <div className="pointer-events-none absolute left-4 top-8 font-display text-8xl font-bold text-white/[0.025] print:hidden md:left-10 md:text-9xl">{value}</div>
);

const InfoRow = ({label, value, last = false}: {label: string; value: string; last?: boolean}) => (
  <div className={`flex items-center justify-between gap-6 py-3 text-sm ${last ? '' : 'border-b border-white/[0.05] print:border-slate-100'}`}>
    <span className="text-white/35 print:text-slate-400">{label}</span>
    <span className="text-right font-semibold text-white/82 print:text-slate-800">{value}</span>
  </div>
);

const SummaryItem = ({label, value}: {label: string; value: string}) => (
  <div className="rounded-xl border border-white/10 bg-black/10 p-4 print:border-slate-100 print:bg-slate-50">
    <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/32 print:text-slate-400">{label}</div>
    <div className="mt-2 font-mono text-lg font-bold text-white print:text-slate-950">{value}</div>
  </div>
);

const PaymentCard = ({title, subtitle, lines, badge, highlight = false}: {title: string; subtitle: string; lines: string[]; badge?: string; highlight?: boolean}) => (
  <div className={`relative rounded-2xl border p-8 text-center ${highlight ? 'border-[#D4A853]/30 bg-[#D4A853]/[0.045]' : 'border-white/10 bg-white/[0.035]'} print:border-slate-200 print:bg-white`}>
    {badge && <div className="absolute right-4 top-4 rounded-full bg-[#D4A853] px-3 py-1 text-[10px] font-bold text-black">{badge}</div>}
    <h3 className="font-display text-xl font-bold">{title}</h3>
    <p className="mt-2 text-sm text-white/42 print:text-slate-500">{subtitle}</p>
    <div className="mt-6 space-y-3">
      {lines.map((line) => (
        <div key={line} className="rounded-xl bg-white/[0.045] px-4 py-3 font-mono text-sm font-semibold text-white/80 print:bg-slate-50 print:text-slate-800">
          {line}
        </div>
      ))}
    </div>
  </div>
);
