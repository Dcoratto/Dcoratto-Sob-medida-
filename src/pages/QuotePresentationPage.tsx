import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useParams} from 'react-router-dom';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {
  CalendarClock,
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
import {
  acceptQuotePresentation,
  getPublicQuotePresentation,
  PublicQuotePresentationResponse,
  QuotePresentationSnapshot,
} from '../lib/quoteDigital';
import {
  buildQuotePaymentSimulationOptions,
  QuotePaymentMethodOption,
  resolveQuotePaymentSimulationBase,
} from '../lib/quotePaymentSimulation';
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

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return prefersReducedMotion;
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

const RevealBlock = ({
  children,
  className,
  delayMs = 0,
  reducedMotion = false,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  reducedMotion?: boolean;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {threshold: 0.18, rootMargin: '0px 0px -10% 0px'},
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0px)' : 'translateY(22px)',
        transition: reducedMotion
          ? 'none'
          : `opacity 620ms ease ${delayMs}ms, transform 620ms ease ${delayMs}ms`,
      }}
    >
      {children}
    </div>
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
}) => (
  <div className="min-h-screen bg-[#0f0d0b] px-5 py-8 text-[#f7f1ea]">
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center gap-8">
      <div className="inline-flex items-center gap-3 text-[11px] uppercase tracking-[0.34em] text-[#c9a46b]">
        <Sparkles className="h-4 w-4" />
        {company?.name || "D'Coratto Sob Medida"}
      </div>
      <div className="space-y-5">
        <h1 className="font-display text-5xl leading-none text-[#f7f1ea] sm:text-6xl">{title}</h1>
        <p className="max-w-2xl text-base leading-8 text-[#d6c6b3] sm:text-lg">{description}</p>
      </div>
      {versionLabel && (
        <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.24em] text-[#f0e6dc]">
          {versionLabel}
        </div>
      )}
    </div>
  </div>
);

const SectionEyebrow = ({children}: {children: React.ReactNode}) => (
  <div className="text-[11px] uppercase tracking-[0.34em] text-[#c9a46b]">{children}</div>
);

const SectionTitle = ({children}: {children: React.ReactNode}) => (
  <h2 className="mt-4 font-display text-4xl leading-tight text-[#f7f1ea] sm:text-5xl">{children}</h2>
);

const formatCurrencyInputDisplay = (value: number) => formatCurrency(Math.max(0, Number(value) || 0));

const parseCurrencyInputDigits = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
};

const normalizePresentationAreaValue = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const sanitized = raw.replace(/m²/ig, '').trim();
  const legacyFormattedMatch = sanitized.match(/^(\d+)\.(\d{3}),000$/);
  if (legacyFormattedMatch) {
    const legacyDecimalValue = Number(`${legacyFormattedMatch[1]}.${legacyFormattedMatch[2]}`);
    if (Number.isFinite(legacyDecimalValue)) return legacyDecimalValue;
  }

  if (sanitized.includes(',')) {
    const normalized = sanitized.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (/^\d+\.\d+$/.test(sanitized)) {
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (/^\d{1,3}(?:\.\d{3})+$/.test(sanitized)) {
    const parsed = Number(sanitized.replace(/\./g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const detectPaymentGroup = (methodName: string) => {
  const normalized = methodName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (normalized.includes('debito')) return 'debit';
  if (normalized.includes('credito') || /\d+\s*x/i.test(methodName)) return 'credit';
  if (normalized.includes('pix') || normalized.includes('avista') || normalized.includes('a vista')) return 'cash';
  return 'all';
};

const buildOfficialPaymentRows = (snapshot?: QuotePresentationSnapshot | null) => {
  if (!snapshot?.payment) return [];

  const rows: Array<{label: string; value: string; auxiliary?: string}> = [];
  const installmentCount = Number(snapshot.payment.installmentCount || 0);
  const installmentAmount = Number(snapshot.payment.installmentAmount || 0);
  const paymentMode = snapshot.payment.mode === 'entry' ? 'entry' : 'total';

  if (paymentMode === 'entry') {
    if (snapshot.payment.entryAmount) {
      rows.push({
        label: 'Entrada',
        value: formatCurrency(snapshot.payment.entryAmount),
      });
    }

    rows.push({
      label: 'Saldo',
      value: snapshot.payment.remainingPaymentMethod || 'A combinar',
      auxiliary: installmentCount > 1 && installmentAmount > 0
        ? `${installmentCount}x de ${formatCurrency(installmentAmount)}`
        : undefined,
    });

    return rows;
  }

  rows.push({
    label: 'Condição atual',
    value: snapshot.payment.totalPaymentMethod || snapshot.payment.method || 'A combinar',
    auxiliary: installmentCount > 1 && installmentAmount > 0
      ? `${installmentCount}x de ${formatCurrency(installmentAmount)}`
      : undefined,
  });

  return rows;
};

export const QuotePresentationPage: React.FC = () => {
  const {token = ''} = useParams();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [payload, setPayload] = useState<PublicQuotePresentationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulationEntryInput, setSimulationEntryInput] = useState('R$ 0,00');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'debit' | 'credit'>('all');
  const [selectedSimulationMethod, setSelectedSimulationMethod] = useState('');
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
        setError(err?.message || 'Nao foi possivel carregar a proposta agora.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!simulatorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSimulatorOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [simulatorOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen]);

  useEffect(() => {
    if (!simulatorOpen && !lightboxOpen) {
      return;
    }

    const scrollY = window.scrollY;
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      window.scrollTo({top: scrollY});
    };
  }, [lightboxOpen, simulatorOpen]);

  const availablePayload = payload?.state === 'available' ? payload : null;
  const snapshot = availablePayload?.snapshot;
  const company = snapshot?.company;
  const investment = snapshot?.investment;
  const delivery = snapshot?.delivery;
  const acceptedDisplayName = availablePayload?.meta.acceptedName || acceptedName;
  const proposalAccepted = Boolean(availablePayload?.meta.acceptedAt);
  const materialImage = snapshot?.material?.imageUrl;
  const generatedLabel = snapshot?.generatedAt ? formatDateLong(snapshot.generatedAt) : '';
  const validUntilLabel = availablePayload?.meta.validUntil ? formatDateLong(availablePayload.meta.validUntil) : '';
  const projectArea = normalizePresentationAreaValue(investment?.totalArea);

  const projectLocation = [snapshot?.client?.city, snapshot?.client?.neighborhood]
    .filter(Boolean)
    .join(' · ');

  const officialPaymentRows = useMemo(() => buildOfficialPaymentRows(snapshot), [snapshot]);

  const availablePaymentMethods = useMemo(
    () => (
      snapshot?.payment?.simulation?.availableMethods || []
    ).reduce((acc, method) => {
      const name = String(method.name || '').trim();
      if (!name) return acc;
      acc.push({
        name,
        adjustment: Number(method.adjustment || 0),
      });
      return acc;
    }, [] as QuotePaymentMethodOption[]),
    [snapshot?.payment?.simulation?.availableMethods],
  );

  const officialSimulationContext = useMemo(() => ({
    officialTotalPrice: Number(investment?.totalPrice || 0),
    officialPaymentMode: snapshot?.payment?.mode === 'entry' ? 'entry' : 'total',
    officialTotalPaymentMethod: snapshot?.payment?.totalPaymentMethod || snapshot?.payment?.method,
    officialRemainingPaymentMethod: snapshot?.payment?.remainingPaymentMethod,
    officialEntryAmount: snapshot?.payment?.entryAmount,
    paymentMode: snapshot?.payment?.mode === 'entry' ? 'entry' : 'total',
    totalPaymentMethod: snapshot?.payment?.totalPaymentMethod || snapshot?.payment?.method,
    remainingPaymentMethod: snapshot?.payment?.remainingPaymentMethod,
    entryAmount: snapshot?.payment?.entryAmount,
    commissionPercent: snapshot?.payment?.simulation?.commissionPercent,
    negotiationDiscountPercent: snapshot?.payment?.simulation?.negotiationDiscountPercent,
    rtPercent: snapshot?.payment?.simulation?.rtPercent,
    paymentMethods: availablePaymentMethods,
  }), [
    availablePaymentMethods,
    investment?.totalPrice,
    snapshot?.payment?.entryAmount,
    snapshot?.payment?.method,
    snapshot?.payment?.mode,
    snapshot?.payment?.remainingPaymentMethod,
    snapshot?.payment?.simulation?.commissionPercent,
    snapshot?.payment?.simulation?.negotiationDiscountPercent,
    snapshot?.payment?.simulation?.rtPercent,
    snapshot?.payment?.totalPaymentMethod,
  ]);

  const simulationBase = useMemo(
    () => resolveQuotePaymentSimulationBase(officialSimulationContext),
    [officialSimulationContext],
  );

  useEffect(() => {
    const initialEntryAmount = Number(snapshot?.payment?.entryAmount || 0);
    setSimulationEntryInput(formatCurrencyInputDisplay(initialEntryAmount));
  }, [snapshot?.payment?.entryAmount]);

  const requestedEntryAmount = useMemo(
    () => parseCurrencyInputDigits(simulationEntryInput),
    [simulationEntryInput],
  );

  const normalizedSimulationEntryAmount = useMemo(() => {
    if (!simulationBase) return 0;
    return Math.min(requestedEntryAmount, simulationBase.subtotalBeforeAdjustment);
  }, [requestedEntryAmount, simulationBase]);

  const simulationPaymentMode = normalizedSimulationEntryAmount > 0 ? 'entry' : 'total';
  const simulationBaseBalance = useMemo(
    () => Math.max(0, (simulationBase?.subtotalBeforeAdjustment || 0) - normalizedSimulationEntryAmount),
    [normalizedSimulationEntryAmount, simulationBase],
  );

  const simulationOptions = useMemo(
    () => buildQuotePaymentSimulationOptions({
      ...officialSimulationContext,
      simulationPaymentMode,
      simulationEntryAmount: normalizedSimulationEntryAmount,
    }),
    [
      normalizedSimulationEntryAmount,
      officialSimulationContext,
      simulationPaymentMode,
    ],
  );

  const filteredSimulationOptions = useMemo(() => {
    if (paymentFilter === 'all') return simulationOptions;
    return simulationOptions.filter((option) => detectPaymentGroup(option.methodName) === paymentFilter);
  }, [paymentFilter, simulationOptions]);

  useEffect(() => {
    if (!filteredSimulationOptions.length) {
      setSelectedSimulationMethod('');
      return;
    }

    const currentOption = filteredSimulationOptions.find((option) => option.isCurrent);
    setSelectedSimulationMethod((current) => {
      if (current && filteredSimulationOptions.some((option) => option.methodName === current)) return current;
      return currentOption?.methodName || filteredSimulationOptions[0].methodName;
    });
  }, [filteredSimulationOptions]);

  const selectedSimulation = filteredSimulationOptions.find((option) => option.methodName === selectedSimulationMethod)
    || filteredSimulationOptions[0]
    || null;

  const importantInfoItems = useMemo(() => {
    if (!snapshot) return [];
    return [
      snapshot.validUntil ? `Proposta válida até ${formatDateLong(snapshot.validUntil)}.` : null,
      snapshot.notes?.commercialNotes || null,
      snapshot.notes?.defaultNotes || null,
      snapshot.payment?.notes || null,
    ].filter(Boolean) as string[];
  }, [snapshot]);

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
      window.alert(err?.message || 'Nao foi possivel registrar o aceite agora.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0d0b] px-5 py-8 text-[#f7f1ea]">
        <div className="mx-auto max-w-6xl animate-pulse space-y-8">
          <div className="h-[72vh] rounded-[40px] bg-[#171411]" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="h-56 rounded-[32px] bg-[#171411]" />
            <div className="h-56 rounded-[32px] bg-[#171411]" />
            <div className="h-56 rounded-[32px] bg-[#171411]" />
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

  return (
    <div className="min-h-screen bg-[#0f0d0b] text-[#f7f1ea]">
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
          .proposal-print-shell { background: #ffffff !important; color: #201913 !important; }
        }
      `}</style>

      <header className="proposal-print-hide sticky top-0 z-40 border-b border-white/6 bg-[#0f0d0b]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-[11px] uppercase tracking-[0.34em] text-[#c9a46b]">{company?.name || "D'Coratto Sob Medida"}</div>
            <div className="mt-1 truncate text-sm text-[#dbcbb9]">{availablePayload.meta.proposalCode}</div>
          </div>
          <div className="hidden items-center gap-4 text-xs text-[#dbcbb9] md:flex">
            <a href="#material" className="transition hover:text-white">Material</a>
            <a href="#projeto" className="transition hover:text-white">Projeto</a>
            <a href="#investimento" className="transition hover:text-white">Investimento</a>
            <a href="#aceite" className="transition hover:text-white">{proposalAccepted ? 'Aceite' : 'Responder'}</a>
          </div>
          <a
            href="#aceite"
            className="inline-flex items-center gap-2 rounded-full border border-[#c9a46b]/22 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-[#f0e6dc] transition hover:border-[#e1bd89]/45 hover:text-white"
          >
            {proposalAccepted ? 'Aceita' : 'Aceitar'}
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main className="proposal-print-shell">
        <section className="relative overflow-hidden px-5 pb-20 pt-10 sm:pt-14">
          <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top,_rgba(225,198,164,0.18),_transparent_58%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-10 lg:min-h-[86vh] lg:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)] lg:items-center">
            <div className="flex flex-col justify-center">
              <RevealBlock reducedMotion={prefersReducedMotion}>
                <div className="inline-flex items-center gap-4">
                  {company?.logoUrl ? (
                    <PresentationImage
                      src={company.logoUrl}
                      alt={company.name || "D'Coratto Sob Medida"}
                      priority
                      className="h-12 w-auto object-contain sm:h-14"
                    />
                  ) : (
                    <div className="rounded-full border border-[#c9a46b]/18 bg-white/5 px-4 py-3 text-[11px] uppercase tracking-[0.36em] text-[#c9a46b]">
                      D'Coratto
                    </div>
                  )}
                </div>
              </RevealBlock>

              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={300} className="mt-8">
                <h1 className="max-w-4xl font-display text-5xl leading-none text-[#f7f1ea] sm:text-6xl lg:text-[5.6rem]">
                  {snapshot?.client?.name || 'Cliente'}
                </h1>
              </RevealBlock>

              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={500} className="mt-6">
                <p className="max-w-2xl text-base leading-8 text-[#d7c7b5] sm:text-lg">
                  Proposta desenvolvida especialmente para o seu projeto.
                </p>
              </RevealBlock>

              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={700} className="mt-8">
                <div className="flex flex-wrap gap-3 text-sm text-[#e9ddd1]">
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                    {availablePayload.meta.proposalCode} · {availablePayload.meta.versionLabel}
                  </span>
                  {generatedLabel ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">{generatedLabel}</span>
                  ) : null}
                  {validUntilLabel ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Válida até {validUntilLabel}</span>
                  ) : null}
                </div>
              </RevealBlock>

              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={820} className="mt-10">
                <div className="flex flex-wrap gap-3">
                  <a
                    href="#investimento"
                    className="inline-flex items-center gap-2 rounded-full bg-[#e1c6a4] px-5 py-3 text-sm font-semibold text-[#3a2d22] transition duration-200 hover:bg-[#f0d8b8] motion-reduce:transition-none"
                  >
                    Ver investimento
                    <ChevronRight className="h-4 w-4" />
                  </a>
                  {simulationOptions.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSimulatorOpen(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-[#f0e6dc] transition duration-200 hover:border-[#e1c6a4]/42 hover:bg-white/8 motion-reduce:transition-none"
                    >
                      Simule as formas de pagamento
                    </button>
                  ) : null}
                </div>
              </RevealBlock>
            </div>

            <RevealBlock reducedMotion={prefersReducedMotion} delayMs={220} className="lg:justify-self-end">
              <div className="rounded-[36px] border border-white/8 bg-[#15120f] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.34)]">
                <div className="rounded-[30px] border border-white/8 bg-[#1a1714] p-6">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#c9a46b]">Proposta comercial</div>
                  <div className="mt-5 space-y-5">
                    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Código</div>
                      <div className="mt-2 text-lg text-[#f7f1ea]">{availablePayload.meta.proposalCode}</div>
                    </div>
                    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Versão</div>
                      <div className="mt-2 text-lg text-[#f7f1ea]">{availablePayload.meta.versionLabel}</div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Ambiente</div>
                        <div className="mt-2 text-base leading-7 text-[#f7f1ea]">
                          {snapshot?.summary?.environment || snapshot?.heroSubtitle || 'Projeto sob medida'}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Local</div>
                        <div className="mt-2 text-base leading-7 text-[#f7f1ea]">{projectLocation || snapshot?.client?.city || '-'}</div>
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Próximos passos</div>
                      <div className="mt-2 text-sm leading-7 text-[#d7c7b5]">
                        Revise o material selecionado, confira a metragem do projeto e explore as condições no simulador antes do aceite.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </RevealBlock>
          </div>
        </section>

        <section id="material" className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
            {materialImage ? (
              <RevealBlock reducedMotion={prefersReducedMotion}>
                <div className="group overflow-hidden rounded-[34px] border border-white/8 bg-[#15120f] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
                  <div className="overflow-hidden rounded-[28px] bg-[#1a1714]">
                    <PresentationImage
                      src={materialImage}
                      alt={snapshot?.material?.name || 'Material selecionado'}
                      className={cn(
                        'h-[360px] w-full object-cover transition duration-500 group-hover:scale-[1.02]',
                        prefersReducedMotion && 'transition-none group-hover:scale-100',
                      )}
                      onClick={() => setLightboxOpen(true)}
                    />
                  </div>
                </div>
              </RevealBlock>
            ) : null}

            <RevealBlock reducedMotion={prefersReducedMotion} delayMs={80}>
              <SectionEyebrow>Material selecionado</SectionEyebrow>
              <SectionTitle>{snapshot?.material?.name || 'Superfície escolhida'}</SectionTitle>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-[#f0e6dc]">
                {[
                  snapshot?.material?.category,
                  snapshot?.material?.materialLine,
                  snapshot?.material?.materialType,
                  snapshot?.material?.thicknessLabel,
                  snapshot?.material?.texture,
                ].filter(Boolean).map((item) => (
                  <span key={item} className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                    {item}
                  </span>
                ))}
              </div>
              {snapshot?.material?.description ? (
                <p className="mt-8 max-w-2xl text-base leading-8 text-[#d6c6b4]">{snapshot.material.description}</p>
              ) : null}
            </RevealBlock>
          </div>
        </section>

        <section id="projeto" className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <RevealBlock reducedMotion={prefersReducedMotion}>
              <SectionEyebrow>Seu projeto</SectionEyebrow>
              <SectionTitle>Ambiente e metragem apresentados com clareza.</SectionTitle>
            </RevealBlock>

            <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)_minmax(280px,0.8fr)]">
              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={40}>
                <div className="rounded-[30px] border border-white/8 bg-[#15120f] px-6 py-7">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#c9a46b]">Ambiente</div>
                  <div className="mt-4 font-display text-4xl text-[#f7f1ea]">{snapshot?.summary?.environment || snapshot?.heroSubtitle || 'Projeto sob medida'}</div>
                </div>
              </RevealBlock>

              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={100}>
                <div className="rounded-[30px] border border-white/8 bg-[#15120f] px-6 py-7">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#c9a46b]">Área do projeto</div>
                  <div className="mt-4 font-display text-4xl text-[#f7f1ea]">{formatArea(projectArea)}</div>
                </div>
              </RevealBlock>

              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={160}>
                <div className="rounded-[30px] border border-white/8 bg-[#15120f] px-6 py-7">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#c9a46b]">Local</div>
                  <div className="mt-4 text-lg leading-8 text-[#f7f1ea]">{projectLocation || snapshot?.client?.city || '-'}</div>
                </div>
              </RevealBlock>
            </div>
          </div>
        </section>

        <section id="investimento" className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.06fr)_minmax(360px,0.94fr)]">
            <RevealBlock reducedMotion={prefersReducedMotion}>
              <div className="rounded-[36px] border border-[#e1c6a4]/18 bg-[#15120f] px-6 py-8 shadow-[0_30px_90px_rgba(0,0,0,0.3)] sm:px-8 sm:py-10">
                <SectionEyebrow>Investimento</SectionEyebrow>
                <div className="mt-6 font-display text-5xl text-[#f7f1ea] sm:text-6xl">{formatCurrency(investment?.totalPrice || 0)}</div>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[#d4c4b2]">
                  Este é o valor oficial desta proposta, fiel ao orçamento salvo e à versão pública compartilhada.
                </p>
              </div>
            </RevealBlock>

            <div className="grid gap-5">
              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={60}>
                <div className="rounded-[30px] border border-white/8 bg-[#15120f] px-6 py-7">
                  <SectionEyebrow>Condições financeiras</SectionEyebrow>
                  <div className="mt-6 space-y-4">
                    {officialPaymentRows.map((row) => (
                      <div key={row.label} className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">{row.label}</div>
                        <div className="mt-2 text-xl text-[#f7f1ea]">{row.value}</div>
                        {row.auxiliary ? <div className="mt-2 text-sm text-[#ccbba7]">{row.auxiliary}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </RevealBlock>

              <RevealBlock reducedMotion={prefersReducedMotion} delayMs={120}>
                <div className="rounded-[30px] border border-white/8 bg-[#15120f] px-6 py-7">
                  <SectionEyebrow>Planejamento</SectionEyebrow>
                  <div className="mt-5 space-y-3 text-sm leading-7 text-[#e6dacc]">
                    {delivery?.deliveryDays ? <div>Prazo estimado de {delivery.deliveryDays} dias.</div> : null}
                    {delivery?.measurementDate ? <div>Medição prevista para {formatDateLong(delivery.measurementDate)}.</div> : null}
                    {delivery?.deliveryDate ? <div>Entrega estimada para {formatDateLong(delivery.deliveryDate)}.</div> : null}
                    {delivery?.deliveryIncluded ? <div>Entrega contemplada nesta proposta.</div> : null}
                    {delivery?.installationIncluded ? <div>Instalação contemplada nesta proposta.</div> : null}
                    {!delivery?.deliveryDays && !delivery?.measurementDate && !delivery?.deliveryDate && !delivery?.deliveryIncluded && !delivery?.installationIncluded ? (
                      <div>Os prazos e condições logísticas permanecem conforme a proposta comercial vigente.</div>
                    ) : null}
                  </div>
                </div>
              </RevealBlock>
            </div>
          </div>
        </section>

        <section id="simulador" className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <RevealBlock reducedMotion={prefersReducedMotion}>
              <SectionEyebrow>Simule as formas de pagamento</SectionEyebrow>
              <SectionTitle>Veja como esta proposta se comporta em outras condições.</SectionTitle>
              <p className="mt-6 max-w-2xl text-base leading-8 text-[#d6c6b4]">
                A simulação reutiliza a mesma lógica financeira oficial do orçamento e não altera esta proposta.
              </p>
            </RevealBlock>

            <RevealBlock reducedMotion={prefersReducedMotion} delayMs={100}>
              <div className="rounded-[30px] border border-[#e1c6a4]/14 bg-[#15120f] px-6 py-7">
                <div className="text-[11px] uppercase tracking-[0.26em] text-[#c9a46b]">Simulação</div>
                <div className="mt-4 text-sm leading-7 text-[#dacbbc]">
                  {simulationOptions.length > 0
                    ? 'Abra o simulador para comparar Pix, parcelamentos e demais condições disponíveis nesta versão.'
                    : 'Esta versão pública não possui regras de simulação congeladas o suficiente para comparar outras condições com segurança.'}
                </div>
                <button
                  type="button"
                  onClick={() => setSimulatorOpen(true)}
                  disabled={simulationOptions.length === 0}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#e1c6a4] px-5 py-3 text-sm font-semibold text-[#3a2d22] transition hover:bg-[#f0d8b8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Simule as formas de pagamento
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </RevealBlock>
          </div>
        </section>

        {importantInfoItems.length > 0 && (
          <section className="border-t border-white/6 px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl">
              <RevealBlock reducedMotion={prefersReducedMotion}>
                <SectionEyebrow>Informações importantes</SectionEyebrow>
                <SectionTitle>Condições e observações desta versão.</SectionTitle>
              </RevealBlock>
              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {importantInfoItems.map((item, index) => (
                  <RevealBlock reducedMotion={prefersReducedMotion} delayMs={index * 60}>
                    <div className="rounded-[28px] border border-white/8 bg-[#15120f] px-5 py-5 text-sm leading-7 text-[#dacbbc]">
                      {item}
                    </div>
                  </RevealBlock>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="aceite" className="border-t border-white/6 px-5 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.08fr)_360px]">
            <RevealBlock reducedMotion={prefersReducedMotion}>
              <SectionEyebrow>{proposalAccepted ? 'Proposta aceita' : 'Pronto para iniciar seu projeto?'}</SectionEyebrow>
              <SectionTitle>{proposalAccepted ? 'Seu aceite já está registrado.' : 'Aceite esta proposta quando estiver pronto.'}</SectionTitle>
              <div className="mt-6 max-w-2xl text-base leading-8 text-[#d4c4b2]">
                {proposalAccepted
                  ? `Aceite registrado${acceptedDisplayName ? ` por ${acceptedDisplayName}` : ''} em ${formatDateLong(availablePayload.meta.acceptedAt)}.`
                  : 'Ao confirmar, esta versão pública preserva exatamente as condições comerciais exibidas aqui.'}
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[28px] border border-white/8 bg-[#15120f] px-5 py-5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Valor oficial</div>
                  <div className="mt-3 font-display text-4xl text-[#f7f1ea]">{formatCurrency(investment?.totalPrice || 0)}</div>
                </div>
                <div className="rounded-[28px] border border-white/8 bg-[#15120f] px-5 py-5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Validade</div>
                  <div className="mt-3 text-2xl text-[#f7f1ea]">{formatDateShort(availablePayload.meta.validUntil) || '-'}</div>
                </div>
              </div>
              {acceptanceMessage && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
                  <CopyCheck className="h-4 w-4" />
                  {acceptanceMessage}
                </div>
              )}
            </RevealBlock>

            <RevealBlock reducedMotion={prefersReducedMotion} delayMs={120}>
              <div className="rounded-[32px] border border-[#e1c6a4]/18 bg-[#15120f] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
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
                    <div className="text-[11px] uppercase tracking-[0.26em] text-[#c9a46b]">Aceite digital</div>
                    <div className="text-sm leading-7 text-[#d3c3b1]">
                      Confirme seu nome para registrar o aceite desta versão.
                    </div>
                    {confirming ? (
                      <>
                        <input
                          value={acceptedName}
                          onChange={(event) => setAcceptedName(event.target.value)}
                          placeholder="Seu nome completo"
                          className="w-full rounded-2xl border border-white/10 bg-[#1b1714] px-4 py-3 text-sm text-[#f7f1ea] outline-none placeholder:text-[#8f7d67] focus:ring-2 focus:ring-[#e1c6a4]/25"
                        />
                        <button
                          type="button"
                          onClick={handleAccept}
                          disabled={accepting}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e1c6a4] px-4 py-3 text-sm font-semibold text-[#3a2d22] transition hover:bg-[#f0d8b8] disabled:opacity-60"
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
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e1c6a4] px-4 py-3 text-sm font-semibold text-[#3a2d22] transition hover:bg-[#f0d8b8]"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Aceitar proposta
                      </button>
                    )}
                  </div>
                )}
              </div>
            </RevealBlock>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/6 px-5 py-10">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
          <div>
            <div className="font-display text-3xl text-[#f7f1ea]">{company?.name || "D'Coratto Sob Medida"}</div>
            <div className="mt-3 text-sm leading-7 text-[#c7b7a4]">Soluções em Rochas e Superfícies Sob Medida</div>
            {snapshot?.summary?.responsible && (
              <div className="mt-5 text-sm text-[#e6dacd]">
                Responsável pela proposta: {snapshot.summary.responsible}
              </div>
            )}
          </div>
          <div className="space-y-3 text-sm text-[#d5c6b4] md:text-right">
            {company?.phone && <div className="flex items-center gap-2 md:justify-end"><Phone className="h-4 w-4 text-[#c9a46b]" /> {company.phone}</div>}
            {company?.address && <div className="flex items-start gap-2 md:justify-end"><MapPin className="mt-1 h-4 w-4 shrink-0 text-[#c9a46b]" /> <span className="whitespace-pre-line">{company.address}</span></div>}
            {availablePayload.meta.validUntil && <div className="flex items-center gap-2 md:justify-end"><CalendarClock className="h-4 w-4 text-[#c9a46b]" /> Válida até {formatDateShort(availablePayload.meta.validUntil)}</div>}
          </div>
        </div>
      </footer>

      {materialImage && lightboxOpen && (
        <div className="proposal-print-hide fixed inset-0 z-50 bg-black/92 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-5 top-5 rounded-full border border-white/15 p-3 text-white transition hover:border-[#e1c6a4]/45"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex h-full items-center justify-center">
            <div className="w-full max-w-5xl">
              <PresentationImage src={materialImage} alt={snapshot?.material?.name || 'Material'} className="max-h-[80vh] w-full rounded-[24px] object-contain" />
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          'proposal-print-hide fixed inset-0 z-50 bg-black/60 transition-opacity duration-300',
          simulatorOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          prefersReducedMotion && 'transition-none',
        )}
        onClick={() => setSimulatorOpen(false)}
      />

      <aside
        className={cn(
          'proposal-print-hide fixed inset-x-0 bottom-0 z-[60] rounded-t-[32px] border border-white/8 bg-[#15120f] shadow-[0_-24px_60px_rgba(0,0,0,0.45)] transition duration-300 lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[460px] lg:rounded-none lg:border-l',
          simulatorOpen ? 'translate-y-0 lg:translate-x-0' : 'translate-y-full lg:translate-x-full lg:translate-y-0',
          prefersReducedMotion && 'transition-none',
        )}
        style={{
          top: 'max(env(safe-area-inset-top), 12px)',
          maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)',
        }}
        aria-hidden={!simulatorOpen}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-white/8 px-5 pb-4 pt-4">
            <div className="mb-3 flex items-center justify-center lg:hidden">
              <div className="h-1.5 w-14 rounded-full bg-white/10" />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.26em] text-[#c9a46b]">Simule sua condição</div>
                <div className="mt-2 text-sm text-[#d8c8b5]">Valor oficial da proposta</div>
                <div className="mt-1 text-2xl text-[#f7f1ea]">{formatCurrency(investment?.totalPrice || 0)}</div>
              </div>
              <button
                type="button"
                onClick={() => setSimulatorOpen(false)}
                className="rounded-full border border-white/10 p-3 text-[#f7f1ea]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 [padding-bottom:calc(env(safe-area-inset-bottom)+1.25rem)]">
            {simulationOptions.length > 0 ? (
              <div className="space-y-6">
                <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Entrada</div>
                  <div className="mt-4 space-y-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={simulationEntryInput}
                      onChange={(event) => setSimulationEntryInput(formatCurrencyInputDisplay(parseCurrencyInputDigits(event.target.value)))}
                      placeholder="R$ 0,00"
                      className="w-full rounded-[18px] border border-white/10 bg-[#1a1714] px-4 py-3 text-lg text-[#f7f1ea] outline-none placeholder:text-[#8f7d67] focus:border-[#e1c6a4]/35"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[18px] border border-white/8 bg-[#1a1714] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[#c9a46b]">Entrada aplicada</div>
                        <div className="mt-2 text-lg text-[#f7f1ea]">{formatCurrency(normalizedSimulationEntryAmount)}</div>
                      </div>
                      <div className="rounded-[18px] border border-white/8 bg-[#1a1714] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[#c9a46b]">Saldo base</div>
                        <div className="mt-2 text-lg text-[#f7f1ea]">{formatCurrency(simulationBaseBalance)}</div>
                      </div>
                    </div>
                    {simulationBase && requestedEntryAmount > simulationBase.subtotalBeforeAdjustment ? (
                      <div className="text-xs leading-6 text-[#cab8a4]">
                        A entrada foi limitada ao saldo base real desta proposta para manter a simulação fiel ao motor oficial.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Formas disponíveis</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        {value: 'all' as const, label: 'Todas'},
                        {value: 'cash' as const, label: 'À vista'},
                        {value: 'debit' as const, label: 'Débito'},
                        {value: 'credit' as const, label: 'Crédito'},
                      ].map((filter) => (
                        <button
                          key={filter.value}
                          type="button"
                          onClick={() => setPaymentFilter(filter.value)}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] transition',
                            paymentFilter === filter.value
                              ? 'border-[#e1c6a4]/45 bg-[#201a15] text-[#f7f1ea]'
                              : 'border-white/10 bg-[#1a1714] text-[#cab8a4]',
                          )}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {filteredSimulationOptions.map((option) => (
                      <button
                        key={option.methodName}
                        type="button"
                        onClick={() => setSelectedSimulationMethod(option.methodName)}
                        className={cn(
                          'w-full rounded-[22px] border px-4 py-4 text-left transition',
                          option.methodName === selectedSimulation?.methodName
                            ? 'border-[#e1c6a4]/55 bg-[#201a15]'
                            : 'border-white/8 bg-[#1a1714] hover:border-[#e1c6a4]/28',
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-base text-[#f7f1ea]">{option.methodName}</div>
                            {option.entryAmount > 0 ? (
                              <div className="mt-2 text-sm text-[#cab8a4]">Entrada: {formatCurrency(option.entryAmount)}</div>
                            ) : null}
                            <div className="mt-1 text-sm text-[#cab8a4]">
                              {option.installmentCount > 1
                                ? `${option.installmentCount}x de ${formatCurrency(option.installmentAmount)}`
                                : `Total nesta condição: ${formatCurrency(option.totalPrice)}`}
                            </div>
                            {option.entryAmount > 0 ? (
                              <div className="mt-1 text-xs text-[#bca792]">Saldo base: {formatCurrency(option.financedAmount)}</div>
                            ) : null}
                          </div>
                          {option.isCurrent ? (
                            <span className="rounded-full border border-[#e1c6a4]/24 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[#f1dfca]">
                              Atual
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                    {!filteredSimulationOptions.length ? (
                      <div className="rounded-[18px] border border-dashed border-white/10 bg-[#1a1714] px-4 py-4 text-sm leading-7 text-[#cab8a4]">
                        Nenhuma forma disponível para este filtro.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5 text-sm leading-7 text-[#dacbbc]">
                Esta versão não possui dados suficientes para uma simulação segura sem recorrer às regras atuais do Admin, então o comparativo foi bloqueado para preservar a fidelidade financeira da proposta.
              </div>
            )}
          </div>

          {selectedSimulation ? (
            <div className="shrink-0 border-t border-white/8 bg-[#15120f] px-5 py-4 [padding-bottom:calc(env(safe-area-inset-bottom)+1rem)]">
              <div
                key={selectedSimulation.methodName}
                className={cn(
                  'rounded-[24px] border border-[#e1c6a4]/18 bg-[#1a1714] p-5 transition duration-300 ease-out',
                  prefersReducedMotion ? '' : 'animate-in fade-in slide-in-from-bottom-2',
                )}
              >
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#c9a46b]">Condição selecionada</div>
                <div className="mt-3 text-xl text-[#f7f1ea]">{selectedSimulation.methodName}</div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#c9a46b]">Entrada</div>
                    <div className="mt-2 text-lg text-[#f7f1ea]">{formatCurrency(selectedSimulation.entryAmount)}</div>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#c9a46b]">Saldo a financiar</div>
                    <div className="mt-2 text-lg text-[#f7f1ea]">{formatCurrency(selectedSimulation.financedAmount)}</div>
                  </div>
                </div>
                {selectedSimulation.installmentCount > 1 ? (
                  <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#c9a46b]">Parcelamento</div>
                    <div className="mt-2 text-lg text-[#f7f1ea]">
                      {selectedSimulation.installmentCount} parcelas de {formatCurrency(selectedSimulation.installmentAmount)}
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#c9a46b]">Total final nesta condição</div>
                  <div className="mt-2 font-display text-3xl text-[#f7f1ea]">{formatCurrency(selectedSimulation.totalPrice)}</div>
                </div>
                <p className="mt-4 text-sm leading-7 text-[#cab8a4]">
                  Simulação informativa. A proposta oficial continua preservada com o valor principal exibido nesta página.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
};
