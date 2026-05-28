import React, {useMemo, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {CalendarDays, ChevronRight, Eye, MapPin, Phone, Sparkles, X} from 'lucide-react';
import {formatCurrency} from '../../lib/utils';
import {PremiumPresentationSnapshot} from '../../lib/premiumProposal';

const reveal = {
  initial: {opacity: 0, y: 22, filter: 'blur(8px)'},
  whileInView: {opacity: 1, y: 0, filter: 'blur(0px)'},
  viewport: {once: true, amount: 0.28},
  transition: {duration: 0.75, ease: [0.22, 1, 0.36, 1]},
};

const safe = (value?: string) => value?.trim() || '-';

export const PremiumPresentationView: React.FC<{presentation: PremiumPresentationSnapshot}> = ({presentation}) => {
  const [lightbox, setLightbox] = useState<{src: string; alt: string} | null>(null);
  const pieceCount = presentation.pieces.length;
  const materialCount = presentation.materials.length;

  const coverImage =
    presentation.pieces.find((piece) => piece.pieceImageUrl)?.pieceImageUrl ||
    presentation.materials.find((material) => material.imageUrl)?.imageUrl ||
    presentation.companyLogoUrl ||
    '';

  const timeline = useMemo(() => [
    presentation.validityDate ? {label: 'Validade', value: presentation.validityDate, icon: CalendarDays} : null,
    presentation.deliveryDays ? {label: 'Prazo', value: `${presentation.deliveryDays} dias úteis`, icon: ChevronRight} : null,
    presentation.paymentMethod ? {label: 'Pagamento', value: presentation.paymentMethod, icon: Sparkles} : null,
  ].filter(Boolean) as Array<{label: string; value: string; icon: React.ComponentType<{className?: string}>}>, [presentation.deliveryDays, presentation.paymentMethod, presentation.validityDate]);

  return (
    <main className="premium-proposal min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(212,168,83,0.18),transparent_28%),linear-gradient(180deg,#090909_0%,#050505_45%,#080808_100%)]" />
      <div className="fixed inset-0 -z-10 opacity-70 [background-image:linear-gradient(115deg,transparent_0_22%,rgba(255,255,255,0.05)_23%,transparent_24_42%,rgba(212,168,83,0.14)_43%,transparent_45_74%,rgba(255,255,255,0.06)_75%,transparent_77_100%)]" />

      <section className="relative isolate overflow-hidden px-4 pb-20 pt-8 sm:px-6 md:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div {...reveal} className="premium-panel relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 sm:p-8 md:p-10">
            <div className="absolute inset-0 opacity-75 [background-image:radial-gradient(circle_at_20%_20%,rgba(212,168,83,0.16),transparent_22%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_20%)]" />
            <div className="relative grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#D4A853]/25 bg-[#D4A853]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[#D4A853]">
                  <Sparkles className="h-4 w-4" />
                  Apresentação premium
                </div>
                <div className="space-y-5">
                  <p className="text-xs font-bold uppercase tracking-[0.34em] text-white/35">{presentation.companyName}</p>
                  <h1 className="text-balance font-display text-4xl font-bold leading-[0.95] text-white sm:text-5xl md:text-6xl">
                    {presentation.clientName}
                  </h1>
                  <p className="max-w-2xl text-sm leading-relaxed text-white/58 sm:text-base">
                    Uma apresentação visual, clara e elegante para transmitir valor com sofisticação, mantendo as informações comerciais que fazem sentido para o cliente.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <MetricCard label="Valor final" value={formatCurrency(presentation.totalPrice)} highlight />
                  <MetricCard label="Peças" value={String(pieceCount)} />
                  <MetricCard label="Materiais" value={String(materialCount)} />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {timeline.map((item) => (
                    <div key={item.label} className="premium-panel rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[#D4A853]">
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-white/82">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="premium-panel overflow-hidden rounded-[28px] border border-white/10 bg-black/30 p-3">
                  <div className="overflow-hidden rounded-[22px] bg-[#0e0e0e]">
                    {coverImage ? (
                      <button type="button" onClick={() => setLightbox({src: coverImage, alt: presentation.clientName})} className="group relative block w-full">
                        <img src={coverImage} alt={presentation.clientName} className="h-[360px] w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
                        <span className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.26em] text-white/80 backdrop-blur">
                          <Eye className="h-3.5 w-3.5" />
                          Ampliar imagem
                        </span>
                      </button>
                    ) : (
                      <div className="flex h-[360px] items-center justify-center bg-[linear-gradient(135deg,#2d2418,#0f0f0f)] p-8 text-center">
                        <div>
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[#D4A853]">
                            <Sparkles className="h-7 w-7" />
                          </div>
                          <p className="mt-4 text-sm font-semibold text-white/72">Apresentação premium pronta para o cliente</p>
                          <p className="mt-2 text-xs leading-relaxed text-white/42">As imagens e materiais aparecem aqui quando estiverem definidos no orçamento.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <InfoChip icon={Phone} label="Contato" value={safe(presentation.clientPhone || presentation.companyPhone)} />
                  <InfoChip icon={MapPin} label="Endereço" value={safe(presentation.clientAddress || presentation.companyAddress)} />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 md:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <SectionHeading eyebrow="Materiais" title="Materiais escolhidos" description="Cada cartão mostra a imagem do material e as peças vinculadas a ele." />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {presentation.materials.map((material, index) => (
              <motion.article
                key={material.key}
                {...reveal}
                transition={{duration: 0.7, delay: index * 0.04, ease: [0.22, 1, 0.36, 1]}}
                className="premium-panel group overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035]"
              >
                <div className="aspect-[4/3] overflow-hidden bg-[#111]">
                  {material.imageUrl ? (
                    <button type="button" onClick={() => setLightbox({src: material.imageUrl || '', alt: material.name})} className="block h-full w-full">
                      <img src={material.imageUrl} alt={material.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
                    </button>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#e7e2d7,#9d9a93)] text-xs font-bold uppercase tracking-[0.24em] text-black/28">
                      Sem imagem cadastrada
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="text-lg font-bold text-white">{material.name}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.24em] text-white/38">{material.category}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {material.pieces.map((piece) => (
                      <span key={piece} className="rounded-full border border-white/8 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                        {piece}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.article>
            ))}
            {!presentation.materials.length && (
              <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8 text-sm text-white/45 md:col-span-2 xl:col-span-3">
                Nenhum material foi vinculado a esta apresentação.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 md:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <SectionHeading eyebrow="Peças" title="Peças da proposta" description="A proposta mantém a individualidade visual de cada peça, com imagem própria e material associado." />
          <div className="space-y-6">
            {presentation.pieces.map((piece, index) => (
              <motion.article
                key={piece.id}
                {...reveal}
                transition={{duration: 0.75, delay: index * 0.05, ease: [0.22, 1, 0.36, 1]}}
                className="premium-panel overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.035]"
              >
                <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="bg-black/30 p-4 sm:p-5">
                    <div className="overflow-hidden rounded-[24px] bg-[#121212]">
                      {piece.pieceImageUrl || piece.materialImageUrl ? (
                        <button type="button" onClick={() => setLightbox({src: piece.pieceImageUrl || piece.materialImageUrl || '', alt: piece.name})} className="group block h-full w-full">
                          <img src={piece.pieceImageUrl || piece.materialImageUrl || ''} alt={piece.name} className="h-[280px] w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
                        </button>
                      ) : (
                        <div className="flex h-[280px] items-center justify-center bg-[linear-gradient(135deg,#1b1b1b,#080808)] px-8 text-center text-xs font-bold uppercase tracking-[0.24em] text-white/28">
                          Imagem da peça em edição
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col justify-between p-5 sm:p-6 lg:p-7">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.34em] text-[#D4A853]">Peça {String(index + 1).padStart(2, '0')}</div>
                      <h3 className="mt-3 font-display text-3xl font-bold text-white">{piece.name}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-white/56">
                        {piece.dimensions} · {piece.materialName}
                      </p>

                      <div className="mt-6 grid gap-3 md:grid-cols-2">
                        <InfoChip icon={Sparkles} label="Material" value={piece.materialName} />
                        <InfoChip icon={MapPin} label="Imagem do material" value={piece.materialCategory || 'Sem categoria'} />
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr]">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/30">Imagem da peça</div>
                        <div className="mt-2 text-sm font-semibold text-white/80">{piece.pieceImageUrl ? 'Personalizada' : 'Usando imagem padrão'}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/30">Imagem do material</div>
                        <div className="mt-2 text-sm font-semibold text-white/80">{piece.materialImageUrl ? 'Disponível' : 'Placeholder elegante'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
            {!presentation.pieces.length && (
              <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8 text-sm text-white/45">
                Nenhuma peça encontrada nesta proposta.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div {...reveal} className="premium-panel rounded-[30px] border border-white/10 bg-white/[0.035] p-6">
            <SectionHeading eyebrow="Dados" title="Informações comerciais" description="Somente o que faz sentido para a decisão do cliente, sem detalhes internos de formação de preço." compact />
            <div className="mt-6 space-y-3">
              <DetailRow label="Cliente" value={presentation.clientName} />
              <DetailRow label="Telefone" value={safe(presentation.clientPhone)} />
              <DetailRow label="Endereço" value={safe(presentation.clientAddress)} />
              <DetailRow label="Ambiente" value={safe(presentation.environment)} />
              <DetailRow label="Responsável" value={safe(presentation.responsible)} />
              <DetailRow label="Pagamento" value={safe(presentation.paymentMethod)} last />
            </div>
          </motion.div>

          <motion.div {...reveal} className="premium-panel rounded-[30px] border border-[#D4A853]/20 bg-[#D4A853]/[0.06] p-6">
            <SectionHeading eyebrow="Resumo" title="Valor final da proposta" description="A apresentação mostra o total final e as observações comerciais disponíveis." compact />
            <div className="mt-6 rounded-[28px] border border-[#D4A853]/25 bg-black/25 p-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#D4A853]">Total</div>
              <div className="mt-3 font-display text-4xl font-bold text-white sm:text-5xl">{formatCurrency(presentation.totalPrice)}</div>
            </div>
            {presentation.commercialNotes && (
              <div className="mt-6 rounded-[22px] border border-white/8 bg-black/20 p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/30">Observações comerciais</div>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{presentation.commercialNotes}</p>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      <footer className="px-4 pb-10 sm:px-6 md:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-5 text-center text-[11px] uppercase tracking-[0.32em] text-white/35">
          {presentation.companyName} · Apresentação gerada em {presentation.generatedAt}
        </div>
      </footer>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{opacity: 0, scale: 0.96, y: 14}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.96, y: 14}}
              transition={{duration: 0.22}}
              className="relative mx-auto flex max-h-[92vh] w-full max-w-6xl flex-col"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-black/40 p-3 text-white/80 transition hover:text-[#D4A853]"
              >
                <X className="h-5 w-5" />
              </button>
              <img src={lightbox.src} alt={lightbox.alt} className="max-h-[92vh] w-full rounded-[28px] object-contain shadow-2xl shadow-black/40" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};

const MetricCard = ({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) => (
  <div className={`premium-panel rounded-[22px] border p-5 ${highlight ? 'border-[#D4A853]/40 bg-[#D4A853]/[0.08]' : 'border-white/10 bg-white/[0.04]'}`}>
    <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/34">{label}</div>
    <div className={`mt-3 font-display text-2xl font-bold ${highlight ? 'text-[#D4A853]' : 'text-white'}`}>{value}</div>
  </div>
);

const SectionHeading = ({eyebrow, title, description, compact = false}: {eyebrow: string; title: string; description: string; compact?: boolean}) => (
  <div className={compact ? 'text-left' : 'text-center'}>
    <div className="text-xs font-bold uppercase tracking-[0.34em] text-[#D4A853]">{eyebrow}</div>
    <h2 className="mt-4 font-display text-3xl font-bold text-white sm:text-4xl">{title}</h2>
    <p className={`mt-4 max-w-2xl text-sm leading-relaxed text-white/55 ${compact ? '' : 'mx-auto'}`}>{description}</p>
  </div>
);

const InfoChip = ({icon: Icon, label, value}: {icon: React.ComponentType<{className?: string}>; label: string; value: string}) => (
  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[#D4A853]">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="mt-2 text-sm font-semibold text-white/78">{value}</div>
  </div>
);

const DetailRow = ({label, value, last = false}: {label: string; value?: string; last?: boolean}) => (
  <div className={`flex items-center justify-between gap-4 py-3 text-sm ${last ? '' : 'border-b border-white/6'}`}>
    <span className="text-white/35">{label}</span>
    <span className="max-w-[60%] text-right font-semibold text-white/82">{safe(value)}</span>
  </div>
);
