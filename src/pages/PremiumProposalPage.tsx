import React, {useEffect, useMemo, useState} from 'react';
import {collection, doc, getDoc, onSnapshot} from '../lib/firestore';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {ArrowLeft, Expand, FileText, Printer, Sparkles, X} from 'lucide-react';
import {useNavigate, useParams} from 'react-router-dom';
import {db} from '../lib/firebase';
import {useSettings} from '../hooks/useSettings';
import {convertImageUrlToWebp} from '../lib/imageUtils';
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
const materialImage = (material?: Material | null) => material?.imageUrl?.trim() || '';
const sectionIdForPiece = (index: number) => `ambiente-${index + 1}`;

const sideLabel = (type: string) => ({
  frontao: 'Frontão',
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
  (quote?.cutouts?.popUpTowerCutout || 0) +
  (quote?.cutouts?.wetAreaAmericanRecess || 0) +
  (quote?.cutouts?.wetAreaItalianRecess || 0);

type MaterialCardData = {
  name: string;
  category: string;
  image?: string;
  area: number;
  pieces: string[];
};

type LightboxState = {src: string; alt: string} | null;

export const PremiumProposalPage: React.FC = () => {
  const {id} = useParams();
  const navigate = useNavigate();
  const {settings} = useSettings();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('materiais');
  const [lightbox, setLightbox] = useState<LightboxState>(null);

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
    const cards = new Map<string, MaterialCardData>();
    if (selectedMaterial) {
      cards.set(selectedMaterial.id, {
        name: selectedMaterial.name,
        category: [selectedMaterial.category, selectedMaterial.provider].filter(Boolean).join(' · ') || 'Material principal',
        image: materialImage(selectedMaterial) || (quote?.pieces?.find((piece) => pieceImage(piece)) ?pieceImage(quote.pieces.find((piece) => pieceImage(piece))!) : undefined),
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
          category: [material?.category, material?.provider].filter(Boolean).join(' · ') || 'Material do ambiente',
          image: materialImage(material) || pieceImage(piece) || undefined,
          area: 0,
          pieces: [],
        });
      }
      const card = cards.get(key);
      if (card) {
        card.area += pieceArea(piece);
        card.pieces.push(piece.name);
        if (!card.image && (materialImage(material) || pieceImage(piece))) {
          card.image = materialImage(material) || pieceImage(piece) || undefined;
        }
      }
    });

    return Array.from(cards.values());
  }, [materials, quote?.pieces, selectedMaterial]);

  const navItems = useMemo(
    () => [
      ...(materialCards.length ?[{label: 'Materiais', sectionId: 'materiais'}] : []),
      ...(quote?.pieces || []).map((piece, index) => ({
        label: piece.name || `Ambiente ${index + 1}`,
        sectionId: sectionIdForPiece(index),
      })),
      {label: 'Resumo', sectionId: 'resumo'},
      {label: 'Pagamento', sectionId: 'pagamento'},
    ],
    [materialCards.length, quote?.pieces],
  );

  useEffect(() => {
    if (!navItems.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visibleEntry?.target?.id) {
          setActiveSection(visibleEntry.target.id);
        }
      },
      {
        rootMargin: '-22% 0px -58% 0px',
        threshold: [0.2, 0.45, 0.7],
      },
    );

    navItems.forEach((item) => {
      const element = document.getElementById(item.sectionId);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [navItems]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({top, behavior: 'smooth'});
  };

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
  const quoteNumber = quote.id ?`#${quote.id.slice(0, 8).toUpperCase()}` : '#--------';
  const installmentValue = (quote.totalPrice || 0) / 10;
  const cashValue = (quote.totalPrice || 0) * 0.9;
  const totalAdditionsArea = (quote.pieces || []).reduce(
    (sum, piece) => sum + (piece.sides || []).reduce((sideSum, side) => sideSum + Number(side.areaTotal || side.area || 0), 0),
    0,
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white print:bg-white print:text-slate-950">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/45 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 md:flex-nowrap md:px-6">
          <button type="button" onClick={() => navigate('/quotes')} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition hover:text-[#D4A853]">
            <ArrowLeft className="h-4 w-4" />
            Orçamentos
          </button>
          <div className="order-3 flex w-full max-w-full items-center gap-2 overflow-x-auto pb-1 md:order-2 md:flex-1 md:justify-center md:pb-0">
            {navItems.map((item) => (
              <button
                key={item.sectionId}
                type="button"
                onClick={() => scrollToSection(item.sectionId)}
                className={`whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                  activeSection === item.sectionId
                    ? 'border-[#D4A853]/50 bg-[#D4A853]/15 text-[#D4A853]'
                    : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-[#D4A853]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className="order-2 inline-flex items-center gap-2 rounded-full bg-[#D4A853] px-4 py-2 text-xs font-bold uppercase tracking-widest text-black shadow-lg shadow-[#D4A853]/20 md:order-3">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      <Hero
        quote={quote}
        settings={settings}
        totalPieces={totalPieces}
        quoteNumber={quoteNumber}
        totalAdditionsArea={totalAdditionsArea}
        onOpenImage={setLightbox}
      />

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
            <InfoRow label="Telefone" value={safe(quote.phone)} />
            <InfoRow label="Endereço" value={safe(quote.address)} />
            <InfoRow label="Ambiente" value={safe(quote.environment)} />
            <InfoRow label="Status" value={safe(quote.status)} />
            <InfoRow label="Responsável" value={safe(quote.responsibleUserName || quote.responsible)} />
            <InfoRow label="Validade" value={format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR})} />
            <InfoRow label="Emissão" value={format(toDate(quote.createdAt), 'dd/MM/yyyy', {locale: ptBR})} last />
          </div>
        </div>
      </section>

      <section id="materiais" className="scroll-mt-24 px-6 py-24 print:py-12">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Seleção de materiais" title="Materiais selecionados" />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {materialCards.map((material, index) => (
              <div key={`${material.name}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] print:border-slate-200 print:bg-white">
                <div className="aspect-[4/3] bg-[#15110c]">
                  {material.image ?(
                    <ProposalImage
                      src={material.image}
                      alt={material.name}
                      className="h-full w-full"
                      imageClassName="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      onOpen={setLightbox}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#e7e2d7,#9d9a93)] text-xs font-bold uppercase tracking-widest text-black/30">
                      Material
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-bold">{material.name}</h3>
                  <p className="mt-2 text-xs text-white/40 print:text-slate-500">{material.category}</p>
                  <p className="mt-3 text-xs leading-relaxed text-white/58 print:text-slate-600">{material.pieces.join(' · ') || 'Material principal do projeto'}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-4 print:border-slate-100">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/28 print:text-slate-400">Área</div>
                      <div className="mt-1 font-mono text-sm font-bold text-[#D4A853]">{formatNumber(material.area, 4)} m²</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/28 print:text-slate-400">Uso</div>
                      <div className="mt-1 text-xs font-semibold text-white/62 print:text-slate-600">{material.pieces.length} peça(s)</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {materialCards.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center text-sm font-semibold text-white/42 md:col-span-2 xl:col-span-3">
                Nenhum material vinculado ao orçamento.
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
                materialImageUrl={materialImage(materials.find((material) => material.id === piece.materialId) || selectedMaterial)}
                reverse={index % 2 === 1}
                quoteCutouts={quote.cutouts}
                onOpenImage={setLightbox}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="resumo" className="relative scroll-mt-24 px-6 py-28 print:py-12">
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
              <SummaryItem label="Área total" value={`${formatNumber(quote.totalArea || 0, 4)} m²`} />
              <SummaryItem label="Recortes" value={`${cutoutCount(quote)} un`} />
              <SummaryItem label="Pagamento" value={safe(quote.paymentMethod)} />
              <SummaryItem label="Prazo" value={`${quote.deliveryDays || 0} dias úteis`} />
              <SummaryItem label="Ambientes" value={String(totalPieces)} />
              <SummaryItem label="Pedido" value={quoteNumber} />
            </div>
            <div className="flex items-end justify-between border-t border-[#D4A853]/30 px-6 py-6">
              <span className="font-display text-xl font-bold text-[#D4A853]">Investimento total</span>
              <span className="font-mono text-3xl font-bold text-[#D4A853]">{formatCurrency(quote.totalPrice || 0)}</span>
            </div>
          </div>
        </div>
      </section>

      <section id="pagamento" className="scroll-mt-24 px-6 pb-28 print:pb-12">
        <div className="mx-auto max-w-4xl">
          <SectionHeading eyebrow="Condições" title="Condições de pagamento" />
          <div className="grid gap-6 md:grid-cols-2">
            <PaymentCard
              title="Cartão de crédito"
              subtitle="Parcelamento facilitado"
              lines={[`Entrada: ${formatCurrency(installmentValue)}`, `9 parcelas de: ${formatCurrency(installmentValue)}`, `Total: ${formatCurrency(quote.totalPrice || 0)}`]}
            />
            <PaymentCard
              title="Pagamento à vista"
              subtitle="Desconto especial"
              badge="10% OFF"
              lines={[`Desconto: - ${formatCurrency((quote.totalPrice || 0) * 0.1)}`, `À vista: ${formatCurrency(cashValue)}`]}
              highlight
            />
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
          <div className="font-display text-2xl font-bold">{settings.companyName || "D'Coratto Sob Medida"}</div>
          <p className="mt-3 text-sm text-white/35 print:text-slate-500">{[settings.phone, settings.email, settings.address].filter(Boolean).join(' · ')}</p>
          <div className="mx-auto my-8 h-px w-20 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-white/20 print:text-slate-400">Proposta premium gerada pelo sistema D'Coratto</p>
        </div>
      </footer>

      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/88 p-4 backdrop-blur-md print:hidden" onClick={() => setLightbox(null)}>
          <div className="mx-auto flex h-full max-w-6xl flex-col">
            <div className="flex items-center justify-between py-3 text-white/80">
              <div className="truncate pr-4 text-sm font-semibold">{lightbox.alt}</div>
              <button type="button" onClick={() => setLightbox(null)} className="rounded-full border border-white/10 bg-white/5 p-3 text-white transition hover:text-[#D4A853]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <img src={lightbox.src} alt={lightbox.alt} className="max-h-full max-w-full rounded-3xl object-contain shadow-2xl shadow-black/40" />
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

const Hero = ({
  quote,
  settings,
  totalPieces,
  quoteNumber,
  totalAdditionsArea,
  onOpenImage,
}: {
  quote: Quote;
  settings: any;
  totalPieces: number;
  quoteNumber: string;
  totalAdditionsArea: number;
  onOpenImage: React.Dispatch<React.SetStateAction<LightboxState>>;
}) => (
  <section className="relative isolate min-h-screen overflow-hidden px-6 pt-28 print:min-h-0 print:pt-8">
    <div className="absolute inset-0 bg-[#050505]" />
    <div className="absolute inset-0 opacity-80 [background-image:radial-gradient(ellipse_at_20%_15%,rgba(255,255,255,0.15),transparent_24%),radial-gradient(ellipse_at_70%_20%,rgba(212,168,83,0.12),transparent_22%),linear-gradient(118deg,transparent_0%,transparent_18%,rgba(107,82,54,0.35)_19%,transparent_21%,transparent_43%,rgba(231,196,116,0.24)_44%,transparent_46%,transparent_72%,rgba(255,255,255,0.12)_73%,transparent_75%),linear-gradient(31deg,transparent_0%,transparent_35%,rgba(212,168,83,0.18)_36%,transparent_38%,transparent_100%)]" />
    <div className="absolute inset-0 [background-image:linear-gradient(135deg,rgba(255,255,255,0.05)_0_1px,transparent_1px_18px),radial-gradient(circle_at_45%_38%,rgba(0,0,0,0),rgba(0,0,0,0.78)_56%,#050505_100%)]" />
    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/30 to-[#050505]" />
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-7rem)] max-w-6xl flex-col items-center justify-center text-center print:min-h-0">
      {settings.logoUrl || '/logo.png' ?(
        <ProposalImage
          src={settings.logoUrl || '/logo.png'}
          alt={settings.companyName || "D'Coratto Sob Medida"}
          className="mb-8 h-16 max-w-[220px]"
          imageClassName="h-full w-full object-contain opacity-90"
          onOpen={onOpenImage}
          removeWhiteBackground
        />
      ) : (
        <div className="mb-8 text-sm font-bold uppercase tracking-[0.4em] text-white/35">{settings.companyName || "D'Coratto Sob Medida"}</div>
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
      <div className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
        <MiniMetric label="Área principal" value={`${formatNumber(quote.totalArea || 0, 4)} m²`} />
        <MiniMetric label="Adicionais" value={`${formatNumber(totalAdditionsArea, 4)} m²`} />
        <MiniMetric label="Prazo" value={`${quote.deliveryDays || 0} dias úteis`} />
      </div>
    </div>
  </section>
);

const PieceSection = ({
  piece,
  index,
  materialName,
  materialImageUrl,
  reverse,
  quoteCutouts,
  onOpenImage,
}: {
  key?: React.Key;
  piece: QuotePiece;
  index: number;
  materialName: string;
  materialImageUrl?: string;
  reverse: boolean;
  quoteCutouts: Quote['cutouts'];
  onOpenImage: React.Dispatch<React.SetStateAction<LightboxState>>;
}) => {
  const additions = (piece.sides || []).filter((side) => side.type && side.type !== 'none');
  const projectCutouts = [
    {label: 'Cooktop', count: quoteCutouts?.cooktop || 0},
    {label: 'Cuba embutida', count: quoteCutouts?.sinkUnder || 0},
    {label: 'Cuba sobreposta', count: quoteCutouts?.sinkOver || 0},
    {label: 'Furação torneira', count: quoteCutouts?.faucetHole || 0},
    {label: 'Lixeira de embutir', count: quoteCutouts?.trashBinCutout || 0},
    {label: 'Torre de tomada', count: quoteCutouts?.popUpTowerCutout || 0},
    {label: 'Rebaixo americano', count: quoteCutouts?.wetAreaAmericanRecess || 0},
    {label: 'Rebaixo italiano', count: quoteCutouts?.wetAreaItalianRecess || 0},
  ].filter((item) => item.count > 0);
  const rows = [
    {description: 'Pedra principal', measure: `${piece.length || 0} x ${piece.width || 0} cm`, area: `${formatNumber(pieceArea(piece), 4)} m²`, material: materialName, subtotal: 'Incluído'},
    ...(piece.sculptedSink?.active ?[{
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
    ...(!piece.cutouts?.length && index === 0 ?projectCutouts.map((cutout) => ({
      description: cutout.label,
      measure: `${cutout.count} un`,
      area: '-',
      material: 'Recorte especial',
      subtotal: 'Projeto',
    })) : []),
  ];

  return (
    <article id={sectionIdForPiece(index)} className="relative scroll-mt-24">
      <SectionNumber value={String(index + 1).padStart(2, '0')} />
      <Eyebrow>Ambiente {String(index + 1).padStart(2, '0')}</Eyebrow>
      <h2 className="mb-2 mt-3 font-display text-3xl font-bold md:text-4xl">{piece.name}</h2>
      <p className="mb-8 text-xs text-white/35 print:text-slate-500">
        Material: {materialName} · Área: {formatNumber(pieceArea(piece), 4)} m²
      </p>
      <div className={`grid gap-8 lg:grid-cols-12 ${reverse ?'lg:[&>*:first-child]:order-2' : ''}`}>
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] print:border-slate-200 print:bg-white">
            <div className="aspect-[4/3] bg-[#15110c]">
              {pieceImage(piece) || materialImageUrl ?(
                <ProposalImage
                  src={pieceImage(piece) || materialImageUrl || ''}
                  alt={piece.name}
                  className="h-full w-full"
                  imageClassName="h-full w-full object-contain bg-white transition duration-500 group-hover:scale-[1.02]"
                  onOpen={onOpenImage}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-center text-xs font-bold uppercase tracking-widest text-white/28 print:text-slate-400">
                  Adicione uma imagem no orçamento
                </div>
              )}
            </div>
          </div>
          <FixtureSummary piece={piece} />
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
              {[fixture.brand, fixture.model].filter(Boolean).join(' · ') || 'Modelo não informado'}
            </div>
            <div className="mt-1 font-mono text-white/40 print:text-slate-500">
              {[
                fixture.width ?`L ${fixture.width}` : '',
                fixture.depth ?`P ${fixture.depth}` : '',
                fixture.height ?`A ${fixture.height}` : '',
                fixture.diameter ?`Ø ${fixture.diameter}` : '',
              ].filter(Boolean).join(' · ') || 'Medidas pendentes'}
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

const PaymentCard = ({title, subtitle, lines, badge, highlight = false}: {title: string; subtitle: string; lines: string[]; badge?: string; highlight?: boolean}) => (
  <div className={`rounded-3xl border p-6 ${highlight ?'border-[#D4A853]/35 bg-[#D4A853]/[0.07]' : 'border-white/10 bg-white/[0.035]'} print:border-slate-200 print:bg-white`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-2xl font-bold">{title}</h3>
        <p className="mt-2 text-sm text-white/45 print:text-slate-500">{subtitle}</p>
      </div>
      {badge && <span className="rounded-full bg-[#D4A853] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-black">{badge}</span>}
    </div>
    <div className="mt-8 space-y-3 text-sm text-white/72 print:text-slate-700">
      {lines.map((line) => (
        <div key={line} className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 print:border-slate-100 print:bg-slate-50">{line}</div>
      ))}
    </div>
  </div>
);

const MetricCard = ({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) => (
  <div className={`rounded-xl border p-6 backdrop-blur ${highlight ?'border-[#D4A853]/45 bg-[#D4A853]/[0.05]' : 'border-white/10 bg-white/[0.035]'}`}>
    <div className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-white/38">{label}</div>
    <div className={`font-mono text-2xl font-bold ${highlight ?'text-[#D4A853]' : 'text-white'}`}>{value}</div>
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
  <div className={`flex items-center justify-between gap-6 py-3 text-sm ${last ?'' : 'border-b border-white/[0.05] print:border-slate-100'}`}>
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

const ProposalImage = ({
  src,
  alt,
  className = '',
  imageClassName = '',
  onOpen,
  removeWhiteBackground = false,
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  onOpen?: React.Dispatch<React.SetStateAction<LightboxState>>;
  removeWhiteBackground?: boolean;
}) => {
  const [optimizedSrc, setOptimizedSrc] = useState(src);

  useEffect(() => {
    let mounted = true;
    setOptimizedSrc(src);
    convertImageUrlToWebp(src, {removeWhiteBackground}).then((result) => {
      if (mounted && result) setOptimizedSrc(result);
    });
    return () => {
      mounted = false;
    };
  }, [src, removeWhiteBackground]);

  if (!src) return null;

  const imageNode = <img src={optimizedSrc || src} alt={alt} className={imageClassName} />;
  if (!onOpen) {
    return <div className={className}>{imageNode}</div>;
  }

  return (
    <button
      type="button"
      className={`group relative overflow-hidden ${className}`}
      onClick={() => onOpen({src: optimizedSrc || src, alt})}
      title={`Abrir imagem de ${alt}`}
    >
      {imageNode}
      <span className="pointer-events-none absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white opacity-0 transition group-hover:opacity-100">
        <Expand className="h-3.5 w-3.5" />
        Ampliar
      </span>
    </button>
  );
};
