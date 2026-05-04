import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSettings } from '../hooks/useSettings';
import { Material, Client, Quote, QuotePiece, QuoteStatus, PieceSide } from '../types';
import { useQuoteCalculator } from '../hooks/useQuoteCalculator';
import { 
  ArrowLeft, Save, Plus, Trash2, Pencil,
  ChevronDown, ChevronUp, Calculator, 
  MapPin, Phone, User, Calendar, 
  Layers, Scan, PenTool 
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { DrawingCanvas } from '../components/DrawingCanvas';

export const QuoteEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  
  const [materials, setMaterials] = useState<Material[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [environment, setEnvironment] = useState('');
  const [responsible, setResponsible] = useState(user?.displayName || '');
  const [materialId, setMaterialId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [deliveryDays, setDeliveryDays] = useState(15);
  const [validityDays, setValidityDays] = useState(15);
  const [commercialNotes, setCommercialNotes] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('Pré-orçamento');
  const [pieces, setPieces] = useState<QuotePiece[]>([]);
  const [cutouts, setCutouts] = useState({ cooktop: 0, sinkUnder: 0, sinkOver: 0, faucetHole: 0 });
  const [showDrawing, setShowDrawing] = useState<string | null>(null);

  const selectedMaterial = materials.find(m => m.id === materialId);
  const selectedClient = clients.find(c => c.id === clientId);
  const { calculatePieceArea, calculateTotal, calculateSculptedSink } = useQuoteCalculator(settings, selectedMaterial);
  
  const selectedPaymentAdjustment = settings.paymentMethods.find(m => m.name === paymentMethod)?.adjustment || 0;
  const totalPrice = calculateTotal(pieces, cutouts, selectedPaymentAdjustment);
  const filteredClients = clients.filter((client) => {
    const searchText = `${client.name} ${client.phone} ${client.address}`.toLowerCase();
    return searchText.includes(clientSearch.toLowerCase());
  });

  useEffect(() => {
    // Listen for clients
    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    });

    // Listen for materials
    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snap) => {
      setMaterials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
    });

    // If editing, fetch initial quote
    const fetchQuote = async () => {
      if (id) {
        const docRef = doc(db, 'quotes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Quote;
          setClientId(data.clientId);
          setEnvironment(data.environment);
          setResponsible(data.responsible);
          setMaterialId(data.materialId);
          setPaymentMethod(data.paymentMethod);
          setDeliveryDays(data.deliveryDays);
          setValidityDays(15); // Adjust if needed
          setCommercialNotes(data.commercialNotes || '');
          setStatus(data.status);
          setPieces(data.pieces || []);
          setCutouts({
            cooktop: data.cutouts?.cooktop || 0,
            sinkUnder: data.cutouts?.sinkUnder || 0,
            sinkOver: data.cutouts?.sinkOver || 0,
            faucetHole: data.cutouts?.faucetHole || 0,
          });
        }
      }
      setLoading(false);
    };

    fetchQuote();

    return () => {
      unsubClients();
      unsubMaterials();
    };
  }, [id]);

  const addPiece = () => {
    const newPiece: QuotePiece = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Peça ${pieces.length + 1}`,
      materialId: materialId,
      unit: 'cm',
      width: 0,
      length: 0,
      area: 0,
      sides: [],
      notes: '',
      sculptedSink: {
        active: false,
        type: 'Simples',
        quantity: 1,
        width: 0,
        depth: 0,
        height: 0,
        unit: 'cm',
        calculatedArea: 0,
        calculatedValue: 0
      }
    };
    setPieces([...pieces, newPiece]);
  };

  const removePiece = (id: string) => {
    setPieces(pieces.filter(p => p.id !== id));
  };

  const updatePiece = (id: string, data: Partial<QuotePiece>) => {
    setPieces(pieces.map(p => p.id === id ? { ...p, ...data } : p));
  };

  const sideOptionsForPiece = (piece: QuotePiece) => [
    { value: 'top', label: `Comprimento superior (${piece.length || 0} cm)`, length: piece.length },
    { value: 'bottom', label: `Comprimento inferior (${piece.length || 0} cm)`, length: piece.length },
    { value: 'left', label: `Largura esquerda (${piece.width || 0} cm)`, length: piece.width },
    { value: 'right', label: `Largura direita (${piece.width || 0} cm)`, length: piece.width },
  ];

  const addSide = (pieceId: string, type: PieceSide['type']) => {
    setPieces(pieces.map(p => {
      if (p.id !== pieceId) return p;
      const firstSide = sideOptionsForPiece(p)[0];
      const defaultHeight =
        type === 'frontao' ? settings.defaultFrontonHeight :
        type === 'saia' ? settings.defaultSkirtHeight :
        settings.defaultTurnHeight;
      const newSide: PieceSide = {
        type,
        side: firstSide.value,
        sideLabel: firstSide.label,
        length: firstSide.length,
        height: defaultHeight,
        quantity: 1,
        area: 0
      };
      return { ...p, sides: [...p.sides, newSide] };
    }));
  };

  const handleSave = async () => {
    if (!clientId || !materialId) {
      alert('Por favor, selecione um cliente e um material.');
      return;
    }
    setSaving(true);
    
    const quoteData: Partial<Quote> = {
      clientId,
      clientName: selectedClient?.name || '',
      phone: selectedClient?.phone || '',
      address: selectedClient?.address || '',
      environment,
      responsible,
      materialId,
      paymentMethod,
      deliveryDays,
      validityDate: Timestamp.fromDate(new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)),
      commercialNotes,
      status,
      totalArea: pieces.reduce((acc, p) => acc + calculatePieceArea(p).totalArea, 0),
      totalPrice,
      pieces,
      cutouts,
      createdAt: id ? undefined : Timestamp.now(),
      createdBy: user?.uid
    };

    try {
      if (id) {
        await setDoc(doc(db, 'quotes', id), quoteData, { merge: true });
      } else {
        await addDoc(collection(db, 'quotes'), quoteData);
      }
      navigate('/quotes');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (settingsLoading) return <div>Carregando...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/quotes')} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
              {id ? 'Editar Orçamento' : 'Novo Orçamento'}
            </h1>
            <p className="text-slate-500 mt-1">Configure as peças, materiais e condições.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-brand-primary text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95 disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Salvando...' : 'Salvar Orçamento'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Basic Info */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <h2 className="font-display font-bold text-lg text-slate-800 flex items-center gap-2">
              <User className="w-5 h-5 text-brand-primary" /> Dados do Cliente
            </h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cliente</label>
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Pesquisar por nome, telefone ou endereço..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 mb-2 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all"
                />
                <select 
                  value={clientId} 
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all"
                >
                  <option value="">Selecione um cliente</option>
                  {filteredClients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ambiente / Projeto</label>
                <input 
                  type="text" 
                  value={environment} 
                  onChange={(e) => setEnvironment(e.target.value)}
                  placeholder="Ex: Cozinha, Banheiro Social..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all"
                />
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <h2 className="font-display font-bold text-lg text-slate-800 flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-primary" /> Material e Condições
            </h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Material</label>
                <select 
                  value={materialId} 
                  onChange={(e) => setMaterialId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all"
                >
                  <option value="">Selecione um material</option>
                  {materials.filter(m => m.active).map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.category})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Condição de Pagamento</label>
                <select 
                  value={paymentMethod} 
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all"
                >
                  <option value="">Selecione o pagamento</option>
                  {settings.paymentMethods.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Prazo (dias)</label>
                  <input 
                    type="number" 
                    value={deliveryDays} 
                    onChange={(e) => setDeliveryDays(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Status</label>
                  <select 
                    value={status} 
                    onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all"
                  >
                    <option value="Pré-orçamento">Pré-orçamento</option>
                    <option value="Aguardando medição">Aguardando medição</option>
                    <option value="Medido">Medido</option>
                    <option value="Aprovado">Aprovado</option>
                    <option value="Em produção">Em produção</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-brand-primary p-8 rounded-[32px] text-white shadow-xl shadow-brand-primary/30">
            <div className="flex items-center gap-2 mb-4 opacity-80">
              <Calculator className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Resumo do Total</span>
            </div>
            <div className="text-4xl font-display font-bold mb-2">
              {formatCurrency(totalPrice)}
            </div>
            <div className="text-sm opacity-60 font-medium">
              Ajuste de pagamento: {selectedPaymentAdjustment}%
            </div>
          </section>
        </div>

        {/* Right Column: Pieces */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-display font-bold text-slate-900">Peças do Orçamento</h2>
            <button 
              onClick={addPiece}
              className="flex items-center gap-2 text-brand-primary font-bold hover:underline"
            >
              <Plus className="w-5 h-5" /> Adicionar Peça
            </button>
          </div>

          <div className="space-y-6">
            {pieces.length === 0 && (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[32px] text-center space-y-4">
                <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                <div className="text-slate-500 font-medium tracking-tight">Nenhuma peça adicionada ainda.</div>
                <button onClick={addPiece} className="text-brand-primary font-bold">Clique aqui para começar</button>
              </div>
            )}

            {pieces.map((piece, pIdx) => (
              <div key={piece.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-slate-50/50 px-8 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-brand-primary text-white text-xs font-bold rounded-lg flex items-center justify-center">
                      {pIdx + 1}
                    </div>
                    <input 
                      type="text" 
                      value={piece.name}
                      onChange={(e) => updatePiece(piece.id, { name: e.target.value })}
                      className="bg-transparent font-display font-bold text-slate-800 outline-none focus:text-brand-primary transition-all w-48"
                    />
                  </div>
                  <button 
                    type="button"
                    aria-label="Remover peça"
                    title="Remover peça"
                    onClick={() => removePiece(piece.id)} 
                    className="p-2 text-slate-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  {/* Drawing Preview and Dimensions */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-1">
                      {piece.previewUrl ? (
                        <div className="relative group cursor-pointer" onClick={() => setShowDrawing(piece.id)}>
                          <img 
                            src={piece.previewUrl} 
                            alt={piece.name} 
                            className="w-full aspect-square object-contain bg-slate-50 rounded-2xl border border-slate-100 p-2" 
                          />
                          <div className="absolute inset-0 bg-brand-primary/0 group-hover:bg-brand-primary/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-2xl">
                            <PenTool className="w-5 h-5 text-brand-primary" />
                          </div>
                          <div className="absolute bottom-2 right-2 bg-green-500 w-3 h-3 rounded-full border-2 border-white shadow-sm" title="Desenho técnico disponível" />
                        </div>
                      ) : (
                        <button 
                          onClick={() => setShowDrawing(piece.id)}
                          className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-brand-primary hover:border-brand-primary/20 hover:bg-white transition-all"
                        >
                          <Pencil className="w-8 h-8 opacity-50" />
                          <span className="text-[10px] uppercase font-bold tracking-widest">Desenhar Peça</span>
                        </button>
                      )}
                    </div>

                    <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Comp. (cm)</label>
                        <input 
                          type="number" 
                          value={piece.length}
                          onChange={(e) => updatePiece(piece.id, { length: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Largura (cm)</label>
                        <input 
                          type="number" 
                          value={piece.width}
                          onChange={(e) => updatePiece(piece.id, { width: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Área Total (m²)</label>
                        <div className="px-4 py-2.5 bg-slate-100 rounded-xl font-mono text-slate-600 flex flex-col items-end">
                          <div className="flex justify-between w-full items-center">
                            <span className="text-[9px] uppercase font-bold text-slate-400">Total:</span>
                            <span className="font-bold text-slate-900">{calculatePieceArea(piece).totalArea.toFixed(4)}</span>
                          </div>
                          {piece.sculptedSink?.active && (
                            <div className="text-[8px] text-slate-400 flex flex-col w-full">
                              <div className="flex justify-between">
                                <span>Peça:</span>
                                <span>{calculatePieceArea(piece).mainArea.toFixed(4)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Cuba:</span>
                                <span>{calculatePieceArea(piece).sinkArea.toFixed(4)}</span>
                              </div>
                            </div>
                          )}
                          {piece.manualArea && (
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-1" title="Calculado via desenho" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pia Esculpida Section */}
                  <div className="pt-4 border-t border-slate-50 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-slate-700">Pia Esculpida:</label>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                          <button 
                            onClick={() => updatePiece(piece.id, { sculptedSink: { ...(piece.sculptedSink || {
                              type: 'Simples', quantity: 1, width: 0, depth: 0, height: 0, unit: 'cm'
                            }), active: true } as any })}
                            className={cn("px-4 py-1 text-[10px] font-bold uppercase rounded-lg transition-all", piece.sculptedSink?.active ? "bg-white text-brand-primary shadow-sm" : "text-slate-400")}
                          >Sim</button>
                          <button 
                            onClick={() => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink, active: false } as any })}
                            className={cn("px-4 py-1 text-[10px] font-bold uppercase rounded-lg transition-all", !piece.sculptedSink?.active ? "bg-white text-brand-primary shadow-sm" : "text-slate-400")}
                          >Não</button>
                        </div>
                      </div>
                    </div>

                    {piece.sculptedSink?.active && (
                      <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 space-y-6 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tipo de Cuba</label>
                            <select 
                              value={piece.sculptedSink.type}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, type: e.target.value as any } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none"
                            >
                              <option value="Simples">Simples</option>
                              <option value="Com rampa">Com rampa</option>
                              <option value="Válvula oculta">Válvula oculta</option>
                              <option value="Cuba dupla">Cuba dupla</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quantidade</label>
                            <input 
                              type="number" 
                              min="1"
                              value={piece.sculptedSink.quantity}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, quantity: Math.max(1, Number(e.target.value)) } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Medida Unidade</label>
                            <select 
                              value={piece.sculptedSink.unit}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, unit: e.target.value as any } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none"
                            >
                              <option value="cm">cm</option>
                              <option value="m">m</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Largura Cuba ({piece.sculptedSink.unit})</label>
                            <input 
                              type="number" 
                              value={piece.sculptedSink.width}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, width: Number(e.target.value) } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Profundidade Cuba ({piece.sculptedSink.unit})</label>
                            <input 
                              type="number" 
                              value={piece.sculptedSink.depth}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, depth: Number(e.target.value) } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Altura Interna ({piece.sculptedSink.unit})</label>
                            <input 
                              type="number" 
                              value={piece.sculptedSink.height}
                              onChange={(e) => updatePiece(piece.id, { sculptedSink: { ...piece.sculptedSink!, height: Number(e.target.value) } })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono outline-none"
                            />
                          </div>
                        </div>

                        {/* Internal Result Summary */}
                        {piece.sculptedSink.width > 0 && (
                          <div className="bg-white border border-slate-100 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                            {(() => {
                              const calc = calculateSculptedSink(piece.sculptedSink);
                              return (
                                <>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Área Cuba (m²)</span>
                                    <div className="text-slate-900 font-mono font-bold">{calc.area.toFixed(4)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Mão de Obra</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatCurrency(calc.laborValue + calc.extraSinkValue)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Risco/Perda</span>
                                    <div className="text-slate-900 font-mono font-bold">{formatCurrency(calc.lossValue)}</div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Valor Total Pia</span>
                                    <div className="text-brand-primary font-mono font-bold">{formatCurrency(calc.value)}</div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Adicionais - Frontão, Saia, etc */}
                  <div className="space-y-4 pt-4 border-t border-slate-50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Adicionais (Frontão/Saia)</h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'frontao')}
                          className="px-3 py-2 rounded-xl bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-widest hover:bg-brand-primary/15 transition-all"
                        >
                          + Frontão
                        </button>
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'saia')}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                          + Saia
                        </button>
                        <button
                          type="button"
                          onClick={() => addSide(piece.id, 'virada')}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                          + Virada
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {piece.sides.map((side, sIdx) => (
                        <div key={sIdx} className="bg-slate-50 border border-slate-100 rounded-[20px] p-4 flex gap-3 items-end group/side">
                          <div className="flex-1 space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Tipo / Medida</span>
                            <div className="flex gap-2">
                              <select 
                                value={side.type}
                                onChange={(e) => {
                                  const newSides = [...piece.sides];
                                  newSides[sIdx].type = e.target.value as any;
                                  newSides[sIdx].height =
                                    e.target.value === 'frontao' ? settings.defaultFrontonHeight :
                                    e.target.value === 'saia' ? settings.defaultSkirtHeight :
                                    settings.defaultTurnHeight;
                                  updatePiece(piece.id, { sides: newSides });
                                }}
                                className="bg-white border border-slate-200 rounded-lg text-xs p-1"
                              >
                                <option value="frontao">Frontão</option>
                                <option value="saia">Saia</option>
                                <option value="virada">Virada</option>
                              </select>
                              <select 
                                value={side.side}
                                onChange={(e) => {
                                  const newSides = [...piece.sides];
                                  const selectedSide = sideOptionsForPiece(piece).find(option => option.value === e.target.value);
                                  newSides[sIdx].side = e.target.value;
                                  newSides[sIdx].sideLabel = selectedSide?.label;
                                  newSides[sIdx].length = selectedSide?.length || 0;
                                  updatePiece(piece.id, { sides: newSides });
                                }}
                                className="bg-white border border-slate-200 rounded-lg text-xs p-1"
                              >
                                {sideOptionsForPiece(piece).map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="w-16 space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Altura</span>
                            <input 
                              type="number" 
                              value={side.height}
                              onChange={(e) => {
                                const newSides = [...piece.sides];
                                newSides[sIdx].height = Number(e.target.value);
                                updatePiece(piece.id, { sides: newSides });
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg text-xs p-1 text-center"
                            />
                          </div>
                          <button 
                            type="button"
                            aria-label="Remover lado"
                            title="Remover lado"
                            onClick={() => {
                              const newSides = [...piece.sides];
                              newSides.splice(sIdx, 1);
                              updatePiece(piece.id, { sides: newSides });
                            }}
                            className="p-2 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover/side:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <h2 className="font-display font-bold text-xl text-slate-800">Recortes e Acabamentos Especiais</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cooktop (Qtd)</label>
                <input 
                  type="number" 
                  value={cutouts.cooktop}
                  onChange={(e) => setCutouts({ ...cutouts, cooktop: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cuba Emb. (Qtd)</label>
                <input 
                  type="number" 
                  value={cutouts.sinkUnder}
                  onChange={(e) => setCutouts({ ...cutouts, sinkUnder: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cuba Sobr. (Qtd)</label>
                <input 
                  type="number" 
                  value={cutouts.sinkOver}
                  onChange={(e) => setCutouts({ ...cutouts, sinkOver: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Furação Torneira (Qtd)</label>
                <input
                  type="number"
                  value={cutouts.faucetHole}
                  onChange={(e) => setCutouts({ ...cutouts, faucetHole: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
            </div>
          </section>

          <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <h2 className="font-display font-bold text-xl text-slate-800">Observações Comerciais</h2>
            <textarea 
              value={commercialNotes}
              onChange={(e) => setCommercialNotes(e.target.value)}
              placeholder="Informações sobre entrega, instalação, etc..."
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all min-h-[120px]"
            />
          </section>
        </div>
      </div>

      {showDrawing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-white rounded-[40px] shadow-2xl flex flex-col h-[90vh]">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Desenho Técnico</h3>
                <p className="text-slate-400 text-sm">Peça: {pieces.find(p => p.id === showDrawing)?.name}</p>
              </div>
              <button 
                onClick={() => setShowDrawing(null)}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full transition-all text-slate-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-8">
              <DrawingCanvas 
                initialJson={pieces.find(p => p.id === showDrawing)?.drawingJson}
                initialSides={pieces.find(p => p.id === showDrawing)?.sides}
                initialCutouts={pieces.find(p => p.id === showDrawing)?.cutouts}
                settings={settings}
                onSave={({ json, area, previewUrl, sides, largestSide, cutouts: drawingCutouts }) => {
                  updatePiece(showDrawing, { 
                    drawingJson: json, 
                    manualArea: area, 
                    previewUrl, 
                    sides, 
                    largestSide, 
                    cutouts: drawingCutouts 
                  });
                  setShowDrawing(null);
                }}
                onCancel={() => setShowDrawing(null)}
                className="h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const X = ({ className }: any) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
