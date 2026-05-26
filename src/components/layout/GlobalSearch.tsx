import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Search, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {collection, onSnapshot, query} from '../../lib/firestore';
import {db} from '../../lib/firestore';
import {Client, InventoryItem, Material, Quote} from '../../types';
import {buildQuickSearchResults} from '../../lib/businessRules';
import {LABELS} from '../../constants/labels';

export const GlobalSearch: React.FC = () => {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedTerm(term.trim());
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [term]);

  useEffect(() => {
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      setClients(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Client)));
    });
    const unsubQuotes = onSnapshot(query(collection(db, 'quotes')), (snapshot) => {
      setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
    });
    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      setInventory(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryItem)));
    });
    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material)));
    });
    return () => {
      unsubClients();
      unsubQuotes();
      unsubInventory();
      unsubMaterials();
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }

      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const results = useMemo(() => buildQuickSearchResults({
    term: debouncedTerm,
    clients,
    quotes,
    inventory,
    materials,
  }).slice(0, 8), [clients, debouncedTerm, inventory, materials, quotes]);

  const clearSearch = () => {
    setTerm('');
    setDebouncedTerm('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          value={term}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          placeholder={LABELS.search.globalPlaceholder}
          className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-3 pr-24 text-sm font-medium text-slate-700 shadow-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
        />
        <div className="pointer-events-none absolute right-12 top-1/2 hidden -translate-y-1/2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 md:block">
          Ctrl K
        </div>
        {term && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && debouncedTerm && (
        <div className="absolute z-30 mt-2 w-full rounded-[28px] border border-slate-100 bg-white p-3 shadow-2xl shadow-slate-200/50">
          <div className="mb-2 flex items-center justify-between gap-3 px-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{LABELS.search.quickResults}</div>
            <div className="text-[10px] font-semibold text-slate-400">até 8 itens</div>
          </div>
          <div className="grid max-h-[360px] grid-cols-1 gap-2 overflow-y-auto">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => {
                  navigate(result.path);
                  clearSearch();
                }}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition-all hover:bg-white hover:shadow-sm"
              >
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{result.type}</div>
                <div className="mt-1 font-bold text-slate-900">{result.label}</div>
                <div className="mt-1 text-sm text-slate-500">{result.subtitle}</div>
              </button>
            ))}
            {results.length === 0 && (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-400">
                {LABELS.search.noResults}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

