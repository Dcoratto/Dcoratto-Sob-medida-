import React, {useEffect, useMemo, useRef, useState} from 'react';
import {collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc} from '../lib/firestore';
import {AlertTriangle, Edit2, Eye, PackageCheck, Search, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {db} from '../lib/firestore';
import {InventoryItem, InventoryReservation, Material, Quote} from '../types';
import {cn, formatCurrency, formatNumber} from '../lib/utils';
import {useAuth} from '../contexts/AuthContext';
import {formatMaterialSpecsWithProvider} from '../lib/materialSpecs';
import {clearDraft, loadDraftMeta, saveDraft} from '../lib/draftStorage';
import {DraftNotice} from '../components/DraftNotice';
import {DraftAutosaveStatus} from '../components/DraftAutosaveStatus';
import {logSystemEvent} from '../lib/systemEvents';
import {getInventoryItemArea} from '../lib/inventoryMetrics';

type MaterialStockRow = Material & {
  baseMaterialId: string;
  stockArea: number;
  stockCost: number;
  stockMinimumSale: number;
  stockMinimumSaleValue: number;
  manualReservedArea: number;
  quoteReservedArea: number;
  soldArea: number;
  availableArea: number;
  missingArea: number;
  baseMinimumSalePerM2: number;
};

const AREA_UNIT = 'm²';
const LABEL_AVAILABLE = 'Disponível';
const LABEL_MINIMUM_SALE = 'Mínimo venda';

const normalizeStatus = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const MaterialsPage: React.FC = () => {
  const {hasPermission} = useAuth();
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [reservationMaterialId, setReservationMaterialId] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<MaterialStockRow | null>(null);
  const [salePricePerM2, setSalePricePerM2] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [materialPriceDraftRecovered, setMaterialPriceDraftRecovered] = useState(false);
  const [materialPriceDraftSavedAt, setMaterialPriceDraftSavedAt] = useState<string | null>(null);
  const materialPriceDraftLoadedRef = useRef(false);
  const materialPriceDraftKey = `materials-price-draft:${editingMaterial?.baseMaterialId || 'new'}`;

  useEffect(() => {
    const q = query(collection(db, 'materials'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material)));
      setLoading(false);
    }, (error) => {
      console.error('Erro ao carregar materiais:', error);
      setLoadError('Nao foi possivel carregar o cadastro de materiais. Os itens do estoque ainda serao exibidos com os dados disponiveis.');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!showModal || !editingMaterial || materialPriceDraftLoadedRef.current) return;
    const {data: draft, savedAt} = loadDraftMeta<{salePricePerM2?: string; active?: boolean}>(materialPriceDraftKey);
    if (draft) {
      setSalePricePerM2(draft.salePricePerM2 || String(editingMaterial.pricePerM2 || 0));
      setActive(typeof draft.active === 'boolean' ? draft.active : editingMaterial.active);
      setMaterialPriceDraftRecovered(true);
      setMaterialPriceDraftSavedAt(savedAt);
    } else {
      setMaterialPriceDraftRecovered(false);
      setMaterialPriceDraftSavedAt(null);
    }
    materialPriceDraftLoadedRef.current = true;
  }, [editingMaterial, materialPriceDraftKey, showModal]);

  useEffect(() => {
    if (!showModal || !editingMaterial || !materialPriceDraftLoadedRef.current) return;
    const savedAt = saveDraft(materialPriceDraftKey, {salePricePerM2, active});
    if (savedAt) setMaterialPriceDraftSavedAt(savedAt);
  }, [active, editingMaterial, materialPriceDraftKey, salePricePerM2, showModal]);

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('materialName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInventory(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryItem)));
      setLoading(false);
    }, (error) => {
      console.error('Erro ao carregar estoque para materiais:', error);
      setLoadError('Nao foi possivel carregar o estoque agora. Tente atualizar a pagina em instantes.');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribeReservations = onSnapshot(collection(db, 'inventoryReservations'), (snapshot) => {
      setReservations(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as InventoryReservation)));
    }, (error) => {
      console.error('Erro ao carregar reservas para materiais:', error);
      setLoadError('Nao foi possivel carregar as reservas agora. Os totais podem ficar incompletos ate a conexao normalizar.');
    });

    return unsubscribeReservations;
  }, []);

  useEffect(() => {
    if (!reservationMaterialId) return;
    const qQuotes = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'));
    const unsubscribeQuotes = onSnapshot(qQuotes, (snapshot) => {
      setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
    }, (error) => {
      console.error('Erro ao carregar orcamentos das reservas:', error);
    });

    return unsubscribeQuotes;
  }, [reservationMaterialId]);

  const activeStockItems = useMemo(() => inventory.filter((item) => !['usada', 'descarte'].includes(normalizeStatus(item.status))), [inventory]);
  const activeReservations = useMemo(() => reservations.filter((reservation) => !['recusado', 'cancelado', 'finalizado'].includes(normalizeStatus(reservation.quoteStatus))), [reservations]);
  const soldReservations = useMemo(() => reservations.filter((reservation) => normalizeStatus(reservation.quoteStatus) === 'finalizado'), [reservations]);
  const materialsById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);

  const materialRows: MaterialStockRow[] = useMemo(() => {
    const stockByMaterialId = activeStockItems.reduce((map, item) => {
      if (!item.materialId) return map;
      const current = map.get(item.materialId) || [];
      current.push(item);
      map.set(item.materialId, current);
      return map;
    }, new Map<string, InventoryItem[]>());
    const activeReservedByMaterialId = activeReservations.reduce((map, reservation) => {
      map.set(reservation.materialId, (map.get(reservation.materialId) || 0) + (reservation.area || 0));
      return map;
    }, new Map<string, number>());
    const soldByMaterialId = soldReservations.reduce((map, reservation) => {
      map.set(reservation.materialId, (map.get(reservation.materialId) || 0) + (reservation.area || 0));
      return map;
    }, new Map<string, number>());

    return Array.from(stockByMaterialId.entries()).map(([materialId, stockItems]) => {
      const first = stockItems[0];
      const baseMaterial = materialsById.get(materialId);
      const stockArea = stockItems.reduce((acc, item) => acc + getInventoryItemArea(item), 0);
      const stockCost = stockItems.reduce((acc, item) => acc + (item.cost || 0), 0);
      const stockMinimumSale = stockItems.reduce((acc, item) => acc + (item.minimumSalePrice ?? item.cost ?? 0), 0);
      const stockMinimumSaleValue = stockItems.reduce((lowest, item) => {
        const value = Number(item.minimumSalePrice ?? item.cost ?? 0);
        if (!(value > 0)) return lowest;
        return lowest > 0 ? Math.min(lowest, value) : value;
      }, 0);
      const manualReservedArea = stockItems
        .filter((item) => normalizeStatus(item.status) === 'reservada')
        .reduce((acc, item) => acc + getInventoryItemArea(item), 0);
      const quoteReservedArea = activeReservedByMaterialId.get(materialId) || 0;
      const soldArea = soldByMaterialId.get(materialId) || 0;
      const availableArea = Math.max(0, stockArea - manualReservedArea - quoteReservedArea - soldArea);
      const missingArea = Math.max(0, quoteReservedArea - Math.max(0, stockArea - manualReservedArea - soldArea));
      const baseCostPerM2 = stockArea > 0 ? stockCost / stockArea : (baseMaterial?.baseCostPerM2 ?? 0);
      const baseMinimumSalePerM2 = stockMinimumSaleValue > 0
        ? stockMinimumSaleValue
        : (baseMaterial?.baseMinimumSalePerM2 ?? baseCostPerM2);

      return {
        ...(baseMaterial || {id: materialId, name: first.materialName, pricePerM2: 0, provider: '', category: '', active: true}),
        baseMaterialId: materialId,
        name: baseMaterial?.name || first.materialName,
        provider: baseMaterial?.provider || first.provider || '',
        category: baseMaterial?.category || first.category || '',
        materialLine: baseMaterial?.materialLine || first.materialLine || first.category || '',
        materialType: baseMaterial?.materialType || first.materialType || '',
        thicknessLabel: baseMaterial?.thicknessLabel || first.thicknessLabel || '',
        texture: baseMaterial?.texture || first.texture || '',
        imageUrl: baseMaterial?.imageUrl || first.photoUrl || '',
        stockArea,
        stockCost,
        stockMinimumSale,
        stockMinimumSaleValue,
        manualReservedArea,
        quoteReservedArea,
        soldArea,
        availableArea,
        missingArea,
        baseCostPerM2,
        baseMinimumSalePerM2,
        pricePerM2: baseMaterial?.pricePerM2 ?? 0,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', {sensitivity: 'base'}));
  }, [activeReservations, activeStockItems, materialsById, soldReservations]);

  const handleEdit = (material: MaterialStockRow) => {
    if (!hasPermission('materiais', 'editar')) return;
    materialPriceDraftLoadedRef.current = false;
    setEditingMaterial(material);
    setSalePricePerM2(String(material.pricePerM2 || 0));
    setActive(material.active);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;
    if (!hasPermission('materiais', 'editar')) {
      alert('Você não tem permissão para editar materiais. Fale com o administrador.');
      return;
    }

    setSavingPrice(true);
    try {
      const baseCost = editingMaterial.baseCostPerM2 ?? 0;
      const baseMinimumSale = editingMaterial.stockMinimumSaleValue > 0
        ? editingMaterial.stockMinimumSaleValue
        : (editingMaterial.baseMinimumSalePerM2 ?? baseCost);
      const pricePerM2 = Math.max(0, Number(salePricePerM2) || 0);
      const rawMarginPercentage = baseMinimumSale > 0
        ? ((pricePerM2 / baseMinimumSale) - 1) * 100
        : 0;
      const marginPercentage = Number.isFinite(rawMarginPercentage)
        ? Math.min(Math.max(rawMarginPercentage, -999999.99), 999999.99)
        : 0;

      const payload = {
        active,
        baseCostPerM2: baseCost,
        baseMinimumSalePerM2: baseMinimumSale,
        marginPercentage,
        pricePerM2,
        updatedAt: serverTimestamp(),
      };
      const materialRef = doc(db, 'materials', editingMaterial.baseMaterialId);
      const existingMaterial = materialsById.get(editingMaterial.baseMaterialId);
      if (existingMaterial) {
        await updateDoc(materialRef, payload);
      } else {
        await setDoc(materialRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      await logSystemEvent({
        type: 'inventory_updated',
        title: 'Preço final de material atualizado',
        description: `${editingMaterial.name} · ${formatCurrency(pricePerM2)}/m²`,
        entityType: 'inventory',
        entityId: editingMaterial.baseMaterialId,
        materialId: editingMaterial.baseMaterialId,
        materialName: editingMaterial.name,
        metadata: {
          minimumSalePerM2: baseMinimumSale,
          minimumSaleValue: editingMaterial.stockMinimumSaleValue,
          pricePerM2,
          marginPercentage,
          active,
        },
      });

      setShowModal(false);
      clearDraft(materialPriceDraftKey);
      setMaterialPriceDraftRecovered(false);
      setMaterialPriceDraftSavedAt(null);
      materialPriceDraftLoadedRef.current = false;
      setEditingMaterial(null);
      setSalePricePerM2('');
    } catch (error) {
      console.error('Erro ao salvar preço do material:', error);
      const errorMessage = [
        (error as {message?: string})?.message,
        (error as {details?: string})?.details,
        (error as {hint?: string})?.hint,
      ].filter(Boolean).join(' · ');
      alert(errorMessage ? `Não foi possível salvar o preço desta pedra. ${errorMessage}` : 'Não foi possível salvar o preço desta pedra.');
    } finally {
      setSavingPrice(false);
    }
  };

  const clearMaterialPriceDraftState = () => {
    if (!editingMaterial) return;
    clearDraft(materialPriceDraftKey);
    materialPriceDraftLoadedRef.current = true;
    setMaterialPriceDraftRecovered(false);
    setMaterialPriceDraftSavedAt(null);
    setSalePricePerM2(String(editingMaterial.pricePerM2 || 0));
    setActive(editingMaterial.active);
  };

  const handleStatusChange = async (material: Material, nextActive: boolean) => {
    if (!hasPermission('materiais', 'editar')) {
      alert('Você não tem permissão para editar materiais. Fale com o administrador.');
      return;
    }
    await updateDoc(doc(db, 'materials', material.id), {active: nextActive, updatedAt: serverTimestamp()});
  };

  const filteredMaterials = materialRows.filter((material) => {
    const searchText = `${material.name} ${material.provider} ${material.category} ${material.materialLine || ''} ${material.materialType || ''} ${material.thicknessLabel || ''} ${material.texture || ''}`.toLowerCase();
    return searchText.includes(search.toLowerCase());
  });

  const selectedReservationMaterial = reservationMaterialId
    ? materialRows.find((material) => material.baseMaterialId === reservationMaterialId) || materials.find((material) => material.id === reservationMaterialId)
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
          <p className="text-slate-500 mt-1">Aqui aparecem somente as pedras já cadastradas no estoque. Nesta tela você define apenas o preço final de venda.</p>
        </div>
      </header>

      {loadError && (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
          {loadError}
        </div>
      )}

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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">{LABEL_AVAILABLE}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Faltando</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">{LABEL_MINIMUM_SALE}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Venda/m²</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-slate-400">Carregando materiais...</td></tr>
              ) : filteredMaterials.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-slate-400">Nenhuma pedra do estoque disponível para precificar.</td></tr>
              ) : (
                filteredMaterials.map((material) => (
                  <tr key={material.baseMaterialId} className="hover:bg-slate-50/50 transition-colors group">
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
                          <div className="text-xs text-slate-400">{formatMaterialSpecsWithProvider(material) || `${material.category || 'Sem categoria'} · ${material.provider || 'Sem fornecedor'}`}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-600">
                      <div>{formatNumber(material.stockArea)} {AREA_UNIT}</div>
                      {material.manualReservedArea > 0 && (
                        <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-600">{formatNumber(material.manualReservedArea)} m² reservado manual</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {material.quoteReservedArea > 0 ? (
                        <button
                          type="button"
                          onClick={() => setReservationMaterialId(material.baseMaterialId)}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-all"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {formatNumber(material.quoteReservedArea)} {AREA_UNIT}
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400">0,00 {AREA_UNIT}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm font-bold text-green-700">{formatNumber(material.soldArea)} {AREA_UNIT}</td>
                    <td className="px-6 py-4 font-mono text-sm font-bold text-green-700">{formatNumber(material.availableArea)} {AREA_UNIT}</td>
                    <td className="px-6 py-4">
                      <span className={cn('font-mono text-sm font-bold', material.missingArea > 0 ? 'text-red-600' : 'text-slate-400')}>
                        {formatNumber(material.missingArea)} {AREA_UNIT}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-600">
                      {formatCurrency(material.stockMinimumSaleValue || material.stockMinimumSale || 0)}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-brand-primary">{formatCurrency(material.pricePerM2 || 0)}</td>
                    <td className="px-6 py-4">
                      <select
                        value={material.active ? 'active' : 'inactive'}
                        onChange={(e) => handleStatusChange(material, e.target.value === 'active')}
                        disabled={!hasPermission('materiais', 'editar')}
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
                        <button type="button" onClick={() => handleEdit(material)} disabled={!hasPermission('materiais', 'editar')} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-40">
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
              <button type="button" onClick={() => { materialPriceDraftLoadedRef.current = false; setShowModal(false); setEditingMaterial(null); setMaterialPriceDraftRecovered(false); }} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {materialPriceDraftRecovered && (
                <DraftNotice
                  message="Recuperamos o último valor digitado para esta pedra. Revise e siga em frente quando quiser."
                  savedAt={materialPriceDraftSavedAt}
                  onClear={clearMaterialPriceDraftState}
                />
              )}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Mínimo de venda por m²</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-slate-600">
                    {formatCurrency(editingMaterial.stockMinimumSaleValue || editingMaterial.stockMinimumSale || 0)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Venda final por m²</label>
                  <input
                    type="number"
                    step="0.01"
                    value={salePricePerM2}
                    onChange={(e) => setSalePricePerM2(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Preço de venda final</div>
                <div className="text-2xl font-display font-bold text-brand-primary mt-1">
                  {formatCurrency(Number(salePricePerM2) || 0)}
                </div>
                <p className="mt-1 text-xs text-slate-500">O valor mínimo vem do estoque. Aqui você define somente o preço final de venda por m² desta pedra.</p>
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

              <button type="submit" disabled={savingPrice} className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95 disabled:opacity-60">
                {savingPrice ? 'Salvando...' : 'Salvar preço'}
              </button>
              <DraftAutosaveStatus savedAt={materialPriceDraftSavedAt} className="text-center" />
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
