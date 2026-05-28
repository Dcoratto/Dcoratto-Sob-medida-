import React, {useEffect, useMemo, useState} from 'react';
import {collection, doc, getDoc, onSnapshot, updateDoc, Timestamp} from '../lib/firestore';
import {db} from '../lib/firestore';
import {useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, Copy, Eye, FileImage, Link2, Save, Upload, WandSparkles, X} from 'lucide-react';
import {useSettings} from '../hooks/useSettings';
import {Material, Quote, QuotePiece} from '../types';
import {buildPremiumPresentationSnapshot, formatPieceDimensions, PremiumPresentationOverrides} from '../lib/premiumProposal';
import {PremiumPresentationView} from '../components/premium/PremiumPresentationView';
import {formatCurrency} from '../lib/utils';
import {storage, ref as storageRef, uploadBytes, getDownloadURL} from '../lib/storage';
import {useAuth} from '../contexts/AuthContext';

const localDraftKeyFor = (quoteId?: string) => `premium-proposal-draft:${quoteId || 'new'}`;

const resolveInitialOverrides = (quote?: Quote | null, quoteId?: string) => {
  if (!quote) return {};
  const stored = quote.premiumPresentation as any;
  const fromPresentation = Array.isArray(stored?.pieces)
    ? Object.fromEntries(stored.pieces.map((piece: any) => [piece.id, piece.pieceImageUrl || piece.proposalImageUrl || '']).filter(([, value]) => value))
    : {};
  const fromPieces = Object.fromEntries((quote.pieces || []).map((piece) => [piece.id, piece.proposalImageUrl || piece.previewUrl || '']).filter(([, value]) => value));
  try {
    const draft = localStorage.getItem(localDraftKeyFor(quoteId));
    if (draft) {
      const parsed = JSON.parse(draft) as PremiumPresentationOverrides;
      return {...fromPieces, ...fromPresentation, ...parsed};
    }
  } catch {
    // Ignore invalid local drafts.
  }
  return {...fromPieces, ...fromPresentation};
};

export const PremiumProposalBuilderPage: React.FC = () => {
  const {id} = useParams();
  const navigate = useNavigate();
  const {settings, loading: settingsLoading} = useSettings();
  const {profile, user, appUid} = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [uploadingPieceId, setUploadingPieceId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [imageOverrides, setImageOverrides] = useState<PremiumPresentationOverrides>({});

  const currentUserName = profile?.name || user?.user_metadata?.name || user?.email || 'Usuário';

  useEffect(() => {
    const unsubscribeMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material)));
    });

    const loadQuote = async () => {
      if (!id) return;
      const snapshot = await getDoc(doc(db, 'quotes', id));
      if (snapshot.exists()) {
        const loadedQuote = {id: snapshot.id, ...snapshot.data()} as Quote;
        setQuote(loadedQuote);
        setImageOverrides(resolveInitialOverrides(loadedQuote, id));
      }
      setLoading(false);
    };

    loadQuote();
    return unsubscribeMaterials;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    try {
      localStorage.setItem(localDraftKeyFor(id), JSON.stringify(imageOverrides));
    } catch {
      // Ignore storage write failures.
    }
  }, [id, imageOverrides]);

  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const previewSnapshot = useMemo(() => {
    if (!quote) return null;
    return buildPremiumPresentationSnapshot({
      quote: {
        ...quote,
        pieces: (quote.pieces || []).map((piece) => ({
          ...piece,
          proposalImageUrl: imageOverrides[piece.id] || piece.proposalImageUrl || '',
        })),
      },
      settings,
      materials,
      imageOverrides,
      publishedAt: new Date(),
    });
  }, [imageOverrides, materials, quote, settings]);

  const quoteLink = useMemo(() => {
    if (!id || !quote?.premiumPresentationToken) return '';
    return `${window.location.origin}/quotes/proposal/${id}?token=${quote.premiumPresentationToken}`;
  }, [id, quote?.premiumPresentationToken]);

  const handleUploadImage = async (piece: QuotePiece, file: File) => {
    if (!id) return;
    setUploadingPieceId(piece.id);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileRef = storageRef(storage, `company-files/premium-proposals/${id}/${piece.id}-${Date.now()}-${safeName}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setImageOverrides((current) => ({...current, [piece.id]: url}));
    } catch (error) {
      alert((error as Error)?.message || 'Não foi possível enviar a imagem.');
    } finally {
      setUploadingPieceId(null);
    }
  };

  const copyPublicLink = async () => {
    if (!quoteLink) return;
    await navigator.clipboard.writeText(quoteLink);
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  const publishPresentation = async () => {
    if (!quote || !previewSnapshot || !id) return;
    setPublishing(true);
    try {
      const token = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/-/g, '');
      const piecesWithImages = (quote.pieces || []).map((piece) => ({
        ...piece,
        proposalImageUrl: imageOverrides[piece.id] || piece.proposalImageUrl || piece.previewUrl || '',
      }));
      await updateDoc(doc(db, 'quotes', id), {
        pieces: piecesWithImages,
        premiumPresentation: previewSnapshot,
        premiumPresentationToken: token,
        premiumPresentationSharedAt: Timestamp.now(),
        premiumPresentationSharedByUid: appUid || '',
        premiumPresentationSharedByName: currentUserName,
      });
      const publicLink = `${window.location.origin}/quotes/proposal/${id}?token=${token}`;
      await navigator.clipboard.writeText(publicLink);
      try {
        localStorage.removeItem(localDraftKeyFor(id));
      } catch {
        // Ignore storage cleanup failures.
      }
      setQuote((current) => current ? {
        ...current,
        pieces: piecesWithImages,
        premiumPresentation: previewSnapshot,
        premiumPresentationToken: token,
        premiumPresentationSharedAt: Timestamp.now(),
        premiumPresentationSharedByUid: appUid || '',
        premiumPresentationSharedByName: currentUserName,
      } : current);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch (error) {
      alert((error as Error)?.message || 'Não foi possível gerar o link da apresentação.');
    } finally {
      setPublishing(false);
    }
  };

  const resetPieceImage = (pieceId: string) => {
    setImageOverrides((current) => {
      const next = {...current};
      delete next[pieceId];
      return next;
    });
  };

  if (loading || settingsLoading) {
    return <LoadingState />;
  }

  if (!quote || !previewSnapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-[32px] border border-slate-100 bg-white p-8 text-center shadow-sm">
          <FileImage className="mx-auto mb-4 h-10 w-10 text-brand-primary" />
          <h1 className="font-display text-2xl font-bold text-slate-900">Apresentação não encontrada</h1>
          <p className="mt-3 text-slate-500">Não consegui carregar este orçamento para montar a proposta premium.</p>
          <button type="button" onClick={() => navigate('/quotes')} className="mt-6 rounded-full bg-brand-primary px-5 py-3 text-sm font-bold text-white">
            Voltar aos orçamentos
          </button>
        </div>
      </div>
    );
  }

  const hasPublishedLink = Boolean(quote.premiumPresentationToken);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
        <div className="space-y-2">
          <button type="button" onClick={() => navigate('/quotes')} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.28em] text-slate-500 hover:text-brand-primary">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <h1 className="font-display text-3xl font-bold text-slate-900">Pré-visualização editável do PDF Premium</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            Revise as imagens, ajuste o visual da apresentação e só depois gere o link final para o cliente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {quoteLink && (
            <button type="button" onClick={() => window.open(quoteLink, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-primary/30 hover:text-brand-primary">
              <Eye className="h-4 w-4" />
              Abrir link atual
            </button>
          )}
          <button type="button" onClick={copyPublicLink} disabled={!quoteLink} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-primary/30 hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-60">
            <Copy className="h-4 w-4" />
            {copyState === 'copied' ? 'Link copiado' : 'Copiar link'}
          </button>
          <button type="button" onClick={publishPresentation} disabled={publishing} className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-primary/20 transition hover:bg-brand-primary/90 disabled:cursor-wait disabled:opacity-70">
            <Link2 className="h-4 w-4" />
            {publishing ? 'Gerando link...' : hasPublishedLink ? 'Regerar link da apresentação' : 'Gerar Link da Apresentação'}
          </button>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[0.78fr_0.22fr]">
        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.32em] text-slate-400">Editar imagens das peças</div>
                <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">Troque uma imagem por vez e revise antes de publicar</h2>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
                {formatCurrency(quote.totalPrice || 0)} no total · {quote.pieces.length} peça(s)
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {quote.pieces.map((piece, index) => {
                const material = materialById.get(piece.materialId) || materialById.get(quote.materialId);
                const draftImage = imageOverrides[piece.id] || piece.proposalImageUrl || piece.previewUrl || material?.imageUrl || '';
                return (
                  <article key={piece.id} className="rounded-[28px] border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">Peça {String(index + 1).padStart(2, '0')}</div>
                        <h3 className="mt-1 font-display text-xl font-bold text-slate-900">{piece.name}</h3>
                        <p className="mt-1 text-xs text-slate-500">{material?.name || 'Material principal'} · {piece.previewUrl ? 'Desenho pronto' : 'Sem desenho'}</p>
                      </div>
                      <button type="button" onClick={() => resetPieceImage(piece.id)} className="rounded-full border border-slate-200 bg-white p-2 text-slate-400 transition hover:text-red-500">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {draftImage ? (
                        <img src={draftImage} alt={piece.name} className="h-40 w-full object-cover" />
                      ) : (
                        <div className="flex h-40 items-center justify-center bg-[linear-gradient(135deg,#efe8db,#d8d0c2)] text-[10px] font-bold uppercase tracking-[0.28em] text-black/30">
                          Sem imagem personalizada
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Material</div>
                        <div className="mt-2 text-sm font-semibold text-slate-800">{material?.name || 'Material'}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Medidas</div>
                      <div className="mt-2 text-sm font-semibold text-slate-800">{formatPieceDimensions(piece)}</div>
                      </div>
                    </div>

                    <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-primary/30 bg-brand-primary/5 px-4 py-4 text-sm font-semibold text-brand-primary transition hover:border-brand-primary/50 hover:bg-brand-primary/10">
                      <Upload className="h-4 w-4" />
                      {uploadingPieceId === piece.id ? 'Enviando imagem...' : 'Trocar imagem da peça'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleUploadImage(piece, file);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.32em] text-slate-400">Pré-visualização</div>
                <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">Como o cliente vai ver</h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
                <WandSparkles className="h-4 w-4 text-brand-primary" />
                Scroll suave e visual premium
              </div>
            </div>
            <div className="mt-6 overflow-hidden rounded-[30px] border border-slate-200">
              <PremiumPresentationView presentation={previewSnapshot} />
            </div>
          </div>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.32em] text-slate-400">Status</div>
            <h3 className="mt-2 font-display text-2xl font-bold text-slate-900">Tudo pronto para publicar?</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Quando finalizar os ajustes, gere o link da apresentação e envie ao cliente. O link fica somente para visualização.
            </p>
            <div className="mt-5 space-y-3 rounded-[24px] bg-slate-50 p-4">
              <StatusRow label="Total da proposta" value={formatCurrency(quote.totalPrice || 0)} />
              <StatusRow label="Peças" value={String(quote.pieces.length)} />
              <StatusRow label="Link publicado" value={hasPublishedLink ? 'Sim' : 'Ainda não'} />
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.32em] text-slate-400">Ações rápidas</div>
            <div className="mt-4 space-y-3">
              <button type="button" onClick={publishPresentation} disabled={publishing} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-primary/90 disabled:cursor-wait disabled:opacity-70">
                <Save className="h-4 w-4" />
                {publishing ? 'Gerando...' : 'Gerar Link da Apresentação'}
              </button>
              <button type="button" onClick={copyPublicLink} disabled={!quoteLink} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-primary/30 hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-60">
                <Copy className="h-4 w-4" />
                Copiar link público
              </button>
              <button type="button" onClick={() => navigate('/quotes')} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                <ArrowLeft className="h-4 w-4" />
                Voltar ao orçamento
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
};

const StatusRow = ({label, value}: {label: string; value: string}) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-semibold text-slate-900">{value}</span>
  </div>
);

const LoadingState = () => (
  <div className="space-y-6">
    <div className="h-32 animate-pulse rounded-[32px] bg-white" />
    <div className="grid gap-6 xl:grid-cols-[0.78fr_0.22fr]">
      <div className="space-y-6">
        <div className="h-[460px] animate-pulse rounded-[32px] bg-white" />
        <div className="h-[680px] animate-pulse rounded-[32px] bg-white" />
      </div>
      <div className="h-[380px] animate-pulse rounded-[32px] bg-white" />
    </div>
  </div>
);
