import React, {useEffect, useMemo, useState} from 'react';
import {useParams} from 'react-router-dom';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CopyCheck,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {acceptQuotePresentation, getPublicQuotePresentation, PublicQuotePresentationResponse, QuotePresentationSnapshot} from '../lib/quoteDigital';
import {cn, formatArea, formatCurrency} from '../lib/utils';

const formatDateLong = (value?: string | null) => {
  if (!value) return '';
  try {
    return format(new Date(value), "dd 'de' MMMM 'de' yyyy", {locale: ptBR});
  } catch {
    return '';
  }
};

const formatDateShort = (value?: string | null) => {
  if (!value) return '';
  try {
    return format(new Date(value), 'dd/MM/yyyy', {locale: ptBR});
  } catch {
    return '';
  }
};

const PresentationImage = ({
  src,
  alt,
  className,
  priority = false,
  onClick,
}: {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  onClick?: () => void;
}) => {
  const [hidden, setHidden] = useState(false);
  if (!src || hidden) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setHidden(true)}
      onClick={onClick}
      className={cn(className, onClick && 'cursor-pointer')}
    />
  );
};

const PublicStatePanel = ({
  title,
  description,
  company,
  versionLabel,
}: {
  title: string;
  description: string;
  company?: QuotePresentationSnapshot['company'];
  versionLabel?: string;
}) => {
  const addressLines = String(company?.address || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-[#0e0d0b] px-5 py-8 text-[#f4efe8]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-between">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_360px] lg:items-end">
          <div className="pt-8 sm:pt-16">
            <div className="text-[11px] uppercase tracking-[0.38em] text-[#b8976a]">{company?.name || "D'Coratto Sob Medida"}</div>
            <h1 className="mt-8 max-w-4xl font-display text-5xl leading-none text-[#f4efe8] sm:text-6xl lg:text-7xl">{title}</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#d5c6b4] sm:text-lg">{description}</p>
            {versionLabel && (
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#b8976a]/25 bg-[#171512] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[#e8dccf]">
                <Sparkles className="h-4 w-4 text-[#b8976a]" />
                {versionLabel}
              </div>
            )}
          </div>

          <div className="rounded-[32px] border border-white/8 bg-[#131210] p-6 shadow-2xl shadow-black/30">
            <div className="space-y-5">
              <div className="text-[11px] uppercase tracking-[0.34em] text-[#b8976a]">Atendimento</div>
              {company?.phone && (
                <div className="flex items-center gap-3 text-sm text-[#e8ddd1]">
                  <Phone className="h-4 w-4 text-[#b8976a]" />
                  <span>{company.phone}</span>
                </div>
              )}
              {company?.email && <div className="text-sm text-[#d5c6b4]">{company.email}</div>}
              {addressLines.length > 0 && (
                <div className="space-y-2 pt-2 text-sm leading-7 text-[#c6b6a2]">
                  {addressLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SectionEyebrow = ({children}: {children: React.ReactNode}) => (
  <div className="text-[11px] uppercase tracking-[0.34em] text-[#b8976a]">{children}</div>
);

const SectionTitle = ({children}: {children: React.ReactNode}) => (
  <h2 className="mt-4 font-display text-4xl text-[#f4efe8] sm:text-5xl">{children}</h2>
);

const projectSteps = [
  {
    step: '01',
    title: 'Medição',
    description: 'Conferência técnica das medidas e validação do espaço antes da fabricação.',
  },
  {
    step: '02',
    title: 'Produção',
    description: 'Fabricação sob medida das peças conforme a proposta aprovada.',
  },
  {
    step: '03',
    title: 'Acabamento',
    description: 'Finalização das superfícies, recortes e detalhes de apresentação do projeto.',
  },
  {
    step: '04',
    title: 'Entrega e instalação',
    description: 'Etapa final de entrega e montagem conforme as condições contratadas para o projeto.',
  },
];

export const QuotePresentationPage: React.FC = () => {
  const {token = ''} = useParams();
  const [payload, setPayload] = useState<PublicQuotePresentationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [acceptedName, setAcceptedName] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [acceptanceMessage, setAcceptanceMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await getPublicQuotePresentation(token);
        if (!active) return;
        setPayload(result);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Não foi possível carregar a proposta agora.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [token]);

  const availablePayload = payload?.state === 'available' ? payload : null;
  const snapshot = availablePayload?.snapshot;
  const company = snapshot?.company;
  const investment = snapshot?.investment;
  const delivery = snapshot?.delivery;
  const acceptedDisplayName = availablePayload?.meta.acceptedName || acceptedName;
  const proposalAccepted = Boolean(availablePayload?.meta.acceptedAt);

  const gallery = useMemo(() => {
    if (!snapshot) return [];
    return [
      snapshot.material?.imageUrl
        ? {
          src: snapshot.material.imageUrl,
          title: snapshot.material.name || 'Material selecionado',
          subtitle: [snapshot.material.materialLine, snapshot.material.materialType, snapshot.material.texture].filter(Boolean).join(' • '),
        }
        : null,
      ...((snapshot.pieces || []).map((piece) => (
        piece.imageUrl
          ? {
            src: piece.imageUrl,
            title: piece.name || 'Peça',
            subtitle: [piece.environment, piece.dimensionsLabel].filter(Boolean).join(' • '),
          }
          : null
      ))),
    ]
      .filter(Boolean)
      .filter((item, index, array) => array.findIndex((entry) => entry?.src === item?.src) === index) as Array<{src: string; title: string; subtitle: string}>;
  }, [snapshot]);

  const projectSummaryItems = useMemo(() => {
    if (!snapshot) return [];
    return [
      {
        label: 'Cliente',
        value: snapshot.client?.name || 'Cliente',
      },
      {
        label: 'Projeto',
        value: snapshot.summary?.environment || snapshot.heroSubtitle || 'Projeto sob medida',
      },
      {
        label: 'Local',
        value: [snapshot.client?.city, snapshot.client?.neighborhood].filter(Boolean).join(' • ') || snapshot.client?.city || '-',
      },
      {
        label: 'Responsável',
        value: snapshot.summary?.responsible || 'D\'Coratto',
      },
    ];
  }, [snapshot]);

  const includedItems = useMemo(() => {
    if (!snapshot) return [];
    const features = snapshot.includedFeatures;
    return [
      {
        key: 'material',
        title: 'Material selecionado',
        description: snapshot.material?.name || 'Superfície escolhida para o projeto.',
        active: Boolean(features?.materialSelected || snapshot.material?.name),
      },
      {
        key: 'fabrication',
        title: 'Fabricação sob medida',
        description: 'Produção conforme o desenho comercial aprovado.',
        active: Boolean(features?.fabricationIncluded || snapshot.summary?.pieceCount),
      },
      {
        key: 'cutouts',
        title: 'Recortes',
        description: 'Execução dos recortes previstos nesta composição.',
        active: Boolean(features?.cutoutsIncluded),
      },
      {
        key: 'sculpted-sink',
        title: 'Pia esculpida',
        description: 'Item contemplado na versão comercial apresentada.',
        active: Boolean(features?.sculptedSinkIncluded),
      },
      {
        key: 'finishing',
        title: 'Acabamento',
        description: snapshot.material?.texture ? `Acabamento ${snapshot.material.texture.toLowerCase()}.` : 'Acabamento previsto para o material selecionado.',
        active: Boolean(features?.finishingIncluded || snapshot.material?.texture),
      },
      {
        key: 'delivery',
        title: 'Entrega',
        description: 'Entrega incluída conforme a composição comercial deste orçamento.',
        active: Boolean(features?.deliveryIncluded || delivery?.deliveryIncluded),
      },
      {
        key: 'installation',
        title: 'Instalação',
        description: 'Montagem contemplada nesta proposta comercial.',
        active: Boolean(features?.installationIncluded || delivery?.installationIncluded),
      },
    ].filter((item) => item.active);
  }, [delivery?.deliveryIncluded, delivery?.installationIncluded, snapshot]);

  const importantInfoItems = useMemo(() => {
    if (!snapshot) return [];
    const items = [
      snapshot.validUntil ? `Proposta válida até ${formatDateLong(snapshot.validUntil)}.` : null,
      snapshot.delivery?.measurementDate ? `Medição prevista para ${formatDateLong(snapshot.delivery.measurementDate)}.` : null,
      snapshot.delivery?.deliveryDate ? `Entrega estimada para ${formatDateLong(snapshot.delivery.deliveryDate)}.` : null,
      snapshot.notes?.commercialNotes || null,
      snapshot.notes?.defaultNotes || null,
      snapshot.payment?.notes || null,
    ].filter(Boolean) as string[];

    return items;
  }, [snapshot]);

  const paymentSummary = snapshot?.payment?.method || snapshot?.payment?.totalPaymentMethod || snapshot?.payment?.remainingPaymentMethod;
  const paymentDetails = [
    snapshot?.payment?.entryAmount ? `Entrada de ${formatCurrency(snapshot.payment.entryAmount)}` : null,
    snapshot?.payment?.installmentCount && snapshot?.payment?.installmentAmount
      ? `Saldo em ${snapshot.payment.installmentCount} parcela(s) de ${formatCurrency(snapshot.payment.installmentAmount)}`
      : snapshot?.payment?.installmentCount
        ? `${snapshot.payment.installmentCount} parcela(s)`
        : null,
    snapshot?.payment?.remainingPaymentMethod ? `Saldo via ${snapshot.payment.remainingPaymentMethod}` : null,
  ].filter(Boolean) as string[];

  useEffect(() => {
    if (lightboxIndex == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxIndex(null);
      if (event.key === 'ArrowRight') setLightboxIndex((current) => current == null ? current : (current + 1) % gallery.length);
      if (event.key === 'ArrowLeft') setLightboxIndex((current) => current == null ? current : (current - 1 + gallery.length) % gallery.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gallery.length, lightboxIndex]);

  const handleAccept = async () => {
    if (!acceptedName.trim()) {
      window.alert('Informe seu nome para confirmar o aceite.');
      return;
    }
    setAccepting(true);
    try {
      const result = await acceptQuotePresentation(token, acceptedName.trim());
      const nextAcceptedName = result.acceptedName || acceptedName.trim();
      setAcceptanceMessage(`Proposta ${result.versionLabel} aceita em ${formatDateLong(result.acceptedAt)}.`);
      setAcceptedName(nextAcceptedName);
      setConfirming(false);
      setPayload((current) => (
        current && current.state === 'available'
          ? {
            ...current,
            status: 'ACEITO',
            meta: {
              ...current.meta,
              acceptedAt: result.acceptedAt,
              acceptedName: nextAcceptedName,
            },
          }
          : current
      ));
    } catch (err: any) {
      window.alert(err?.message || 'Não foi possível registrar o aceite agora.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0d0b] px-5 py-8 text-[#f4efe8]">
        <div className="mx-auto max-w-6xl animate-pulse space-y-8">
          <div className="h-[72vh] rounded-[40px] bg-[#131210]" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="h-56 rounded-[32px] bg-[#131210]" />
            <div className="h-56 rounded-[32px] bg-[#131210]" />
            <div className="h-56 rounded-[32px] bg-[#131210]" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <PublicStatePanel title="Indisponível" description={error} />;
  }

  if (!payload || payload.state === 'missing') {
    return (
      <PublicStatePanel
        title="Proposta não encontrada"
        description="Este link não corresponde a uma proposta disponível. Fale com a D'Coratto para receber uma nova versão comercial."
        company={payload?.company}
        versionLabel={payload?.versionLabel}
      />
    );
  }

  if (payload.state === 'revoked') {
    return (
      <PublicStatePanel
        title="Proposta revogada"
        description="Esta versão foi encerrada e não está mais disponível. A D'Coratto pode compartilhar uma nova proposta atualizada para o seu projeto."
        company={payload.company}
        versionLabel={payload.versionLabel}
      />
    );
  }

  if (payload.state === 'expired') {
    return (
      <PublicStatePanel
        title="Proposta expirada"
        description="A validade desta proposta foi encerrada. Solicite à D'Coratto uma nova versão comercial com as condições atualizadas."
        company={payload.company}
        versionLabel={payload.versionLabel}
      />
    );
  }

  const topImage = snapshot?.material?.imageUrl || gallery[0]?.src;
  const primarySections = [
    {id: 'projeto', label: 'Projeto'},
    snapshot?.material ? {id: 'material', label: 'Material'} : null,
    includedItems.length > 0 ? {id: 'inclusos', label: 'Inclusos'} : null,
    {id: 'investimento', label: 'Investimento'},
    {id: 'aceite', label: proposalAccepted ? 'Aceite' : 'Confirmar'},
  ].filter(Boolean) as Array<{id: string; label: string}>;

  return (
    <div className="min-h-screen bg-[#0e0d0b] text-[#f4efe8]">
      <style>{`
        html {
          scroll-behavior: smooth;
        }
        @media (prefers-reduced-motion: reduce) {
          html {
            scroll-behavior: auto;
          }
        }
        @media print {
          body { background: #ffffff !important; }
          .proposal-print-hide { display: none !important; }
          .proposal-print-shell { background: #ffffff !important; color: #201a15 !important; }
        }
      `}</style>

      <header className="proposal-print-hide sticky top-0 z-40 border-b border-white/6 bg-[#0e0d0b]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-[11px] uppercase tracking-[0.34em] text-[#b8976a]">{company?.name || "D'Coratto Sob Medida"}</div>
            <div className="mt-1 truncate text-sm text-[#d7c8b6]">{availablePayload.meta.proposalCode}</div>
          </div>
          <nav className="hidden items-center gap-5 text-xs text-[#d8c8b5] md:flex">
            {primarySections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="transition hover:text-[#f4efe8]">
                {section.label}
              </a>
            ))}
          </nav>
          <a
            href="#aceite"
            className="inline-flex items-center gap-2 rounded-full border border-[#b8976a]/25 bg-[#171512] px-4 py-2 text-xs uppercase tracking-[0.22em] text-[#f0e6dc] transition hover:border-[#d4b48a]/40 hover:text-white"
          >
            {proposalAccepted ? 'Aceita' : 'Responder'}
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main className="proposal-print-shell">
        <section className="relative overflow-hidden px-5 pb-16 pt-10 sm:pb-20 sm:pt-14">
          <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top,_rgba(184,151,106,0.16),_transparent_58%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-10 lg:min-h-[88vh] lg:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)] lg:items-center">
            <div className="flex flex-col justify-center">
              <SectionEyebrow>Proposta comercial</SectionEyebrow>
              <h1 className="mt-7 max-w-4xl font-display text-5xl leading-none text-[#f4efe8] sm:text-6xl lg:text-[5.5rem]">
                Projeto desenvolvido para {snapshot?.client?.name || 'seu projeto'}.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[#d8c8b5] sm:text-lg">
                {snapshot?.heroSubtitle || 'Soluções em rochas e superfícies sob medida com apresentação comercial fiel ao orçamento aprovado.'}
              </p>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[26px] border border-white/10 bg-[#131210] px-5 py-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">Proposta</div>
                  <div className="mt-2 text-base text-[#f4efe8]">{availablePayload.meta.proposalCode}</div>
                  <div className="mt-1 text-sm text-[#bcae9d]">{availablePayload.meta.versionLabel}</div>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-[#131210] px-5 py-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">Validade</div>
                  <div className="mt-2 text-base text-[#f4efe8]">{formatDateLong(availablePayload.meta.validUntil)}</div>
                  <div className="mt-1 text-sm text-[#bcae9d]">Versão pública da proposta digital</div>
                </div>
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                <a
                  href="#investimento"
                  className="inline-flex items-center gap-2 rounded-full bg-[#b8976a] px-5 py-3 text-sm font-semibold text-[#2f2419] transition duration-200 hover:bg-[#d4b48a] motion-reduce:transition-none"
                >
                  Ver investimento
                  <ChevronRight className="h-4 w-4" />
                </a>
                <a
                  href="#projeto"
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-[#efe4d9] transition duration-200 hover:border-[#b8976a]/35 hover:bg-white/8 motion-reduce:transition-none"
                >
                  Explorar projeto
                </a>
              </div>
            </div>

            <div className="rounded-[36px] border border-white/8 bg-[#131210] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
              <div className="overflow-hidden rounded-[30px] border border-white/6 bg-[#181512]">
                <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">{company?.name || "D'Coratto Sob Medida"}</div>
                    <div className="mt-2 text-sm text-[#e4d8cb]">Soluções em Rochas e Superfícies Sob Medida</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-[#b8976a]">Valor final</div>
                    <div className="mt-2 font-display text-3xl text-[#f4efe8]">{formatCurrency(investment?.totalPrice || 0)}</div>
                  </div>
                </div>
                {topImage ? (
                  <PresentationImage
                    src={topImage}
                    alt={snapshot?.material?.name || 'Projeto D\'Coratto'}
                    priority
                    className="h-[360px] w-full object-cover sm:h-[520px]"
                  />
                ) : (
                  <div className="flex h-[360px] items-center justify-center bg-[#1c1a17] text-sm text-[#c7b7a5] sm:h-[520px]">
                    Apresentação comercial D&apos;Coratto
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="projeto" className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionEyebrow>Seu projeto</SectionEyebrow>
            <SectionTitle>Uma composição pensada para o seu ambiente.</SectionTitle>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {projectSummaryItems.map((item) => (
                <div key={item.label} className="rounded-[26px] border border-white/8 bg-[#131210] px-5 py-5">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">{item.label}</div>
                  <div className="mt-3 text-lg text-[#f4efe8]">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
              <div className="rounded-[30px] border border-white/8 bg-[#131210] p-6">
                <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">Resumo da proposta</div>
                <div className="mt-5 space-y-4 text-sm leading-8 text-[#d7c8b6]">
                  <p>
                    Esta proposta apresenta uma solução comercial personalizada da D'Coratto para o seu projeto,
                    preservando exatamente os dados salvos no orçamento e nesta versão pública.
                  </p>
                  <p>
                    {snapshot?.summary?.pieceCount
                      ? `${snapshot.summary.pieceCount} peça(s) compõem esta versão comercial.`
                      : 'Projeto sob medida preparado para o seu ambiente.'}
                  </p>
                </div>
              </div>

              {(snapshot?.pieces?.length || 0) > 0 && (
                <div className="grid gap-4">
                  {snapshot?.pieces?.map((piece, index) => (
                    <article key={piece.id || index} className="overflow-hidden rounded-[30px] border border-white/8 bg-[#131210]">
                      <div className="grid gap-0 md:grid-cols-[96px_minmax(0,1fr)]">
                        <div className="flex items-center justify-center border-b border-white/6 px-6 py-6 md:border-b-0 md:border-r">
                          <div className="font-display text-4xl text-[#b8976a]">{String(index + 1).padStart(2, '0')}</div>
                        </div>
                        <div className="px-6 py-6">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <h3 className="text-2xl text-[#f4efe8]">{piece.name || 'Peça'}</h3>
                              <div className="mt-3 flex flex-wrap gap-2 text-sm text-[#d5c5b3]">
                                {piece.environment && <span className="rounded-full border border-white/8 px-3 py-1.5">{piece.environment}</span>}
                                {piece.dimensionsLabel && <span className="rounded-full border border-white/8 px-3 py-1.5">{piece.dimensionsLabel}</span>}
                                {piece.material && <span className="rounded-full border border-white/8 px-3 py-1.5">{piece.material}</span>}
                              </div>
                            </div>
                            {piece.imageUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  const matchedIndex = gallery.findIndex((item) => item.src === piece.imageUrl);
                                  setLightboxIndex(matchedIndex >= 0 ? matchedIndex : 0);
                                }}
                                className="inline-flex items-center gap-2 rounded-full border border-[#b8976a]/20 px-4 py-2 text-xs uppercase tracking-[0.22em] text-[#e8dccf] transition hover:border-[#d4b48a]/40 hover:text-white"
                              >
                                Ver imagem
                              </button>
                            )}
                          </div>
                          {piece.notes && <p className="mt-5 text-sm leading-7 text-[#bba996]">{piece.notes}</p>}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {snapshot?.material && (
          <section id="material" className="border-t border-white/6 px-5 py-16 sm:py-20">
            <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
              <div className="overflow-hidden rounded-[34px] border border-white/8 bg-[#131210] p-4 shadow-[0_25px_70px_rgba(0,0,0,0.28)]">
                <div className="overflow-hidden rounded-[28px] bg-[#181512]">
                  <PresentationImage
                    src={snapshot.material.imageUrl}
                    alt={snapshot.material.name || 'Material'}
                    className="h-[360px] w-full object-cover sm:h-[520px]"
                  />
                  {!snapshot.material.imageUrl && (
                    <div className="flex h-[360px] items-center justify-center text-sm text-[#baa892] sm:h-[520px]">
                      Material selecionado para o projeto
                    </div>
                  )}
                </div>
              </div>

              <div>
                <SectionEyebrow>Material selecionado</SectionEyebrow>
                <SectionTitle>{snapshot.material.name || 'Superfície escolhida'}</SectionTitle>
                <div className="mt-6 flex flex-wrap gap-3 text-sm text-[#f0e6dc]">
                  {[snapshot.material.category, snapshot.material.materialLine, snapshot.material.materialType, snapshot.material.thicknessLabel, snapshot.material.texture]
                    .filter(Boolean)
                    .map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-white/5 px-4 py-2">{item}</span>
                    ))}
                </div>
                {snapshot.material.description && (
                  <p className="mt-8 max-w-2xl text-base leading-8 text-[#d6c6b4]">{snapshot.material.description}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {includedItems.length > 0 && (
          <section id="inclusos" className="border-t border-white/6 px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl">
              <SectionEyebrow>O que está incluso</SectionEyebrow>
              <SectionTitle>Itens contemplados nesta proposta comercial.</SectionTitle>
              <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {includedItems.map((item) => (
                  <div key={item.key} className="rounded-[28px] border border-white/8 bg-[#131210] px-5 py-5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#b8976a]/12 text-[#d4b48a]">
                        <Check className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-lg text-[#f4efe8]">{item.title}</div>
                        <p className="mt-2 text-sm leading-7 text-[#c7b6a2]">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionEyebrow>Etapas do seu projeto</SectionEyebrow>
            <SectionTitle>Um processo claro do início à finalização.</SectionTitle>
            <div className="mt-10 grid gap-4 lg:grid-cols-4">
              {projectSteps.map((step) => (
                <div key={step.step} className="rounded-[28px] border border-white/8 bg-[#131210] px-5 py-6">
                  <div className="font-display text-4xl text-[#b8976a]">{step.step}</div>
                  <div className="mt-6 text-xl text-[#f4efe8]">{step.title}</div>
                  <p className="mt-3 text-sm leading-7 text-[#c6b6a2]">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="investimento" className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
            <div className="rounded-[36px] border border-[#b8976a]/18 bg-[#131210] px-6 py-8 shadow-[0_30px_90px_rgba(0,0,0,0.3)] sm:px-8 sm:py-10">
              <SectionEyebrow>Investimento</SectionEyebrow>
              <div className="mt-6 font-display text-5xl text-[#f4efe8] sm:text-6xl">{formatCurrency(investment?.totalPrice || 0)}</div>
              <div className="mt-4 max-w-2xl text-base leading-8 text-[#d4c4b2]">
                {investment?.description || 'Valor final consolidado desta proposta comercial.'}
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {investment?.totalArea ? (
                  <div className="rounded-[26px] border border-white/8 bg-[#171512] px-5 py-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-[#b8976a]">Área final</div>
                    <div className="mt-2 text-xl text-[#f4efe8]">{formatArea(investment.totalArea)}</div>
                  </div>
                ) : null}
                <div className="rounded-[26px] border border-white/8 bg-[#171512] px-5 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#b8976a]">Validade</div>
                  <div className="mt-2 text-xl text-[#f4efe8]">{formatDateShort(availablePayload.meta.validUntil) || '-'}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-5">
              <div id="condicoes" className="rounded-[30px] border border-white/8 bg-[#131210] px-6 py-7">
                <SectionEyebrow>Condições de pagamento</SectionEyebrow>
                <div className="mt-5 text-2xl text-[#f4efe8]">{paymentSummary || 'Condição comercial a confirmar com a D\'Coratto'}</div>
                {paymentDetails.length > 0 && (
                  <div className="mt-5 space-y-3 text-sm leading-7 text-[#d2c1ae]">
                    {paymentDetails.map((detail) => <div key={detail}>{detail}</div>)}
                  </div>
                )}
              </div>

              {(delivery?.deliveryDays || delivery?.deliveryDate || delivery?.measurementDate || delivery?.deliveryIncluded || delivery?.installationIncluded) && (
                <div className="rounded-[30px] border border-white/8 bg-[#131210] px-6 py-7">
                  <SectionEyebrow>Planejamento comercial</SectionEyebrow>
                  <div className="mt-5 space-y-3 text-sm leading-7 text-[#e8ddd2]">
                    {delivery?.measurementDate ? <div>Medição prevista para {formatDateLong(delivery.measurementDate)}.</div> : null}
                    {delivery?.deliveryDays ? <div>Prazo estimado de {delivery.deliveryDays} dias.</div> : null}
                    {delivery?.deliveryDate ? <div>Entrega estimada para {formatDateLong(delivery.deliveryDate)}.</div> : null}
                    {delivery?.deliveryIncluded ? <div>Entrega contemplada na composição comercial desta proposta.</div> : null}
                    {delivery?.installationIncluded ? <div>Instalação contemplada na composição comercial desta proposta.</div> : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {importantInfoItems.length > 0 && (
          <section className="border-t border-white/6 px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl">
              <SectionEyebrow>Informações importantes</SectionEyebrow>
              <SectionTitle>Condições e observações desta versão.</SectionTitle>
              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {importantInfoItems.map((item) => (
                  <div key={item} className="rounded-[28px] border border-white/8 bg-[#131210] px-5 py-5 text-sm leading-7 text-[#d9cbbe]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="aceite" className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_340px]">
            <div>
              <SectionEyebrow>{proposalAccepted ? 'Proposta aceita' : 'Pronto para iniciar seu projeto?'}</SectionEyebrow>
              <SectionTitle>{proposalAccepted ? 'Seu aceite já está registrado.' : 'Uma apresentação comercial pronta para sua decisão.'}</SectionTitle>
              <div className="mt-6 max-w-2xl text-base leading-8 text-[#d4c4b2]">
                {proposalAccepted
                  ? `Aceite registrado${acceptedDisplayName ? ` por ${acceptedDisplayName}` : ''} em ${formatDateLong(availablePayload.meta.acceptedAt)}.`
                  : 'Ao confirmar esta proposta, a versão pública preserva exatamente as condições comerciais exibidas aqui, incluindo valor final e validade.'}
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[28px] border border-white/8 bg-[#131210] px-5 py-5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#b8976a]">Investimento</div>
                  <div className="mt-3 font-display text-4xl text-[#f4efe8]">{formatCurrency(investment?.totalPrice || 0)}</div>
                </div>
                <div className="rounded-[28px] border border-white/8 bg-[#131210] px-5 py-5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#b8976a]">Proposta válida até</div>
                  <div className="mt-3 text-2xl text-[#f4efe8]">{formatDateShort(availablePayload.meta.validUntil) || '-'}</div>
                </div>
              </div>
              {acceptanceMessage && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
                  <CopyCheck className="h-4 w-4" />
                  {acceptanceMessage}
                </div>
              )}
            </div>

            <div className="rounded-[32px] border border-[#b8976a]/18 bg-[#131210] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
              {proposalAccepted ? (
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Proposta aceita
                  </div>
                  <div className="text-sm leading-7 text-[#d8caba]">
                    {acceptedDisplayName
                      ? `Aceita por ${acceptedDisplayName} em ${formatDateLong(availablePayload.meta.acceptedAt)}.`
                      : `Aceite registrado em ${formatDateLong(availablePayload.meta.acceptedAt)}.`}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">Aceite digital</div>
                  <div className="text-sm leading-7 text-[#d3c3b1]">
                    Confirme seu nome para registrar o aceite desta versão.
                  </div>
                  {confirming ? (
                    <>
                      <input
                        value={acceptedName}
                        onChange={(event) => setAcceptedName(event.target.value)}
                        placeholder="Seu nome completo"
                        className="w-full rounded-2xl border border-white/10 bg-[#171512] px-4 py-3 text-sm text-[#f4efe8] outline-none placeholder:text-[#8f7d67] focus:ring-2 focus:ring-[#b8976a]/25"
                      />
                      <button
                        type="button"
                        onClick={handleAccept}
                        disabled={accepting}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b8976a] px-4 py-3 text-sm font-semibold text-[#33291f] transition hover:bg-[#d4b48a] disabled:opacity-60"
                      >
                        {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        Confirmar aceite
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm text-[#d9c9b6]"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b8976a] px-4 py-3 text-sm font-semibold text-[#33291f] transition hover:bg-[#d4b48a]"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Aceitar proposta
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/6 px-5 py-10">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
          <div>
            <div className="font-display text-3xl text-[#f4efe8]">{company?.name || "D'Coratto Sob Medida"}</div>
            <div className="mt-3 text-sm leading-7 text-[#c7b7a4]">Soluções em Rochas e Superfícies Sob Medida</div>
            {snapshot?.summary?.responsible && (
              <div className="mt-5 text-sm text-[#e6dacd]">
                Responsável pela proposta: {snapshot.summary.responsible}
              </div>
            )}
          </div>
          <div className="space-y-3 text-sm text-[#d5c6b4] md:text-right">
            {company?.phone && <div className="flex items-center gap-2 md:justify-end"><Phone className="h-4 w-4 text-[#b8976a]" /> {company.phone}</div>}
            {company?.address && <div className="flex items-start gap-2 md:justify-end"><MapPin className="mt-1 h-4 w-4 shrink-0 text-[#b8976a]" /> <span className="whitespace-pre-line">{company.address}</span></div>}
            {availablePayload.meta.validUntil && <div className="flex items-center gap-2 md:justify-end"><CalendarClock className="h-4 w-4 text-[#b8976a]" /> Válida até {formatDateShort(availablePayload.meta.validUntil)}</div>}
          </div>
        </div>
      </footer>

      {lightboxIndex != null && gallery[lightboxIndex] && (
        <div className="proposal-print-hide fixed inset-0 z-50 bg-black/92 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-5 top-5 rounded-full border border-white/15 p-3 text-white transition hover:border-[#b8976a]/45"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex h-full items-center justify-center">
            {gallery.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex((current) => current == null ? current : (current - 1 + gallery.length) % gallery.length)}
                className="mr-3 rounded-full border border-white/15 p-3 text-white transition hover:border-[#b8976a]/45"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="w-full max-w-5xl">
              <PresentationImage src={gallery[lightboxIndex].src} alt={gallery[lightboxIndex].title} className="max-h-[78vh] w-full rounded-[24px] object-contain" />
              <div className="mt-5 flex items-center justify-between gap-4 text-sm text-white/80">
                <div>
                  <div className="font-medium text-white">{gallery[lightboxIndex].title}</div>
                  <div>{gallery[lightboxIndex].subtitle}</div>
                </div>
                <div>{lightboxIndex + 1} / {gallery.length}</div>
              </div>
            </div>
            {gallery.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex((current) => current == null ? current : (current + 1) % gallery.length)}
                className="ml-3 rounded-full border border-white/15 p-3 text-white transition hover:border-[#b8976a]/45"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
