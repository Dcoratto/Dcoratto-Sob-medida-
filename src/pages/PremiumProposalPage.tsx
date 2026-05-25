import React, {useEffect, useMemo, useState} from 'react';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {ArrowLeft, Expand, FileText, Printer, Sparkles, X} from 'lucide-react';
import {useNavigate, useParams} from 'react-router-dom';
import {collection, db, doc, getDoc, onSnapshot} from '../lib/firestore';
import {convertImageUrlToWebp} from '../lib/imageUtils';
import {formatCurrency, formatNumber, repairText} from '../lib/utils';
import {useSettings} from '../hooks/useSettings';
import {Material, Quote, QuotePiece} from '../types';

const AREA_UNIT = 'm²';
const BULLET = ' · ';

const toDate = (value: any) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
};

const safeText = (value?: string | null, fallback = '-') => {
  const text = repairText(String(value || '')).trim();
  return text || fallback;
};

const pieceArea = (piece: QuotePiece) => Number(piece.totalArea || piece.manualArea || piece.area || 0);
const pieceImage = (piece: QuotePiece) => piece.proposalImageUrl?.trim() || piece.previewUrl || '';
const materialImage = (material?: Material | null) => material?.imageUrl?.trim() || '';
const sectionIdForPiece = (index: number) => `peca-${index + 1}`;

const sideLabel = (type: string) => ({
  frontao: 'Frontão',
  saia: 'Saia',
  virada: 'Virada',
  pe: 'Pé de bancada',
  guarnicao: 'Guarnição',
  acabamento: 'Acabamento',
}[type] || safeText(type));

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
  id: string;
  name: string;
  description: string;
  image?: string;
  area: number;
  basePricePerM2: number;
  pieceNames: string[];
};

type PieceSummary = {
  piece: QuotePiece;
  index: number;
  area: number;
  material?: Material;
  materialName: string;
  materialDescription: string;
  imageUrl: string;
  basePricePerM2: number;
  allocatedPrice: number;
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
      if (!id) {
        setLoading(false);
        return;
      }

      const snapshot = await getDoc(doc(db, 'quotes', id));
      if (snapshot.exists()) {
        setQuote({id: snapshot.id, ...snapshot.data()} as Quote);
      } else {
        setQuote(null);
      }
      setLoading(false);
    };

    loadQuote();
    return unsubscribeMaterials;
  }, [id]);

  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);

  const pieceSummaries = useMemo<PieceSummary[]>(() => {
    if (!quote?.pieces?.length) return [];

    const areas = quote.pieces.map((piece) => pieceArea(piece));
    const totalArea = areas.reduce((sum, value) => sum + value, 0);
    const totalCents = Math.max(0, Math.round(Number(quote.totalPrice || 0) * 100));
    const weights = quote.pieces.map((piece, index) => {
      if (totalArea > 0) return areas[index] / totalArea;
      return 1 / quote.pieces.length;
    });

    let remainingCents = totalCents;
    const allocatedCents = quote.pieces.map((_, index) => {
      if (index === quote.pieces.length - 1) {
        return remainingCents;
      }

      const cents = Math.max(0, Math.round(totalCents * weights[index]));
      remainingCents -= cents;
      return cents;
    });

    return quote.pieces.map((piece, index) => {
      const material = materialById.get(piece.materialId);
      const materialName =
        safeText(material?.name, '') ||
        safeText(piece.materialLine, '') ||
        safeText(quote.materialName, 'Material não informado');

      const materialDescription = [
        material?.category,
        piece.materialType || material?.materialType,
        piece.thicknessLabel || material?.thicknessLabel,
        piece.texture || material?.texture,
        piece.provider || material?.provider,
      ]
        .map((value) => safeText(value, ''))
        .filter(Boolean)
        .join(BULLET);

      return {
        piece,
        index,
        area: areas[index],
        material,
        materialName,
        materialDescription,
        imageUrl: pieceImage(piece) || materialImage(material),
        basePricePerM2: Number(material?.pricePerM2 || 0),
        allocatedPrice: allocatedCents[index] / 100,
      };
    });
  }, [materialById, quote]);

  const materialCards = useMemo<MaterialCardData[]>(() => {
    const grouped = new Map<string, MaterialCardData>();

    pieceSummaries.forEach((summary) => {
      const key = summary.material?.id || summary.materialName;
      const existing = grouped.get(key);
      if (existing) {
        existing.area += summary.area;
        existing.pieceNames.push(safeText(summary.piece.name, `Peça ${summary.index + 1}`));
        if (!existing.basePricePerM2 && summary.basePricePerM2) {
          existing.basePricePerM2 = summary.basePricePerM2;
        }
        return;
      }

      grouped.set(key, {
        id: key,
        name: summary.materialName,
        description: summary.materialDescription || 'Material selecionado para este orçamento',
        image: materialImage(summary.material) || summary.imageUrl,
        area: summary.area,
        basePricePerM2: summary.basePricePerM2,
        pieceNames: [safeText(summary.piece.name, `Peça ${summary.index + 1}`)],
      });
    });

    return Array.from(grouped.values());
  }, [pieceSummaries]);

  const navItems = useMemo(
    () => [
      {id: 'materiais', label: 'Materiais'},
      ...pieceSummaries.map((summary) => ({
        id: sectionIdForPiece(summary.index),
        label: safeText(summary.piece.name, `Peça ${summary.index + 1}`),
      })),
      {id: 'fechamento', label: 'Fechamento'},
    ],
    [pieceSummaries],
  );

  useEffect(() => {
    const handleScroll = () => {
      const sections = navItems
        .map((item) => document.getElementById(item.id))
        .filter((node): node is HTMLElement => Boolean(node));

      const current = sections.find((section) => {
        const rect = section.getBoundingClientRect();
        return rect.top <= 160 && rect.bottom >= 180;
      });

      if (current?.id) {
        setActiveSection(current.id);
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, [navItems]);

  const quoteDate = quote?.createdAt ? format(toDate(quote.createdAt), "dd 'de' MMMM 'de' yyyy", {locale: ptBR}) : '';
  const validityDate = quote?.validityDate ? format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR}) : '-';
  const measurementDate = quote?.measurementDate ? format(toDate(quote.measurementDate), 'dd/MM/yyyy', {locale: ptBR}) : null;
  const deliveryDate = quote?.deliveryDate ? format(toDate(quote.deliveryDate), 'dd/MM/yyyy', {locale: ptBR}) : null;
  const companyName = safeText(settings.companyName, 'Dcoratto');
  const companyPhone = safeText(settings.phone, '-');
  const companyEmail = safeText(settings.email, '-');
  const companyAddress = safeText(settings.address, '-');
  const totalArea = pieceSummaries.reduce((sum, summary) => sum + summary.area, 0) || Number(quote?.totalArea || 0);
  const totalPieces = pieceSummaries.length;
  const totalCutouts = cutoutCount(quote);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F1E8] px-6 py-16 text-slate-800">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-[#E8DCC8] bg-white p-10 shadow-[0_30px_100px_rgba(109,79,43,0.08)]">
          <div className="h-4 w-40 animate-pulse rounded-full bg-[#E8DCC8]" />
          <div className="mt-6 h-10 w-3/4 animate-pulse rounded-full bg-[#F1E7D8]" />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {Array.from({length: 3}).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-3xl bg-[#F8F3EC]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F1E8] p-6">
        <div className="w-full max-w-xl rounded-[32px] border border-[#E7D9C2] bg-white p-10 text-center shadow-[0_30px_100px_rgba(109,79,43,0.08)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F4ECDD] text-[#8E623B]">
            <FileText className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-black text-slate-900">Proposta não encontrada</h1>
          <p className="mt-3 text-sm text-slate-500">
            Não localizamos este orçamento. Volte para a lista e abra novamente a proposta premium.
          </p>
          <button
            type="button"
            onClick={() => navigate('/quotes')}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#8E623B] px-6 py-3 font-semibold text-white transition hover:bg-[#7B532F]"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para orçamentos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F1E8] text-slate-900 print:bg-white">
      <div className="sticky top-0 z-40 border-b border-[#E8DCC8]/80 bg-[#F7F1E8]/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/quotes')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#DCC6A6] bg-white text-[#8E623B] transition hover:border-[#C59A5A] hover:text-[#6D4F2B]"
              title="Voltar para orçamentos"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#B08857]">Proposta premium</div>
              <div className="text-sm font-semibold text-slate-700">{safeText(quote.clientName, 'Cliente')}</div>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-[#E2D5C1] bg-white px-3 py-2 md:flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => document.getElementById(item.id)?.scrollIntoView({behavior: 'smooth', block: 'start'})}
                className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.22em] transition ${
                  activeSection === item.id
                    ? 'bg-[#8E623B] text-white'
                    : 'text-slate-500 hover:bg-[#F6EFE6] hover:text-[#8E623B]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full bg-[#8E623B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#7B532F]"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10 print:max-w-none print:px-0 print:py-0">
        <section className="overflow-hidden rounded-[36px] border border-[#E7D9C2] bg-white shadow-[0_40px_120px_rgba(109,79,43,0.08)] print:rounded-none print:border-0 print:shadow-none">
          <div className="grid gap-10 px-6 py-8 md:grid-cols-[1.15fr_0.85fr] md:px-10 md:py-12">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D9C2] bg-[#FBF8F3] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.26em] text-[#A57B49]">
                <Sparkles className="h-3.5 w-3.5" />
                Apresentação comercial
              </div>

              <h1 className="mt-6 max-w-3xl font-display text-4xl font-black leading-tight text-slate-950 md:text-6xl">
                Proposta sob medida com transparência por peça, material e valor final.
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                Organizamos abaixo os materiais escolhidos, o detalhamento de cada peça e a composição do valor
                final para deixar a leitura mais clara e elegante.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <HeroStat label="Cliente" value={safeText(quote.clientName, 'Não informado')} />
                <HeroStat label="Ambiente" value={safeText(quote.environment, 'Sob medida')} />
                <HeroStat label="Peças" value={`${totalPieces}`} />
                <HeroStat label="Área total" value={`${formatNumber(totalArea)} ${AREA_UNIT}`} />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <HeroStat label="Valor total" value={formatCurrency(Number(quote.totalPrice || 0))} highlight />
                <HeroStat label="Forma de pagamento" value={safeText(quote.paymentMethod, 'A combinar')} />
                <HeroStat label="Validade" value={validityDate} />
                <HeroStat label="Prazo estimado" value={`${Number(quote.deliveryDays || 0)} dias`} />
              </div>
            </div>

            <div className="rounded-[32px] border border-[#EADFCC] bg-[radial-gradient(circle_at_top,_rgba(212,168,83,0.16),_transparent_55%),linear-gradient(180deg,#fffdf9_0%,#f8f2e8_100%)] p-6 md:p-8">
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#A57B49]">Dados da proposta</div>
              <div className="mt-6 space-y-4">
                <InfoRow label="Empresa" value={companyName} />
                <InfoRow label="Responsável" value={safeText(quote.responsible, 'Equipe comercial')} />
                <InfoRow label="Data da proposta" value={quoteDate || '-'} />
                <InfoRow label="Telefone" value={companyPhone} />
                <InfoRow label="E-mail" value={companyEmail} />
                <InfoRow label="Endereço" value={companyAddress} last />
              </div>

              {quote.commercialNotes?.trim() && (
                <div className="mt-6 rounded-3xl border border-[#E4D4BC] bg-white/80 p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#A57B49]">Observação comercial</div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{safeText(quote.commercialNotes)}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="materiais" className="relative mt-8 overflow-hidden rounded-[36px] border border-[#E7D9C2] bg-[#16130F] px-6 py-10 text-white shadow-[0_30px_80px_rgba(15,10,4,0.18)] print:mt-6 print:border print:border-slate-200 print:bg-white print:text-slate-900 md:px-10">
          <SectionNumber value="01" />
          <SectionTitle eyebrow="Materiais" title="Materiais selecionados para o projeto" />

          <div className="grid gap-5 lg:grid-cols-2">
            {materialCards.map((card) => (
              <div
                key={card.id}
                className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur print:border-slate-200 print:bg-white"
              >
                <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                  <ProposalImage
                    src={card.image || ''}
                    alt={card.name}
                    className="h-full min-h-[220px] bg-[#221A12] print:bg-slate-50"
                    imageClassName="h-full w-full object-cover"
                    onOpen={setLightbox}
                  />

                  <div className="p-6">
                    <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#D4A853] print:text-[#8E623B]">
                      Material principal
                    </div>
                    <h3 className="mt-3 text-2xl font-black text-white print:text-slate-950">{card.name}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/70 print:text-slate-600">{card.description}</p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <DetailPill label="Área aplicada" value={`${formatNumber(card.area)} ${AREA_UNIT}`} />
                      <DetailPill
                        label="Preço base"
                        value={card.basePricePerM2 ? `${formatCurrency(card.basePricePerM2)} / ${AREA_UNIT}` : 'Sob consulta'}
                      />
                      <DetailPill label="Peças" value={`${card.pieceNames.length}`} />
                    </div>

                    <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-white/75 print:border-slate-200 print:bg-slate-50 print:text-slate-700">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/35 print:text-slate-400">
                        Aplicado em
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {card.pieceNames.map((pieceName) => (
                          <span
                            key={pieceName}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold print:border-slate-200 print:bg-white"
                          >
                            {pieceName}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 space-y-8">
          {pieceSummaries.map((summary) => (
            <article
              key={summary.piece.id}
              id={sectionIdForPiece(summary.index)}
              className="relative overflow-hidden rounded-[36px] border border-[#E7D9C2] bg-white p-6 shadow-[0_25px_70px_rgba(109,79,43,0.06)] print:break-inside-avoid print:shadow-none md:p-10"
            >
              <SectionNumber value={String(summary.index + 2).padStart(2, '0')} />
              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#A57B49]">
                    Peça {summary.index + 1}
                  </div>
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-black text-slate-950 md:text-4xl">
                        {safeText(summary.piece.name, `Peça ${summary.index + 1}`)}
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                        {summary.materialDescription || 'Detalhamento personalizado com acabamento sob medida para este ambiente.'}
                      </p>
                    </div>
                    <PriceBadge label="Valor da peça" value={formatCurrency(summary.allocatedPrice)} />
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <DetailPill label="Área da peça" value={`${formatNumber(summary.area)} ${AREA_UNIT}`} light />
                    <DetailPill
                      label="Preço por m²"
                      value={summary.basePricePerM2 ? `${formatCurrency(summary.basePricePerM2)} / ${AREA_UNIT}` : 'Sob consulta'}
                      light
                    />
                    <DetailPill label="Material" value={summary.materialName} light />
                  </div>

                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    <InfoCard
                      label="Acabamentos laterais"
                      content={
                        summary.piece.sides?.length ? (
                          <div className="space-y-2">
                            {summary.piece.sides.map((side, index) => (
                              <div key={`${side.type}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                                <span className="text-slate-600">{sideLabel(side.type)}</span>
                                <span className="font-semibold text-slate-900">
                                  {formatNumber(Number(side.height || 0), 0)} cm
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">Sem acabamentos adicionais informados.</span>
                        )
                      }
                    />

                    <InfoCard
                      label="Recortes e detalhes"
                      content={
                        <div className="space-y-2 text-sm text-slate-600">
                          <SummaryLine label="Recortes na peça" value={`${summary.piece.cutouts?.length || 0}`} />
                          <SummaryLine
                            label="Esculpida"
                            value={summary.piece.sculptedSink ? 'Sim' : 'Não'}
                          />
                          <SummaryLine
                            label="Degrau"
                            value={summary.piece.stair ? 'Sim' : 'Não'}
                          />
                          <SummaryLine
                            label="Rebaixo molhado"
                            value={summary.piece.wetAreaRecess ? 'Sim' : 'Não'}
                          />
                        </div>
                      }
                    />
                  </div>

                  {(summary.piece.notes?.trim() || summary.piece.purchasedFixtures) && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {summary.piece.notes?.trim() && (
                        <InfoCard
                          label="Observações da peça"
                          content={<p className="text-sm leading-6 text-slate-600">{safeText(summary.piece.notes)}</p>}
                        />
                      )}

                      {summary.piece.purchasedFixtures && (
                        <InfoCard
                          label="Itens vinculados"
                          content={<FixtureSummary piece={summary.piece} />}
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-[32px] border border-[#E7D9C2] bg-[#FBF8F3]">
                  <ProposalImage
                    src={summary.imageUrl}
                    alt={safeText(summary.piece.name, `Peça ${summary.index + 1}`)}
                    className="group relative block h-full min-h-[360px] w-full bg-white"
                    imageClassName="h-full w-full object-cover"
                    onOpen={setLightbox}
                    removeWhiteBackground
                  />
                </div>
              </div>
            </article>
          ))}
        </section>

        <section
          id="fechamento"
          className="relative mt-8 overflow-hidden rounded-[36px] border border-[#E7D9C2] bg-white p-6 shadow-[0_25px_70px_rgba(109,79,43,0.06)] print:shadow-none md:p-10"
        >
          <SectionNumber value="99" />
          <SectionTitle eyebrow="Fechamento" title="Resumo final e composição do orçamento" />

          <div className="overflow-hidden rounded-[28px] border border-[#E9DCC8]">
            <div className="hidden grid-cols-[1.4fr_0.7fr_0.9fr_0.9fr] gap-4 bg-[#F8F2E8] px-6 py-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#8E623B] md:grid">
              <div>Peça</div>
              <div>Área</div>
              <div>Preço por m²</div>
              <div>Valor da peça</div>
            </div>

            <div className="divide-y divide-[#EFE4D3]">
              {pieceSummaries.map((summary) => (
                <div key={summary.piece.id} className="grid gap-3 px-6 py-5 md:grid-cols-[1.4fr_0.7fr_0.9fr_0.9fr] md:items-center">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {safeText(summary.piece.name, `Peça ${summary.index + 1}`)}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{summary.materialName}</div>
                  </div>
                  <SummaryValue label="Área" value={`${formatNumber(summary.area)} ${AREA_UNIT}`} />
                  <SummaryValue
                    label="Preço por m²"
                    value={summary.basePricePerM2 ? `${formatCurrency(summary.basePricePerM2)} / ${AREA_UNIT}` : 'Sob consulta'}
                  />
                  <SummaryValue label="Valor da peça" value={formatCurrency(summary.allocatedPrice)} emphasize />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <SummaryItem label="Total de peças" value={`${totalPieces}`} />
            <SummaryItem label="Área total" value={`${formatNumber(totalArea)} ${AREA_UNIT}`} />
            <SummaryItem label="Recortes previstos" value={`${totalCutouts}`} />
            <SummaryItem label="Validade da proposta" value={validityDate} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-[28px] border border-[#E9DCC8] bg-[#FBF7F1] p-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#8E623B]">Condições comerciais</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoRowLight label="Forma de pagamento" value={safeText(quote.paymentMethod, 'A combinar')} />
                <InfoRowLight label="Prazo estimado" value={`${Number(quote.deliveryDays || 0)} dias`} />
                <InfoRowLight label="Medição" value={measurementDate || 'A definir'} />
                <InfoRowLight label="Entrega prevista" value={deliveryDate || 'A definir'} />
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-600">
                Os valores por peça acima foram distribuídos dentro do valor total do orçamento para deixar a leitura
                comercial mais clara, mantendo o fechamento final desta proposta.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#DDBA7C] bg-[linear-gradient(180deg,#fffaf1_0%,#f5e6ca_100%)] p-6 shadow-[0_20px_60px_rgba(142,98,59,0.12)]">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#8E623B]">Valor total da proposta</div>
              <div className="mt-4 text-4xl font-black text-[#6D4F2B]">
                {formatCurrency(Number(quote.totalPrice || 0))}
              </div>
              <div className="mt-3 text-sm leading-6 text-slate-600">
                Proposta válida até <span className="font-semibold text-slate-800">{validityDate}</span>, considerando
                materiais, detalhamento por peça e condições descritas acima.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[36px] border border-[#E7D9C2] bg-[#16130F] px-6 py-8 text-white shadow-[0_25px_70px_rgba(15,10,4,0.18)] print:border print:border-slate-200 print:bg-white print:text-slate-900 md:px-10">
          <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#D4A853] print:text-[#8E623B]">
                Encerramento
              </div>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">
                Obrigado pela confiança em nosso trabalho.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72 print:text-slate-600">
                Se desejar, podemos seguir com os próximos passos de medição final, aprovação comercial e programação
                de produção mantendo exatamente este escopo como referência.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 print:border-slate-200 print:bg-slate-50">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/40 print:text-slate-400">
                Contato
              </div>
              <div className="mt-3 space-y-2 text-sm text-white/85 print:text-slate-700">
                <div>{companyName}</div>
                <div>{companyPhone}</div>
                <div>{companyEmail}</div>
                <div>{companyAddress}</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 print:hidden"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
            onClick={() => setLightbox(null)}
            title="Fechar imagem"
          >
            <X className="h-5 w-5" />
          </button>

          <img
            src={lightbox.src}
            alt={lightbox.alt}
            className="max-h-[92vh] max-w-[92vw] rounded-[28px] border border-white/10 bg-white object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

const SectionTitle = ({eyebrow, title}: {eyebrow: string; title: string}) => (
  <div className="mb-10 text-center">
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2 className="mt-4 font-display text-4xl font-black md:text-5xl">{title}</h2>
    <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-[#D4A853] to-transparent" />
  </div>
);

const Eyebrow = ({children}: {children: React.ReactNode}) => (
  <div className="text-xs font-bold uppercase tracking-[0.35em] text-[#D4A853]">{children}</div>
);

const SectionNumber = ({value}: {value: string}) => (
  <div className="pointer-events-none absolute left-4 top-8 font-display text-8xl font-black text-black/[0.03] print:hidden md:left-8 md:text-9xl">
    {value}
  </div>
);

const HeroStat = ({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) => (
  <div
    className={`rounded-[24px] border p-5 ${
      highlight
        ? 'border-[#DDBA7C] bg-[linear-gradient(180deg,#fffaf1_0%,#f5e6ca_100%)]'
        : 'border-[#E8DCC8] bg-[#FBF8F3]'
    }`}
  >
    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#9B7447]">{label}</div>
    <div className={`mt-3 text-lg font-black ${highlight ? 'text-[#6D4F2B]' : 'text-slate-900'}`}>{value}</div>
  </div>
);

const InfoRow = ({label, value, last = false}: {label: string; value: string; last?: boolean}) => (
  <div className={`flex items-center justify-between gap-5 py-3 ${last ? '' : 'border-b border-[#E8DCC8]'}`}>
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
  </div>
);

const InfoRowLight = ({label, value}: {label: string; value: string}) => (
  <div className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3">
    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9B7447]">{label}</div>
    <div className="mt-2 text-sm font-semibold text-slate-800">{value}</div>
  </div>
);

const DetailPill = ({label, value, light = false}: {label: string; value: string; light?: boolean}) => (
  <div
    className={`rounded-full px-4 py-2.5 text-sm ${
      light
        ? 'border border-[#E7D9C2] bg-[#FBF7F1] text-slate-700'
        : 'border border-white/10 bg-white/5 text-white/90 print:border-slate-200 print:bg-white print:text-slate-800'
    }`}
  >
    <span className={light ? 'text-slate-500' : 'text-white/45 print:text-slate-400'}>{label}: </span>
    <span className="font-semibold">{value}</span>
  </div>
);

const PriceBadge = ({label, value}: {label: string; value: string}) => (
  <div className="rounded-[24px] border border-[#DDBA7C] bg-[linear-gradient(180deg,#fffaf1_0%,#f5e6ca_100%)] px-5 py-4 text-right shadow-[0_12px_35px_rgba(142,98,59,0.10)]">
    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8E623B]">{label}</div>
    <div className="mt-2 text-2xl font-black text-[#6D4F2B]">{value}</div>
  </div>
);

const InfoCard = ({label, content}: {label: string; content: React.ReactNode}) => (
  <div className="rounded-[24px] border border-[#E7D9C2] bg-[#FBF8F3] p-5">
    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#9B7447]">{label}</div>
    <div className="mt-4">{content}</div>
  </div>
);

const SummaryLine = ({label, value}: {label: string; value: string}) => (
  <div className="flex items-center justify-between gap-3">
    <span>{label}</span>
    <span className="font-semibold text-slate-900">{value}</span>
  </div>
);

const SummaryItem = ({label, value}: {label: string; value: string}) => (
  <div className="rounded-[24px] border border-[#E7D9C2] bg-[#FBF8F3] p-5">
    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#9B7447]">{label}</div>
    <div className="mt-3 text-xl font-black text-slate-950">{value}</div>
  </div>
);

const SummaryValue = ({label, value, emphasize = false}: {label: string; value: string; emphasize?: boolean}) => (
  <div className="md:text-right">
    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 md:hidden">{label}</div>
    <div className={emphasize ? 'font-black text-[#6D4F2B]' : 'font-semibold text-slate-800'}>{value}</div>
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

  if (!src) {
    return (
      <div className={`${className} flex items-center justify-center bg-[#F5EFE5] text-sm text-slate-400`}>
        Imagem não disponível
      </div>
    );
  }

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

const FixtureSummary = ({piece}: {piece: QuotePiece}) => {
  const items = [
    {label: 'Cuba', value: piece.purchasedFixtures?.sink?.name || piece.purchasedFixtures?.sink?.model},
    {label: 'Torneira', value: piece.purchasedFixtures?.faucet?.name || piece.purchasedFixtures?.faucet?.model},
    {label: 'Cooktop', value: piece.purchasedFixtures?.cooktop?.name || piece.purchasedFixtures?.cooktop?.model},
    {label: 'Lixeira', value: piece.purchasedFixtures?.trashBin?.name || piece.purchasedFixtures?.trashBin?.model},
    {label: 'Torre pop-up', value: piece.purchasedFixtures?.popUpTower?.name || piece.purchasedFixtures?.popUpTower?.model},
  ].filter((item) => item.value);

  if (!items.length) {
    return <span className="text-sm text-slate-500">Nenhum item complementar vinculado.</span>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-600">{item.label}</span>
          <span className="text-right font-semibold text-slate-900">{safeText(item.value)}</span>
        </div>
      ))}
    </div>
  );
};
