import React, {useEffect, useState} from 'react';
import {collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where} from 'firebase/firestore';
import {AlertTriangle, Edit2, Eye, PackageCheck, Search, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {db} from '../lib/firebase';
import {InventoryItem, InventoryReservation, Material, Quote, UserMaterialPrice} from '../types';
import {cn, formatCurrency, formatNumber} from '../lib/utils';
import {useAuth} from '../contexts/AuthContext';

type MaterialWithUserPrice = Material & {
  stockArea: number;
  stockCost: number;
  stockMinimumSale: number;
  manualReservedArea: number;
  quoteReservedArea: number;
  soldArea: number;
  availableArea: number;
  missingArea: number;
  baseMinimumSalePerM2: number;
  userMarginPercentage: number;
  userPricePerM2: number;
};

const normalizeStatus = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const MaterialsPage: React.FC = () => {
  const {user} = useAuth();
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [userPrices, setUserPrices] = useState<UserMaterialPrice[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [reservationMaterialId, setReservationMaterialId] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<MaterialWithUserPrice | null>(null);
  const [marginPercentage, setMarginPercentage] = useState('');
  const [salePricePerM2, setSalePricePerM2] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'materials'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material)));
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('materialName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInventory(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryItem)));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribeReservations = onSnapshot(collection(db, 'inventoryReservations'), (snapshot) => {
      setReservations(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryReservation)));
    });

    const qQuotes = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'));
    const unsubscribeQuotes = onSnapshot(qQuotes, (snapshot) => {
      setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
    });

    return () => {
      unsubscribeReservations();
      unsubscribeQuotes();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setUserPrices([]);
      return;
    }
    const q = query(collection(db, 'userMaterialPrices'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUserPrices(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as UserMaterialPrice)));
    });
    return unsubscribe;
  }, [user?.uid]);

  const activeStockItems = inventory.filter((item) => !['usada', 'descarte'].includes(normalizeStatus(item.status)));
  const activeReservations = reservations.filter((reservation) => !['recusado', 'cancelado', 'finalizado'].includes(normalizeStatus(reservation.quoteStatus)));
  const soldReservations = reservations.filter((reservation) => normalizeStatus(reservation.quoteStatus) === 'finalizado');

  const materialRows: MaterialWithUserPrice[] = materials
    .map((material) => {
      const stockItems = activeStockItems.filter((item) => item.materialId === material.id);
      const stockArea = stockItems.reduce((acc, item) => acc + (item.area || 0), 0);
      const stockCost = stockItems.reduce((acc, item) => acc + (item.cost || 0), 0);
      const stockMinimumSale = stockItems.reduce((acc, item) => acc + (item.minimumSalePrice ?? item.cost ?? 0), 0);
      const manualReservedArea = stockItems
        .filter((item) => normalizeStatus(item.status) === 'reservada')
        .reduce((acc, item) => acc + (item.area || 0), 0);
      const quoteReservedArea = activeReservations
        .filter((reservation) => reservation.materialId === material.id)
        .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
      const soldArea = soldReservations
        .filter((reservation) => reservation.materialId === material.id)
        .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
      const availableArea = Math.max(0, stockArea - manualReservedArea - quoteReservedArea - soldArea);
      const missingArea = Math.max(0, quoteReservedArea - Math.max(0, stockArea - manualReservedArea - soldArea));
      const baseCostPerM2 = stockArea > 0 ? stockCost / stockArea : 0;
      const baseMinimumSalePerM2 = stockArea > 0 ? stockMinimumSale / stockArea : baseCostPerM2;
      const userPrice = userPrices.find((price) => price.materialId === material.id);
      const margin = userPrice?.marginPercentage ?? 0;
      const pricePerM2 = userPrice?.pricePerM2 ?? baseMinimumSalePerM2 * (1 + margin / 100);
      const imageUrl = material.imageUrl || stockItems.find((item) => item.photoUrl)?.photoUrl || '';

      return {
        ...material,
        provider: material.provider || stockItems[0]?.provider || '',
        category: material.category || stockItems[0]?.category || '',
        imageUrl,
        stockArea,
        stockCost,
        stockMinimumSale,
        manualReservedArea,
        quoteReservedArea,
        soldArea,
        availableArea,
        missingArea,
        baseCostPerM2,
        baseMinimumSalePerM2,
        pricePerM2: baseMinimumSalePerM2,
        userMarginPercentage: margin,
        userPricePerM2: pricePerM2,
      };
    })
    .filter((material) => material.stockArea > 0);

  const handleEdit = (material: MaterialWithUserPrice) => {
    setEditingMaterial(material);
    setMarginPercentage(String(material.userMarginPercentage ?? 0));
    setSalePricePerM2(String(material.userPricePerM2 || 0));
    setActive(material.active);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    const margin = Number(marginPercentage);
    const baseCost = editingMaterial.baseCostPerM2 ?? 0;
    const baseMinimumSale = editingMaterial.baseMinimumSalePerM2 ?? baseCost;
    const pricePerM2 = Number(salePricePerM2) || baseMinimumSale * (1 + margin / 100);

    if (user?.uid) {
      await setDoc(doc(db, 'userMaterialPrices', `${user.uid}_${editingMaterial.id}`), {
        userId: user.uid,
        materialId: editingMaterial.id,
        baseCostPerM2: baseCost,
        baseMinimumSalePerM2: baseMinimumSale,
        marginPercentage: margin,
        pricePerM2,
        finalPricePerM2: pricePerM2,
        updatedAt: serverTimestamp(),
      }, {merge: true});
    }

    await updateDoc(doc(db, 'materials', editingMaterial.id), {active});

    setShowModal(false);
    setEditingMaterial(null);
    setSalePricePerM2('');
  };

  const handleStatusChange = async (material: Material, nextActive: boolean) => {
    await updateDoc(doc(db, 'materials', material.id), {active: nextActive});
  };

  const filteredMaterials = materialRows.filter((material) => {
    const searchText = `${material.name} ${material.provider} ${material.category}`.toLowerCase();
    return searchText.includes(search.toLowerCase());
  });
  const selectedReservationMaterial = reservationMaterialId
    ? materialRows.find((material) => material.id === reservationMaterialId) || materials.find((material) => material.id === reservationMaterialId)
    : null;
  const selectedReservations = reservationMaterialId
    ? activeReservations.filter((reservation) => reservation.materialId === reservationMaterialId)
    : [];
  const quoteById = (quoteId: string) => quotes.find((quote) => quote.id === quoteId);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Materiais</h1>
          <p className="text-slate-500 mt-1">Controle margem, disponibilidade e reservas somente das pedras que existem no estoque.</p>
        </div>
      </header>

      {materialRows.some((material) => material.missingArea > 0) && (
        <div className="rounded-[28px] border border-red-100 bg-red-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-red-900">Material faltando para orçamento</h2>
              <p className="mt-1 text-sm text-red-700">Existe reserva em orçamento maior que a área disponível no estoque. Clique no reservado para ver qual orçamento está usando.</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="p-4 border-b border-slate-50">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar materiais..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Material</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Estoque</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Reservado</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Vendido</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Disponível</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Faltando</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Mínimo venda/m²</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Margem</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Venda/m²</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={11} className="px-6 py-10 text-center text-slate-400">Carregando materiais...</td></tr>
              ) : filteredMaterials.length === 0 ? (
                <tr><td colSpan={11} className="px-6 py-10 text-center text-slate-400">Nenhum material encontrado. Compre ou adicione uma chapa no estoque primeiro.</td></tr>
              ) : (
                filteredMaterials.map((material) => (
                  <tr key={material.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center">
                          {material.imageUrl ? (
                            <img src={material.imageUrl} alt={material.name} className="h-full w-full object-cover" />
                          ) : (
                            <PackageCheck className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{material.name}</div>
                          <div className="text-xs text-slate-400">{material.category || 'Sem categoria'} · {material.provider || 'Sem fornecedor'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-600">
                      <div>{formatNumber(material.stockArea)} m²</div>
                      {material.manualReservedArea > 0 && (
                        <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-600">{formatNumber(material.manualReservedArea)} m² reservado manual</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {material.quoteReservedArea > 0 ? (
                        <button
                          type="button"
                          onClick={() => setReservationMaterialId(material.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-all"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {formatNumber(material.quoteReservedArea)} m²
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400">0,00 m²</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm font-bold text-green-700">{formatNumber(material.soldArea)} m²</td>
                    <td className="px-6 py-4 font-mono text-sm font-bold text-green-700">{formatNumber(material.availableArea)} m²</td>
                    <td className="px-6 py-4">
                      <span className={cn('font-mono text-sm font-bold', material.missingArea > 0 ?'text-red-600' : 'text-slate-400')}>
                        {formatNumber(material.missingArea)} m²
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-600">
                      {formatCurrency(material.baseMinimumSalePerM2 ?? 0)}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-900">{material.userMarginPercentage ?? 0}%</td>
                    <td className="px-6 py-4 font-mono font-bold text-brand-primary">{formatCurrency(material.userPricePerM2 || 0)}</td>
                    <td className="px-6 py-4">
                      <select
                        value={material.active ? 'active' : 'inactive'}
                        onChange={(e) => handleStatusChange(material, e.target.value === 'active')}
                        className={cn(
                          'cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold uppercase outline-none',
                          material.active ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100',
                        )}
                      >
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => handleEdit(material)} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && editingMaterial && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">Preço de venda</h2>
                <p className="text-sm text-slate-500 mt-1">{editingMaterial.name}</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Mínimo de venda por m²</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-slate-600">
                    {formatCurrency(editingMaterial.baseMinimumSalePerM2 ?? 0)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Margem (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={marginPercentage}
                    onChange={(e) => {
                      const nextMargin = e.target.value;
                      const base = editingMaterial.baseMinimumSalePerM2 ?? 0;
                      setMarginPercentage(nextMargin);
                      setSalePricePerM2(String(base * (1 + Number(nextMargin || 0) / 100)));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Venda final por m²</label>
                  <input
                    type="number"
                    step="0.01"
                    value={salePricePerM2}
                    onChange={(e) => {
                      const nextPrice = e.target.value;
                      const base = editingMaterial.baseMinimumSalePerM2 ?? 0;
                      setSalePricePerM2(nextPrice);
                      if (base > 0) {
                        setMarginPercentage(String(((Number(nextPrice || 0) / base) - 1) * 100));
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Preço de venda final</div>
                <div className="text-2xl font-display font-bold text-brand-primary mt-1">
                  {formatCurrency(Number(salePricePerM2) || 0)}
                </div>
                <p className="mt-1 text-xs text-slate-500">A margem é aplicada em cima do valor mínimo de venda, não mais sobre o custo de compra.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-5 h-5 rounded-md border-slate-300 text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="active" className="text-slate-700 font-medium cursor-pointer">Material disponível para venda</label>
              </div>

              <button type="submit" className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95">
                Salvar preço
              </button>
            </form>
          </div>
        </div>
      )}

      {reservationMaterialId && selectedReservationMaterial && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">Reservas em orçamento</h2>
                <p className="text-sm text-slate-500 mt-1">{selectedReservationMaterial.name}</p>
              </div>
              <button type="button" onClick={() => setReservationMaterialId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {selectedReservations.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum orçamento reservando este material.</div>
              ) : (
                selectedReservations.map((reservation) => {
                  const quote = quoteById(reservation.quoteId);
                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => navigate(`/quotes/edit/${reservation.quoteId}`)}
                      className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-all"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900">{reservation.clientName || quote?.clientName || 'Cliente não informado'}</div>
                          <div className="mt-1 text-xs text-slate-400">Orçamento #{reservation.quoteId.slice(0, 8)} · {reservation.quoteStatus}</div>
                          {quote?.environment && <div className="mt-1 text-xs text-slate-500">Ambiente: {quote.environment}</div>}
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2 text-right">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Usando</div>
                          <div className="font-mono font-bold text-amber-700">{formatNumber(reservation.area || 0)} m²</div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
