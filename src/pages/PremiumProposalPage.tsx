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
  frontao: 'FrontÃ£o',
  saia: 'Saia',
  virada: 'Virada',
  pe: 'Pé de bancada',
  guarnicao: 'Guarnição',
  acabamento: 'Acabamento',
}[type] || type);

const cutoutCount = (quote?: Quote) =>
  (quote?.cutouts?.cooktop || 0) +
  (quote?.cutouts?.sinkUnder || 0) +
  (quote?.cutouts?.sinkOver || 0) +
  (quote?.cutouts?.faucetHole || 0) +
  (quote?.cutouts?.trashBinCutout || 0) +
  (quote?.cutouts?.popUpTowerCutout || 0);

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
    const cards = new Map<string, {name: string; category: string; image?: string; area: number; pieces: string[]}>();
    if (selectedMaterial) {
      cards.set(selectedMaterial.id, {
        name: selectedMaterial.name,
        category: [selectedMaterial.category, selectedMaterial.provider].filter(Boolean).join(' Â· ') || 'Material principal',
        image: quote?.pieces?.find((piece) => pieceImage(piece)) ? pieceImage(quote.pieces.find((piece) => pieceImage(piece))!) : undefined,
        area: 0,
        pieces: [],
      });
    }
    (quote?.pieces || []).forEach((piece) => {
      const key = piece.materialId || selectedMaterial?.id || piece.id;
      const material = materials.find((item) => item.id === piece.materialId) || selectedMaterial;
      if (!cards.has(key)) {
        cards.set(key, {
          name: material?.name || piece.materialId || piece.name,
          category: material?.category || 'Material do ambiente',
          image: pieceImage(piece) || undefined,
          area: 0,
          pieces: [],
        });
      }
      const card = cards.get(key);
      if (card) {
        card.area += pieceArea(piece);
        card.pieces.push(piece.name);
        if (!card.image && pieceImage(piece)) card.image = pieceImage(piece);
      }
    });
    return Array.from(cards.values());
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
          <h1 className="text-2xl font-display font-bold">Proposta nÃ£o encontrada</h1>
          <button type="button" onClick={() => navigate('/quotes')} className="mt-6 rounded-full bg-[#D4A853] px-5 py-3 text-sm font-bold text-black">
            Voltar aos orÃ§amentos
          </button>
        </div>
      </div>
    );
  }

  const totalPieces = quote.pieces?.length || 0;
  const quoteNumber = quote.id ? `#${quote.id.slice(0, 8).toUpperCase()}` : '#--------';
  const halfValue = (quote.totalPrice || 0) / 10;
  const cashValue = (quote.totalPrice || 0) * 0.9;
  const totalAdditionsArea = (quote.pieces || []).reduce(
    (sum, piece) => sum + (piece.sides || []).reduce((sideSum, side) => sideSum + Number(side.areaTotal || side.area || 0), 0),
    0,
  );
  const navItems = [
    {label: 'Materiais', href: '#materiais'},
    ...(quote.pieces || []).slice(0, 5).map((piece, index) => ({label: piece.name || `Ambiente ${index + 1}`, href: `#ambiente-${index + 1}`})),
    {label: 'Resumo', href: '#resumo'},
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white print:bg-white print:text-slate-950">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/45 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <button type="button" onClick={() => navigate('/quotes')} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition hover:text-[#D4A853]">
            <ArrowLeft className="h-4 w-4" />
            OrÃ§amentos
          </button>
          <div className="hidden max-w-3xl items-center gap-5 overflow-x-auto md:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="whitespace-nowrap text-xs font-bold uppercase tracking-widest text-white/45 transition hover:text-[#D4A853]">
                {item.label}
              </a>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-[#D4A853] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black shadow-lg shadow-[#D4A853]/20">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      <Hero quote={quote} settings={settings} totalPieces={totalPieces} quoteNumber={quoteNumber} totalAdditionsArea={totalAdditionsArea} />

      <section id="manifesto" className="relative px-6 py-28 print:py-12">
        <SectionNumber value="00" />
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div>
            <Eyebrow>Manifesto de design</Eyebrow>
            <h2 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">
              Sonhos Ãºnicos merecem uma apresentaÃ§Ã£o <span className="italic text-[#D4A853]">memorÃ¡vel</span>
            </h2>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/52 print:text-slate-600">
              Esta proposta reÃºne as informaÃ§Ãµes tÃ©cnicas e comerciais do projeto com leitura clara, visual sofisticado e foco na percepÃ§Ã£o de valor do acabamento sob medida.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 print:border-slate-200 print:bg-white">
            <InfoRow label="Cliente" value={safe(quote.clientName)} />
            <InfoRow label="Telefone" value={safe(quote.phone)} />
            <InfoRow label="EndereÃ§o" value={safe(quote.address)} />
            <InfoRow label="Ambiente" value={safe(quote.environment)} />
            <InfoRow label="Status" value={safe(quote.status)} />
            <InfoRow label="ResponsÃ¡vel" value={safe(quote.responsibleUserName || quote.responsible)} />
            <InfoRow label="Validade" value={format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR})} />
            <InfoRow label="EmissÃ£o" value={format(toDate(quote.createdAt), 'dd/MM/yyyy', {locale: ptBR})} last />
          </div>
        </div>
      </section>

      <section id="materiais" className="px-6 py-24 print:py-12">
        <div className="mx-auto max-w-5xl">
          <SectionHeading eyebrow="SeleÃ§Ã£o de materiais" title="Materiais selecionados" />
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
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-4 print:border-slate-100">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/28 print:text-slate-400">Ãrea</div>
                      <div className="mt-1 font-mono text-sm font-bold text-[#D4A853]">{formatNumber(material.area, 4)} mÂ²</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/28 print:text-slate-400">Uso</div>
                      <div className="mt-1 text-xs font-semibold text-white/62 print:text-slate-600">{material.pieces.length} peÃ§a(s)</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {materialCards.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center text-sm font-semibold text-white/42 md:col-span-3">
                Nenhum material vinculado ao orÃ§amento.
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="ambientes" className="px-6 py-20 print:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="space-y-28">
            {(quote.pieces || []).map((piece, index) => (
              <PieceSection
                key={piece.id}
                piece={piece}
                index={index}
                materialName={materials.find((material) => material.id === piece.materialId)?.name || selectedMaterial?.name || 'Material'}
                reverse={index % 2 === 1}
                quoteCutouts={quote.cutouts}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="resumo" className="relative px-6 py-28 print:py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(212,168,83,0.16),transparent_24%),linear-gradient(to_bottom,transparent,rgba(212,168,83,0.04),transparent)] print:hidden" />
        <div className="relative mx-auto max-w-4xl">
          <SectionHeading eyebrow="ConsolidaÃ§Ã£o" title="Resumo do investimento" />
          <div className="overflow-hidden rounded-3xl border border-[#D4A853]/20 bg-black/35 backdrop-blur print:border-slate-200 print:bg-white">
            {(quote.pieces || []).map((piece, index) => (
              <div key={piece.id} className="flex items-center justify-between gap-4 border-b border-white/[0.04] px-6 py-4 print:border-slate-100">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-[#D4A853]/45">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-sm font-semibold text-white/78 print:text-slate-800">{piece.name}</span>
                </div>
                <span className="font-mono text-sm font-semibold text-white/70 print:text-slate-600">{formatNumber(pieceArea(piece), 4)} mÂ²</span>
              </div>
            ))}
            <div className="grid gap-4 border-t border-[#D4A853]/20 bg-[#D4A853]/[0.05] p-6 md:grid-cols-3">
              <SummaryItem label="Recortes" value={`${cutoutCount(quote)} un`} />
              <SummaryItem label="Pagamento" value={safe(quote.paymentMethod)} />
              <SummaryItem label="Prazo" value={`${quote.deliveryDays || 0} dias Ãºteis`} />
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
          <SectionHeading eyebrow="CondiÃ§Ãµes" title="CondiÃ§Ãµes de pagamento" />
          <div className="grid gap-6 md:grid-cols-2">
            <PaymentCard title="CartÃ£o de crÃ©dito" subtitle="Parcelamento facilitado" lines={[`Entrada: ${formatCurrency(halfValue)}`, `9 parcelas de: ${formatCurrency(halfValue)}`, `Total: ${formatCurrency(quote.totalPrice || 0)}`]} />
            <PaymentCard title="Pagamento Ã  vista" subtitle="Desconto especial" badge="10% OFF" lines={[`Desconto: - ${formatCurrency((quote.totalPrice || 0) * 0.1)}`, `Ã€ vista: ${formatCurrency(cashValue)}`]} highlight />
          </div>

          <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.035] p-8 print:border-slate-200 print:bg-white">
            <h3 className="mb-6 font-display text-xl font-bold">ObservaÃ§Ãµes importantes</h3>
            <div className="space-y-4 text-sm leading-relaxed text-white/52 print:text-slate-600">
              <p><span className="mr-2 text-[#D4A853]">01.</span>Valores incluem material e mÃ£o de obra conforme discriminado em cada ambiente.</p>
              <p><span className="mr-2 text-[#D4A853]">02.</span>Cubas, eletros e torneiras nÃ£o fazem parte deste orÃ§amento, salvo quando descritos nas observaÃ§Ãµes comerciais.</p>
              <p><span className="mr-2 text-[#D4A853]">03.</span>Furos, recortes e acabamentos especiais seguem as quantidades informadas no projeto.</p>
              <p><span className="mr-2 text-[#D4A853]">04.</span>Prazo de entrega: atÃ© {quote.deliveryDays || 0} dias Ãºteis apÃ³s confirmaÃ§Ã£o do pedido e mediÃ§Ã£o final.</p>
              <p><span className="mr-2 text-[#D4A853]">05.</span>Proposta vÃ¡lida atÃ© {format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR})}.</p>
              {quote.commercialNotes && <p><span className="mr-2 text-[#D4A853]">06.</span>{quote.commercialNotes}</p>}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-14 text-center print:border-slate-200">
        <div className="mx-auto max-w-4xl">
          <div className="font-display text-2xl font-bold">{settings.companyName || 'Dâ€™coratto Sob Medida'}</div>
          <p className="mt-3 text-sm text-white/35 print:text-slate-500">{[settings.phone, settings.email, settings.address].filter(Boolean).join(' Â· ')}</p>
          <div className="mx-auto my-8 h-px w-20 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-white/20 print:text-slate-400">Proposta premium gerada pelo sistema Dâ€™coratto</p>
        </div>
      </footer>
    </main>
  );
};

const Hero = ({quote, settings, totalPieces, quoteNumber, totalAdditionsArea}: {quote: Quote; settings: any; totalPieces: number; quoteNumber: string; totalAdditionsArea: number}) => (
  <section className="relative isolate min-h-screen overflow-hidden px-6 pt-28 print:min-h-0 print:pt-8">
    <div className="absolute inset-0 bg-[#050505]" />
    <div className="absolute inset-0 opacity-80 [background-image:radial-gradient(ellipse_at_20%_15%,rgba(255,255,255,0.15),transparent_24%),radial-gradient(ellipse_at_70%_20%,rgba(212,168,83,0.12),transparent_22%),linear-gradient(118deg,transparent_0%,transparent_18%,rgba(107,82,54,0.35)_19%,transparent_21%,transparent_43%,rgba(231,196,116,0.24)_44%,transparent_46%,transparent_72%,rgba(255,255,255,0.12)_73%,transparent_75%),linear-gradient(31deg,transparent_0%,transparent_35%,rgba(212,168,83,0.18)_36%,transparent_38%,transparent_100%)]" />
    <div className="absolute inset-0 [background-image:linear-gradient(135deg,rgba(255,255,255,0.05)_0_1px,transparent_1px_18px),radial-gradient(circle_at_45%_38%,rgba(0,0,0,0),rgba(0,0,0,0.78)_56%,#050505_100%)]" />
    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/30 to-[#050505]" />
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-7rem)] max-w-6xl flex-col items-center justify-center text-center print:min-h-0">
      {settings.logoUrl || '/logo.png' ? (
        <img src={settings.logoUrl || '/logo.png'} alt={settings.companyName} className="mb-8 h-16 max-w-[220px] object-contain opacity-85" />
      ) : (
        <div className="mb-8 text-sm font-bold uppercase tracking-[0.4em] text-white/35">{settings.companyName || 'Dâ€™coratto Sob Medida'}</div>
      )}
      <div className="mb-5 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.42em] text-[#D4A853]">
        <Sparkles className="h-4 w-4" />
        Proposta exclusiva Â· Marmoraria
      </div>
      <h1 className="max-w-5xl text-balance font-display text-5xl font-bold leading-none md:text-7xl">
        {safe(quote.clientName)}
      </h1>
      <div className="my-8 h-px w-28 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
      <p className="max-w-2xl text-lg leading-relaxed text-white/62">
        Uma apresentaÃ§Ã£o premium do seu projeto com estÃ©tica contemporÃ¢nea, acabamento sofisticado e experiÃªncia visual pensada para traduzir exclusividade, conforto e valor percebido.
      </p>
      <div className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Investimento total" value={formatCurrency(quote.totalPrice || 0)} highlight />
        <MetricCard label="Ambientes" value={String(totalPieces)} />
        <MetricCard label="Pedido" value={quoteNumber} />
      </div>
      <div className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
        <MiniMetric label="Ãrea principal" value={`${formatNumber(quote.totalArea || 0, 4)} mÂ²`} />
        <MiniMetric label="Adicionais" value={`${formatNumber(totalAdditionsArea, 4)} mÂ²`} />
        <MiniMetric label="Prazo" value={`${quote.deliveryDays || 0} dias Ãºteis`} />
      </div>
    </div>
  </section>
);

const PieceSection = ({piece, index, materialName, reverse, quoteCutouts}: {key?: React.Key; piece: QuotePiece; index: number; materialName: string; reverse: boolean; quoteCutouts: Quote['cutouts']}) => {
  const additions = (piece.sides || []).filter((side) => side.type && side.type !== 'none');
  const projectCutouts = [
    {label: 'Cooktop', count: quoteCutouts?.cooktop || 0},
    {label: 'Cuba embutida', count: quoteCutouts?.sinkUnder || 0},
    {label: 'Cuba sobreposta', count: quoteCutouts?.sinkOver || 0},
    {label: 'FuraÃ§Ã£o torneira', count: quoteCutouts?.faucetHole || 0},
    {label: 'Lixeira de embutir', count: quoteCutouts?.trashBinCutout || 0},
    {label: 'Torre de tomada', count: quoteCutouts?.popUpTowerCutout || 0},
  ].filter((item) => item.count > 0);
  const rows = [
    {description: 'Pedra principal', measure: `${piece.length || 0} x ${piece.width || 0} cm`, area: `${formatNumber(pieceArea(piece), 4)} mÂ²`, material: materialName, subtotal: 'IncluÃ­do'},
    ...(piece.sculptedSink?.active ? [{
      description: `Pia esculpida ${piece.sculptedSink.type}`,
      measure: `${piece.sculptedSink.width || 0} x ${piece.sculptedSink.depth || 0} ${piece.sculptedSink.unit}`,
      area: `${formatNumber(piece.sculptedSink.calculatedArea || 0, 4)} mÂ²`,
      material: `${piece.sculptedSink.quantity || 1} un`,
      subtotal: 'IncluÃ­do',
    }] : []),
    ...additions.map((side) => ({
      description: sideLabel(side.type),
      measure: side.sideLabel || side.side,
      area: `${formatNumber(side.areaTotal || side.area || 0, 4)} mÂ²`,
      material: `${side.height || 0} cm Â· qtd ${side.quantity || 1}`,
      subtotal: 'IncluÃ­do',
    })),
    ...(piece.cutouts || []).map((cutout) => ({
      description: `Recorte ${cutout.type}`,
      measure: `${cutout.width || 0} x ${cutout.height || 0}`,
      area: '-',
      material: 'No desenho',
      subtotal: 'Projeto',
    })),
    ...(!piece.cutouts?.length && index === 0 ? projectCutouts.map((cutout) => ({
      description: cutout.label,
      measure: `${cutout.count} un`,
      area: '-',
      material: 'Recorte especial',
      subtotal: 'Projeto',
    })) : []),
  ];

  return (
    <article id={`ambiente-${index + 1}`} className="relative scroll-mt-24">
      <SectionNumber value={String(index + 1).padStart(2, '0')} />
      <Eyebrow>Ambiente {String(index + 1).padStart(2, '0')}</Eyebrow>
      <h2 className="mb-2 mt-3 font-display text-3xl font-bold md:text-4xl">{piece.name}</h2>
      <p className="mb-8 text-xs text-white/35 print:text-slate-500">
        Material: {materialName} Â· Ãrea: {formatNumber(pieceArea(piece), 4)} mÂ²
      </p>
      <div className={`grid gap-8 lg:grid-cols-12 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] print:border-slate-200 print:bg-white">
            <div className="aspect-[4/3] bg-[#15110c]">
              {pieceImage(piece) ? (
                <img src={pieceImage(piece)} alt={piece.name} className="h-full w-full object-contain bg-white" />
              ) : (
                <div className="flex h-full items-center justify-center text-center text-xs font-bold uppercase tracking-widest text-white/28 print:text-slate-400">
                  Adicione uma imagem no orÃ§amento
                </div>
              )}
            </div>
          </div>
          <FixtureSummary piece={piece} />
        </div>
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35 print:border-slate-200 print:bg-white">
            <div className="grid grid-cols-12 gap-2 border-b border-white/5 bg-white/[0.025] px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 print:border-slate-100 print:text-slate-400">
              <span className="col-span-4">DescriÃ§Ã£o</span>
              <span className="col-span-2 text-center">Medidas</span>
              <span className="col-span-2 text-center">Ãrea</span>
              <span className="col-span-2 text-right">Material</span>
              <span className="col-span-2 text-right text-[#D4A853]">Status</span>
            </div>
            {rows.map((row, rowIndex) => <TableRow key={`${row.description}-${rowIndex}`} {...row} />)}
            <div className="flex justify-between border-t border-[#D4A853]/20 bg-[#D4A853]/[0.05] px-4 py-4">
              <span className="text-sm font-semibold text-[#D4A853]">Total {piece.name}</span>
              <span className="font-mono text-sm font-bold text-[#D4A853]">{formatNumber(pieceArea(piece), 4)} mÂ²</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

const FixtureSummary = ({piece}: {piece: QuotePiece}) => {
  const fixtureLabels = {
    sink: 'Cuba',
    faucet: 'Torneira',
    cooktop: 'Cooktop',
    trashBin: 'Lixeira de embutir',
    popUpTower: 'Torre de tomada',
  };
  const fixtures = Object.entries(piece.purchasedFixtures || {})
    .filter(([, fixture]) => fixture && Object.values(fixture).some(Boolean));

  if (!fixtures.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4 print:border-slate-200 print:bg-white">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#D4A853]">Itens comprados pelo cliente</div>
      <div className="space-y-3">
        {fixtures.map(([key, fixture]) => (
          <div key={key} className="rounded-lg bg-black/20 p-3 text-xs print:bg-slate-50">
            <div className="font-bold text-white/85 print:text-slate-800">{fixtureLabels[key as keyof typeof fixtureLabels]}</div>
            <div className="mt-1 text-white/45 print:text-slate-500">
              {[fixture.brand, fixture.model].filter(Boolean).join(' Â· ') || 'Modelo nÃ£o informado'}
            </div>
            <div className="mt-1 font-mono text-white/40 print:text-slate-500">
              {[
                fixture.width ? `L ${fixture.width}` : '',
                fixture.depth ? `P ${fixture.depth}` : '',
                fixture.height ? `A ${fixture.height}` : '',
                fixture.diameter ? `Ã˜ ${fixture.diameter}` : '',
              ].filter(Boolean).join(' Â· ') || 'Medidas pendentes'}
            </div>
          </div>
        ))}
      </div>
    </div>
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

const MiniMetric = ({label, value}: {label: string; value: string}) => (
  <div className="rounded-xl border border-white/10 bg-black/20 px-5 py-4 backdrop-blur">
    <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/30">{label}</div>
    <div className="mt-2 font-mono text-sm font-bold text-white/78">{value}</div>
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

