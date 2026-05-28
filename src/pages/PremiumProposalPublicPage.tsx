import React, {useEffect, useState} from 'react';
import {useLocation, useParams} from 'react-router-dom';
import {FileText, ShieldAlert} from 'lucide-react';
import {collection, doc, getDoc, getDocs} from '../lib/firestore';
import {db} from '../lib/firestore';
import {useSettings} from '../hooks/useSettings';
import {buildPremiumPresentationSnapshot, PremiumPresentationSnapshot} from '../lib/premiumProposal';
import {Material, Quote} from '../types';
import {PremiumPresentationView} from '../components/premium/PremiumPresentationView';

export const PremiumProposalPublicPage: React.FC = () => {
  const {id} = useParams();
  const location = useLocation();
  const {settings, loading: settingsLoading} = useSettings();
  const [loading, setLoading] = useState(true);
  const [presentation, setPresentation] = useState<PremiumPresentationSnapshot | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token') || '';
    if (!id || !token) {
      setError('Link inválido ou incompleto.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadDirectPresentation = async () => {
      const [quoteSnapshot, materialsSnapshot] = await Promise.all([
        getDoc(doc(db, 'quotes', id)),
        getDocs(collection(db, 'materials')),
      ]);

      if (cancelled) return;

      if (!quoteSnapshot.exists()) {
        setError('Não foi possível encontrar a apresentação.');
        setLoading(false);
        return;
      }

      const loadedQuote = {id: quoteSnapshot.id, ...quoteSnapshot.data()} as Quote;
      if (loadedQuote.premiumPresentationToken !== token) {
        setError('Link inválido ou sem permissão.');
        setLoading(false);
        return;
      }

      const materials = materialsSnapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material));
      const snapshot = loadedQuote.premiumPresentation || buildPremiumPresentationSnapshot({
        quote: loadedQuote,
        settings,
        materials,
        publishedAt: loadedQuote.premiumPresentationSharedAt?.toDate ? loadedQuote.premiumPresentationSharedAt.toDate() : new Date(),
      });

      if (!cancelled) {
        setPresentation(snapshot);
        setLoading(false);
      }
    };

    const loadPresentation = async () => {
      try {
        const response = await fetch(`/api/premium-proposal/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as {presentation?: PremiumPresentationSnapshot};
        if (!cancelled && payload.presentation) {
          setPresentation(payload.presentation);
          setLoading(false);
          return;
        }
      } catch (loadError) {
        console.warn('Falling back to direct proposal fetch', loadError);
      }

      if (!settingsLoading) {
        await loadDirectPresentation();
      }
    };

    loadPresentation();
    return () => {
      cancelled = true;
    };
  }, [id, location.search, settings, settingsLoading]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] p-6 text-white">
        <div className="rounded-[32px] border border-white/10 bg-white/5 px-8 py-10 text-center shadow-2xl shadow-black/30">
          <FileText className="mx-auto h-10 w-10 text-[#D4A853]" />
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-white/35">Carregando apresentação</p>
        </div>
      </div>
    );
  }

  if (error || !presentation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] p-6 text-white">
        <div className="max-w-lg rounded-[32px] border border-white/10 bg-white/5 px-8 py-10 text-center shadow-2xl shadow-black/30">
          <ShieldAlert className="mx-auto h-10 w-10 text-[#D4A853]" />
          <h1 className="mt-4 font-display text-2xl font-bold">Apresentação indisponível</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            {error || 'O link pode estar incorreto, expirado ou a apresentação ainda não foi publicada.'}
          </p>
        </div>
      </div>
    );
  }

  return <PremiumPresentationView presentation={presentation} />;
};
