import React, {useEffect, useMemo, useState} from 'react';
import {useParams} from 'react-router-dom';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CopyCheck,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import {acceptQuotePresentation, getPublicQuotePresentation, PublicQuotePresentationResponse, QuotePresentationSnapshot} from '../lib/quoteDigital';
import {cn, formatArea, formatCurrency} from '../lib/utils';

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  try {
    return format(new Date(value), "dd 'de' MMMM 'de' yyyy", {locale: ptBR});
  } catch {
    return '';
  }
};

const formatShortDate = (value?: string | null) => {
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
}: {
  title: string;
  description: string;
  company?: QuotePresentationSnapshot['company'];
}) => (
  <div className="flex min-h-screen items-center justify-center bg-[#0e0d0b] px-5 py-12 text-[#f4efe8]">
    <div className="w-full max-w-2xl rounded-[32px] border border-white/10 bg-[#131210] p-8 text-center shadow-2xl shadow-black/30">
      <div className="text-[11px] uppercase tracking-[0.34em] text-[#d4b48a]">{company?.name || "D'Coratto"}</div>
      <h1 className="mt-5 font-display text-4xl text-[#f4efe8]">{title}</h1>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#cbbfb0]">{description}</p>
      {(company?.phone || company?.email) && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-[#e7dccf]">
          {company?.phone && <span>{company.phone}</span>}
          {company?.email && <span>{company.email}</span>}
        </div>
      )}
    </div>
  </div>
);

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
  const gallery = useMemo(() => {
    if (!snapshot) return [];
    const items = [
      snapshot.material?.imageUrl
        ? {
          src: snapshot.material.imageUrl,
          title: snapshot.material.name || 'Material selecionado',
          subtitle: snapshot.material.category || 'Material',
        }
        : null,
      ...((snapshot.pieces || []).map((piece) => (
        piece.imageUrl
          ? {
            src: piece.imageUrl,
            title: piece.name || 'Peça',
            subtitle: piece.dimensionsLabel || piece.environment || '',
          }
          : null
      ))),
    ].filter(Boolean) as Array<{src: string; title: string; subtitle: string}>;

    return items.filter((item, index, array) => array.findIndex((entry) => entry.src === item.src) === index);
  }, [snapshot]);

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
      setAcceptanceMessage(`Proposta ${result.versionLabel} aceita em ${formatDateTime(result.acceptedAt)}.`);
      setConfirming(false);
      setPayload((current) => (
        current && current.state === 'available'
          ? {
            ...current,
            status: 'ACEITO',
            meta: {
              ...current.meta,
              acceptedAt: result.acceptedAt,
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
      <div className="min-h-screen bg-[#0e0d0b] px-5 py-12 text-[#f4efe8]">
        <div className="mx-auto max-w-6xl animate-pulse space-y-6">
          <div className="h-[58vh] rounded-[40px] border border-white/10 bg-[#131210]" />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-64 rounded-[32px] bg-[#131210]" />
            <div className="h-64 rounded-[32px] bg-[#131210]" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <PublicStatePanel title="Indisponível" description={error} />;
  }

  if (!payload || payload.state === 'missing') {
    return <PublicStatePanel title="Proposta não encontrada" description="Este link não corresponde a uma proposta disponível. Fale com a D'Coratto para receber uma nova versão." company={payload?.company} />;
  }

  if (payload.state === 'revoked') {
    return <PublicStatePanel title="Proposta revogada" description="Esta proposta não está mais disponível. Entre em contato com a D'Coratto para solicitar uma nova versão atualizada." company={payload.company} />;
  }

  if (payload.state === 'expired') {
    return <PublicStatePanel title="Proposta expirada" description="A validade desta proposta encerrou. A D'Coratto pode gerar uma nova versão comercial para você." company={payload.company} />;
  }

  const paymentSummary = snapshot?.payment?.method || snapshot?.payment?.totalPaymentMethod || snapshot?.payment?.remainingPaymentMethod;
  const noteBlocks = [snapshot?.notes?.commercialNotes, snapshot?.notes?.defaultNotes, snapshot?.payment?.notes].filter(Boolean) as string[];
  const investment = snapshot?.investment;
  const delivery = snapshot?.delivery;

  return (
    <div className="min-h-screen bg-[#0e0d0b] text-[#f4efe8]">
      <style>{`
        @media print {
          body { background: #ffffff !important; }
          .proposal-print-hide { display: none !important; }
          .proposal-print-shell { background: #ffffff !important; color: #1f1a16 !important; }
          .proposal-print-card { border-color: #d8c9b6 !important; background: #ffffff !important; box-shadow: none !important; }
        }
      `}</style>

      <header className="proposal-print-hide sticky top-0 z-30 border-b border-white/5 bg-[#0e0d0b]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.32em] text-[#d4b48a]">{company?.name || "D'Coratto"}</div>
          <nav className="hidden items-center gap-5 text-xs text-[#d8c8b5] md:flex">
            <a href="#projeto">Projeto</a>
            {snapshot?.material && <a href="#material">Material</a>}
            {gallery.length > 0 && <a href="#galeria">Peças</a>}
            <a href="#investimento">Investimento</a>
            <a href="#condicoes">Condições</a>
          </nav>
        </div>
      </header>

      <main className="proposal-print-shell">
        <section className="relative overflow-hidden px-5 pb-14 pt-10 sm:pt-14">
          <div className="mx-auto grid max-w-6xl gap-8 lg:min-h-[82vh] lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-end">
            <div className="flex flex-col justify-center">
              <div className="text-[11px] uppercase tracking-[0.34em] text-[#d4b48a]">{company?.name || "D'Coratto"}</div>
              <h1 className="mt-6 font-display text-5xl leading-none text-[#f4efe8] sm:text-6xl">{snapshot?.heroTitle || 'Proposta Personalizada'}</h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#d8c8b5]">{snapshot?.heroSubtitle || 'Apresentação comercial do seu projeto sob medida.'}</p>
              <div className="mt-8 grid gap-3 text-sm text-[#efe5da] sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/10 bg-[#131210] px-5 py-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">Cliente</div>
                  <div className="mt-2 font-medium">{snapshot?.client?.name || 'Cliente'}</div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-[#131210] px-5 py-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">Proposta</div>
                  <div className="mt-2 font-medium">{availablePayload.meta.proposalCode}</div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-[#131210] px-5 py-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">Gerada em</div>
                  <div className="mt-2 font-medium">{formatDateTime(snapshot?.generatedAt)}</div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-[#131210] px-5 py-4">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-[#b8976a]">Validade</div>
                  <div className="mt-2 font-medium">{formatDateTime(availablePayload.meta.validUntil)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[36px] border border-white/10 bg-[#131210] p-4 shadow-2xl shadow-black/30">
              <div className="overflow-hidden rounded-[28px] bg-[#1c1a17]">
                <PresentationImage
                  src={snapshot?.material?.imageUrl || gallery[0]?.src}
                  alt={snapshot?.material?.name || 'Projeto D\'Coratto'}
                  priority
                  className="h-[320px] w-full object-cover sm:h-[420px]"
                />
                {!snapshot?.material?.imageUrl && !gallery[0]?.src && (
                  <div className="flex h-[320px] items-center justify-center text-sm text-[#c5b7a6] sm:h-[420px]">
                    Proposta comercial D&apos;Coratto
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="projeto" className="px-5 py-10">
          <div className="mx-auto max-w-6xl rounded-[32px] border border-white/10 bg-[#131210] p-6 shadow-xl shadow-black/20 sm:p-8">
            <div className="grid gap-6 md:grid-cols-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Cliente</div>
                <div className="mt-3 text-base">{snapshot?.client?.name || 'Cliente'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Ambiente</div>
                <div className="mt-3 text-base">{snapshot?.summary?.environment || 'Projeto sob medida'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Cidade</div>
                <div className="mt-3 text-base">{snapshot?.client?.city || '-'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Validade</div>
                <div className="mt-3 text-base">{formatShortDate(availablePayload.meta.validUntil) || '-'}</div>
              </div>
            </div>
          </div>
        </section>

        {snapshot?.material && (
          <section id="material" className="px-5 py-10">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
              <div className="rounded-[32px] border border-white/10 bg-[#131210] p-4 shadow-xl shadow-black/20">
                <div className="overflow-hidden rounded-[26px] bg-[#1c1a17]">
                  <PresentationImage src={snapshot.material.imageUrl} alt={snapshot.material.name || 'Material'} className="h-[320px] w-full object-cover sm:h-[420px]" />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Material escolhido</div>
                <h2 className="mt-4 font-display text-4xl text-[#f4efe8]">{snapshot.material.name || 'Material selecionado'}</h2>
                {snapshot.material.description && (
                  <p className="mt-5 max-w-2xl text-base leading-8 text-[#d6c6b4]">{snapshot.material.description}</p>
                )}
                <div className="mt-6 flex flex-wrap gap-3 text-sm text-[#f0e6dc]">
                  {[snapshot.material.category, snapshot.material.materialLine, snapshot.material.materialType, snapshot.material.thicknessLabel, snapshot.material.texture]
                    .filter(Boolean)
                    .map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-white/5 px-4 py-2">{item}</span>
                    ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {(snapshot?.pieces?.length || 0) > 0 && (
          <section id="galeria" className="px-5 py-10">
            <div className="mx-auto max-w-6xl">
              <div className="mb-8">
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Seu projeto</div>
                <h2 className="mt-4 font-display text-4xl text-[#f4efe8]">Peças e composição comercial</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {(snapshot.pieces || []).map((piece, index) => (
                  <article key={piece.id || index} className="rounded-[30px] border border-white/10 bg-[#131210] p-4 shadow-lg shadow-black/20">
                    {piece.imageUrl ? (
                      <PresentationImage
                        src={piece.imageUrl}
                        alt={piece.name || 'Peça'}
                        onClick={() => {
                          const lightboxItemIndex = gallery.findIndex((item) => item.src === piece.imageUrl);
                          setLightboxIndex(lightboxItemIndex >= 0 ? lightboxItemIndex : 0);
                        }}
                        className="h-64 w-full rounded-[24px] object-cover"
                      />
                    ) : (
                      <div className="flex h-64 items-center justify-center rounded-[24px] bg-[#1c1a17] text-sm text-[#bfae99]">Sem imagem comercial</div>
                    )}
                    <div className="px-2 pb-2 pt-5">
                      <h3 className="text-xl font-semibold text-[#f4efe8]">{piece.name || 'Peça'}</h3>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-[#cdbba8]">
                        {piece.environment && <span>{piece.environment}</span>}
                        {piece.dimensionsLabel && <span>{piece.dimensionsLabel}</span>}
                        {piece.material && <span>{piece.material}</span>}
                      </div>
                      {piece.notes && <p className="mt-3 text-sm leading-7 text-[#b9aa98]">{piece.notes}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="investimento" className="px-5 py-10">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-[32px] border border-[#b8976a]/20 bg-[#131210] p-8 shadow-xl shadow-black/20">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Investimento</div>
              <div className="mt-5 font-display text-5xl text-[#f4efe8]">{formatCurrency(investment?.totalPrice || 0)}</div>
              <div className="mt-3 text-base text-[#d5c4b2]">{investment?.description || 'Valor consolidado da proposta comercial.'}</div>
              {investment?.totalArea ? (
                <div className="mt-5 text-sm text-[#b9aa98]">Área estimada: {formatArea(investment.totalArea)}</div>
              ) : null}
            </div>

            <div id="condicoes" className="grid gap-6">
              <div className="rounded-[32px] border border-white/10 bg-[#131210] p-8 shadow-xl shadow-black/20">
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Forma de pagamento</div>
                <div className="mt-4 text-xl text-[#f4efe8]">{paymentSummary || 'Condição comercial a confirmar com a D\'Coratto'}</div>
                {(snapshot?.payment?.entryAmount || snapshot?.payment?.installmentAmount || snapshot?.payment?.installmentCount) && (
                  <div className="mt-4 space-y-2 text-sm text-[#d4c3b0]">
                    {snapshot?.payment?.entryAmount ? <div>Entrada: {formatCurrency(snapshot.payment.entryAmount)}</div> : null}
                    {snapshot?.payment?.installmentCount ? <div>Parcelas: {snapshot.payment.installmentCount}x</div> : null}
                    {snapshot?.payment?.installmentAmount ? <div>Valor por parcela: {formatCurrency(snapshot.payment.installmentAmount)}</div> : null}
                  </div>
                )}
              </div>

              {(delivery?.deliveryDays || delivery?.deliveryDate || delivery?.deliveryIncluded || delivery?.installationIncluded) && (
                <div className="rounded-[32px] border border-white/10 bg-[#131210] p-8 shadow-xl shadow-black/20">
                  <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Entrega e instalação</div>
                  <div className="mt-4 space-y-2 text-sm leading-7 text-[#e8ddd2]">
                    {delivery?.deliveryDays ? <div>Prazo estimado: {delivery.deliveryDays} dias</div> : null}
                    {delivery?.deliveryDate ? <div>Data estimada: {formatDateTime(delivery.deliveryDate)}</div> : null}
                    {delivery?.deliveryIncluded ? <div>Entrega inclusa na condição comercial apresentada.</div> : null}
                    {delivery?.installationIncluded ? <div>Instalação inclusa na composição deste projeto.</div> : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {noteBlocks.length > 0 && (
          <section className="px-5 py-10">
            <div className="mx-auto max-w-6xl rounded-[32px] border border-white/10 bg-[#131210] p-8 shadow-xl shadow-black/20">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Informações importantes</div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {noteBlocks.map((note) => (
                  <div key={note} className="rounded-[24px] border border-white/8 bg-white/5 px-5 py-4 text-sm leading-7 text-[#ddcfc1]">{note}</div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="px-5 py-10">
          <div className="mx-auto max-w-6xl rounded-[36px] border border-[#b8976a]/25 bg-[#131210] p-8 shadow-2xl shadow-black/20 sm:p-10">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#b8976a]">Aceite digital</div>
                <h2 className="mt-4 font-display text-4xl text-[#f4efe8]">Confirmar esta proposta</h2>
                <p className="mt-4 max-w-2xl text-sm leading-8 text-[#d4c4b3]">
                  Ao confirmar, seu aceite fica registrado para esta versão da proposta, preservando exatamente as condições comerciais apresentadas aqui.
                </p>
                {acceptanceMessage && (
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
                    <CopyCheck className="h-4 w-4" />
                    {acceptanceMessage}
                  </div>
                )}
              </div>
              <div className="rounded-[28px] border border-white/10 bg-[#1c1a17] p-5">
                {availablePayload.meta.acceptedAt ? (
                  <div className="space-y-3 text-sm text-[#e9dfd4]">
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      Proposta aceita
                    </div>
                    <div>Aceite registrado em {formatDateTime(availablePayload.meta.acceptedAt)}.</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {confirming ? (
                      <>
                        <input
                          value={acceptedName}
                          onChange={(event) => setAcceptedName(event.target.value)}
                          placeholder="Seu nome"
                          className="w-full rounded-2xl border border-white/10 bg-[#131210] px-4 py-3 text-sm text-[#f4efe8] outline-none placeholder:text-[#907e69] focus:ring-2 focus:ring-[#b8976a]/25"
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
                        <button type="button" onClick={() => setConfirming(false)} className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm text-[#d9c9b6]">
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
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-[#d5c6b4] md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-display text-2xl text-[#f4efe8]">{company?.name || "D'Coratto"}</div>
            <div className="mt-2 text-[#bcae9c]">Apresentação comercial digital</div>
          </div>
          <div className="space-y-2 text-right">
            {company?.phone && <div className="flex items-center justify-end gap-2"><Phone className="h-4 w-4 text-[#b8976a]" /> {company.phone}</div>}
            {company?.address && <div className="flex items-center justify-end gap-2"><MapPin className="h-4 w-4 text-[#b8976a]" /> {company.address}</div>}
            {availablePayload.meta.validUntil && <div className="flex items-center justify-end gap-2"><CalendarClock className="h-4 w-4 text-[#b8976a]" /> Válida até {formatShortDate(availablePayload.meta.validUntil)}</div>}
          </div>
        </div>
      </footer>

      {lightboxIndex != null && gallery[lightboxIndex] && (
        <div className="proposal-print-hide fixed inset-0 z-50 bg-black/90 p-4 backdrop-blur-sm">
          <button type="button" onClick={() => setLightboxIndex(null)} className="absolute right-5 top-5 rounded-full border border-white/15 p-3 text-white">
            <X className="h-5 w-5" />
          </button>
          <div className="flex h-full items-center justify-center">
            <button type="button" onClick={() => setLightboxIndex((current) => current == null ? current : (current - 1 + gallery.length) % gallery.length)} className="mr-3 rounded-full border border-white/15 p-3 text-white">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="w-full max-w-5xl">
              <PresentationImage src={gallery[lightboxIndex].src} alt={gallery[lightboxIndex].title} className="max-h-[78vh] w-full rounded-[24px] object-contain" />
              <div className="mt-5 flex items-center justify-between text-sm text-white/80">
                <div>
                  <div className="font-medium text-white">{gallery[lightboxIndex].title}</div>
                  <div>{gallery[lightboxIndex].subtitle}</div>
                </div>
                <div>{lightboxIndex + 1} / {gallery.length}</div>
              </div>
            </div>
            <button type="button" onClick={() => setLightboxIndex((current) => current == null ? current : (current + 1) % gallery.length)} className="ml-3 rounded-full border border-white/15 p-3 text-white">
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
