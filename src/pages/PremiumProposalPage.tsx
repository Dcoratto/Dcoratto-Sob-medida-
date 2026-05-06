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

const pieceArea = (piece: QuotePiece) =>
  Number(piece.totalArea || piece.manualArea || piece.area || 0);

const sideLabel = (type: string) => {
  const labels: Record<string, string> = {
    frontao: 'Frontão',
    saia: 'Saia',
    virada: 'Virada',
    acabamento: 'Acabamento',
  };
  return labels[type] || type;
};

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

  const quoteNumber = quote?.id ? `#${quote.id.slice(0, 8).toUpperCase()}` : '#--------';
  const totalPieces = quote?.pieces?.length || 0;
  const additionsArea = (quote?.pieces || []).reduce((sum, piece) => (
    sum + (piece.sides || []).reduce((sideSum, side) => sideSum + Number(side.areaTotal || side.area || 0), 0)
  ), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090807] text-white flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-[#D4A853]/20 border-t-[#D4A853] animate-spin" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-[#090807] text-white flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <FileText className="mx-auto mb-4 h-10 w-10 text-[#D4A853]" />
          <h1 className="text-2xl font-display font-bold">Proposta não encontrada</h1>
          <button
            type="button"
            onClick={() => navigate('/quotes')}
            className="mt-6 rounded-full bg-[#D4A853] px-5 py-3 text-sm font-bold text-black"
          >
            Voltar aos orçamentos
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#090807] text-white print:bg-white print:text-slate-950">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/45 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <button
            type="button"
            onClick={() => navigate('/quotes')}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition hover:text-[#D4A853]"
          >
            <ArrowLeft className="h-4 w-4" />
            Orçamentos
          </button>
          <div className="hidden items-center gap-6 md:flex">
            <a href="#materiais" className="text-xs font-bold uppercase tracking-widest text-white/45 hover:text-[#D4A853]">Materiais</a>
            <a href="#pecas" className="text-xs font-bold uppercase tracking-widest text-white/45 hover:text-[#D4A853]">Peças</a>
            <a href="#resumo" className="text-xs font-bold uppercase tracking-widest text-[#D4A853]">Resumo</a>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-[#D4A853] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black shadow-lg shadow-[#D4A853]/20"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      <section className="relative isolate min-h-screen overflow-hidden px-6 pt-28 print:min-h-0 print:pt-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(212,168,83,0.18),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_28%),linear-gradient(135deg,#050505,#15110d_45%,#050505)]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(115deg,transparent_0%,transparent_42%,rgba(212,168,83,0.18)_43%,transparent_44%,transparent_100%),linear-gradient(35deg,transparent_0%,transparent_62%,rgba(255,255,255,0.08)_63%,transparent_64%,transparent_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-[#090807]" />

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-7rem)] max-w-6xl flex-col items-center justify-center text-center print:min-h-0">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt={settings.companyName} className="mb-8 h-16 max-w-[220px] object-contain opacity-85" />
          ) : (
            <div className="mb-8 text-sm font-bold uppercase tracking-[0.4em] text-white/35">{settings.companyName || 'D’coratto Sob Medida'}</div>
          )}
          <div className="mb-5 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.42em] text-[#D4A853]">
            <Sparkles className="h-4 w-4" />
            Proposta exclusiva
          </div>
          <h1 className="max-w-5xl text-balance font-display text-5xl font-bold leading-none md:text-7xl">
            {safe(quote.clientName)}
          </h1>
          <div className="my-8 h-px w-28 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
          <p className="max-w-2xl text-lg leading-relaxed text-white/62">
            Uma apresentação premium do seu projeto com estética contemporânea, acabamento sofisticado e leitura clara de peças, medidas, materiais e investimento.
          </p>

          <div className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard label="Investimento total" value={formatCurrency(quote.totalPrice || 0)} highlight />
            <MetricCard label="Peças" value={String(totalPieces)} />
            <MetricCard label="Pedido" value={quoteNumber} />
          </div>
        </div>
      </section>

      <section id="materiais" className="relative px-6 py-24 print:py-10">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Seleção técnica" title="Materiais do projeto" />
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-[#D4A853]/20 bg-white/[0.04] p-8 backdrop-blur print:border-slate-200 print:bg-white">
              <div className="text-xs font-bold uppercase tracking-[0.28em] text-[#D4A853]">Pedra principal</div>
              <h3 className="mt-4 text-3xl font-display font-bold">{selectedMaterial?.name || quote.materialId || 'Material não informado'}</h3>
              <p className="mt-3 text-sm text-white/45 print:text-slate-500">
                {[selectedMaterial?.category, selectedMaterial?.provider].filter(Boolean).join(' · ') || 'Categoria e fornecedor não informados'}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 print:border-slate-200 print:bg-white">
              <div className="text-xs font-bold uppercase tracking-[0.28em] text-white/35 print:text-slate-400">Área total</div>
              <div className="mt-4 font-mono text-4xl font-bold text-[#D4A853]">{formatNumber(quote.totalArea || 0, 4)} m²</div>
              <p className="mt-3 text-sm text-white/45 print:text-slate-500">Área principal informada no orçamento.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 print:border-slate-200 print:bg-white">
              <div className="text-xs font-bold uppercase tracking-[0.28em] text-white/35 print:text-slate-400">Acabamentos</div>
              <div className="mt-4 font-mono text-4xl font-bold text-white print:text-slate-950">{formatNumber(additionsArea, 4)} m²</div>
              <p className="mt-3 text-sm text-white/45 print:text-slate-500">Frontão, saia, virada e adicionais aplicados nas peças.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="pecas" className="px-6 py-20 print:py-10">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Detalhamento" title="Peças e medidas" />
          <div className="space-y-10">
            {(quote.pieces || []).map((piece, index) => (
              <PieceSection key={piece.id} piece={piece} index={index} materialName={selectedMaterial?.name || 'Material'} />
            ))}
          </div>
        </div>
      </section>

      <section id="resumo" className="relative px-6 py-24 print:py-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#D4A853]/[0.04] to-transparent print:hidden" />
        <div className="relative mx-auto max-w-5xl">
          <SectionHeading eyebrow="Consolidação" title="Resumo do investimento" />
          <div className="overflow-hidden rounded-3xl border border-[#D4A853]/20 bg-white/[0.04] print:border-slate-200 print:bg-white">
            {(quote.pieces || []).map((piece, index) => (
              <div key={piece.id} className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-4 print:border-slate-100">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-[#D4A853]/50">{String(index + 1).padStart(2, '0')}</span>
                  <span className="font-semibold text-white/82 print:text-slate-800">{piece.name}</span>
                </div>
                <span className="font-mono text-sm text-white/60 print:text-slate-500">{formatNumber(pieceArea(piece), 4)} m²</span>
              </div>
            ))}
            <div className="grid gap-4 border-t border-[#D4A853]/25 bg-[#D4A853]/[0.06] p-6 md:grid-cols-3">
              <SummaryItem label="Recortes" value={`${cutoutCount(quote)} un`} />
              <SummaryItem label="Pagamento" value={safe(quote.paymentMethod)} />
              <SummaryItem label="Prazo" value={`${quote.deliveryDays || 0} dias úteis`} />
            </div>
            <div className="flex flex-col gap-2 border-t border-[#D4A853]/30 px-6 py-8 text-right md:flex-row md:items-end md:justify-between">
              <div className="text-left">
                <div className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A853]">Investimento total</div>
                <div className="mt-2 text-sm text-white/45 print:text-slate-500">Validade: {format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR})}</div>
              </div>
              <div className="font-mono text-4xl font-bold text-[#D4A853]">{formatCurrency(quote.totalPrice || 0)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 print:py-10">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/[0.035] p-8 print:border-slate-200 print:bg-white">
          <h2 className="mb-6 font-display text-2xl font-bold">Observações importantes</h2>
          <div className="space-y-4 text-sm leading-relaxed text-white/52 print:text-slate-600">
            <p><span className="mr-2 text-[#D4A853]">01.</span>Valores incluem material e mão de obra conforme peças discriminadas neste orçamento.</p>
            <p><span className="mr-2 text-[#D4A853]">02.</span>Cubas, eletros e torneiras não fazem parte deste orçamento, salvo quando descritos nas observações comerciais.</p>
            <p><span className="mr-2 text-[#D4A853]">03.</span>Furos, recortes e acabamentos especiais seguem as quantidades informadas no projeto.</p>
            <p><span className="mr-2 text-[#D4A853]">04.</span>Prazo de entrega: até {quote.deliveryDays || 0} dias úteis após confirmação do pedido e medição final.</p>
            <p><span className="mr-2 text-[#D4A853]">05.</span>Proposta válida até {format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR})}.</p>
            {quote.commercialNotes && <p><span className="mr-2 text-[#D4A853]">06.</span>{quote.commercialNotes}</p>}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-14 text-center print:border-slate-200">
        <div className="mx-auto max-w-4xl">
          <div className="font-display text-2xl font-bold text-white print:text-slate-950">{settings.companyName || 'D’coratto Sob Medida'}</div>
          <p className="mt-3 text-sm text-white/35 print:text-slate-500">
            {[settings.phone, settings.email, settings.address].filter(Boolean).join(' · ')}
          </p>
          <div className="mx-auto my-8 h-px w-20 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-white/20 print:text-slate-400">Proposta premium gerada pelo sistema D’coratto</p>
        </div>
      </footer>
    </main>
  );
};

const MetricCard = ({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) => (
  <div className={`rounded-2xl border p-6 backdrop-blur ${highlight ? 'border-[#D4A853]/45 bg-[#D4A853]/[0.05]' : 'border-white/10 bg-white/[0.035]'}`}>
    <div className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-white/38">{label}</div>
    <div className={`font-mono text-2xl font-bold ${highlight ? 'text-[#D4A853]' : 'text-white'}`}>{value}</div>
  </div>
);

const SectionHeading = ({eyebrow, title}: {eyebrow: string; title: string}) => (
  <div className="mb-12 text-center">
    <div className="mb-4 text-xs font-bold uppercase tracking-[0.35em] text-[#D4A853]">{eyebrow}</div>
    <h2 className="font-display text-4xl font-bold md:text-5xl">{title}</h2>
    <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
  </div>
);

const PieceSection = ({piece, index, materialName}: {key?: React.Key; piece: QuotePiece; index: number; materialName: string}) => {
  const additions = (piece.sides || []).filter((side) => side.type && side.type !== 'none');
  const cutouts = piece.cutouts || [];

  return (
    <article className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] print:border-slate-200 print:bg-white">
          <div className="aspect-[4/3] bg-[#14100c]">
            {piece.previewUrl ? (
              <img src={piece.previewUrl} alt={piece.name} className="h-full w-full object-contain p-4" />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm font-semibold text-white/28 print:text-slate-400">
                Desenho técnico não anexado
              </div>
            )}
          </div>
          <div className="border-t border-white/5 p-5 print:border-slate-100">
            <div className="text-xs font-bold uppercase tracking-[0.28em] text-[#D4A853]">Peça {String(index + 1).padStart(2, '0')}</div>
            <h3 className="mt-2 font-display text-2xl font-bold">{piece.name}</h3>
            <p className="mt-2 text-sm text-white/45 print:text-slate-500">{materialName}</p>
          </div>
        </div>
      </div>

      <div className="lg:col-span-8">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] print:border-slate-200 print:bg-white">
          <div className="grid grid-cols-12 gap-2 border-b border-white/5 bg-white/[0.025] px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 print:border-slate-100 print:text-slate-400">
            <span className="col-span-4">Descrição</span>
            <span className="col-span-2 text-center">Medidas</span>
            <span className="col-span-2 text-center">Área</span>
            <span className="col-span-2 text-right">Detalhe</span>
            <span className="col-span-2 text-right text-[#D4A853]">Status</span>
          </div>
          <Row description="Pedra principal" measure={`${piece.length || 0} x ${piece.width || 0} cm`} area={`${formatNumber(pieceArea(piece), 4)} m²`} detail={materialName} status="Incluído" />
          {piece.sculptedSink?.active && (
            <Row description={`Pia esculpida ${piece.sculptedSink.type}`} measure={`${piece.sculptedSink.width || 0} x ${piece.sculptedSink.depth || 0} ${piece.sculptedSink.unit}`} area={`${formatNumber(piece.sculptedSink.calculatedArea || 0, 4)} m²`} detail={`${piece.sculptedSink.quantity || 1} un`} status="Incluído" />
          )}
          {additions.map((side, sideIndex) => (
            <Row
              key={`${side.type}-${side.side}-${sideIndex}`}
              description={sideLabel(side.type)}
              measure={side.sideLabel || side.side}
              area={`${formatNumber(side.areaTotal || side.area || 0, 4)} m²`}
              detail={`${side.height || 0} cm · qtd ${side.quantity || 1}`}
              status="Incluído"
            />
          ))}
          {cutouts.map((cutout) => (
            <Row key={cutout.id} description={`Recorte ${cutout.type}`} measure={`${cutout.width || 0} x ${cutout.height || 0}`} area="-" detail="No desenho" status="Projeto" />
          ))}
          {piece.notes && (
            <div className="border-t border-white/5 px-5 py-4 text-sm text-white/52 print:border-slate-100 print:text-slate-600">
              <span className="font-bold text-[#D4A853]">Observação: </span>{piece.notes}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

const Row = ({description, measure, area, detail, status}: {key?: React.Key; description: string; measure: string; area: string; detail: string; status: string}) => (
  <div className="grid grid-cols-12 gap-2 border-b border-white/[0.035] px-5 py-3 text-sm transition hover:bg-white/[0.025] print:border-slate-100">
    <span className="col-span-4 font-semibold text-white/82 print:text-slate-800">{description}</span>
    <span className="col-span-2 text-center font-mono text-white/50 print:text-slate-500">{measure}</span>
    <span className="col-span-2 text-center font-mono text-white/50 print:text-slate-500">{area}</span>
    <span className="col-span-2 text-right text-white/42 print:text-slate-500">{detail}</span>
    <span className="col-span-2 text-right text-xs font-bold uppercase tracking-widest text-[#D4A853]">{status}</span>
  </div>
);

const SummaryItem = ({label, value}: {label: string; value: string}) => (
  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 print:border-slate-100 print:bg-slate-50">
    <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/32 print:text-slate-400">{label}</div>
    <div className="mt-2 font-mono text-lg font-bold text-white print:text-slate-950">{value}</div>
  </div>
);
