import React, {useEffect, useState} from 'react';
import {addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc} from 'firebase/firestore';
import {AlertTriangle, CheckCircle2, Edit2, Filter, PackageCheck, Plus, Search, ShoppingCart, Trash2, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {InventoryItem, InventoryPurchase, InventoryReservation, Material} from '../types';
import {cn, formatCurrency, formatNumber} from '../lib/utils';
import {useAuth} from '../contexts/AuthContext';
import {logSystemEvent} from '../lib/systemEvents';

const statusOptions: InventoryItem['status'][] = ['Disponível', 'Reservada', 'Usada', 'Retalho', 'Descarte'];

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const normalizeStatus = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isPurchaseRelevantReservation = (reservation: InventoryReservation) => {
  const status = normalizeStatus(reservation.quoteStatus);
  return ['aprovado', 'em producao', 'pronto para entrega', 'entregue'].includes(status);
};

export const InventoryPage: React.FC = () => {
  const {user, profile} = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);

  const [materialName, setMaterialName] = useState('');
  const [code, setCode] = useState('');
  const [provider, setProvider] = useState('');
  const [category, setCategory] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [thickness, setThickness] = useState('');
  const [cost, setCost] = useState('');
  const [status, setStatus] = useState<InventoryItem['status']>('Disponível');
  const [notes, setNotes] = useState('');
  const [purchaseMaterialId, setPurchaseMaterialId] = useState('');
  const [purchaseMaterialName, setPurchaseMaterialName] = useState('');
  const [purchaseCode, setPurchaseCode] = useState('');
  const [purchaseProvider, setPurchaseProvider] = useState('');
  const [purchaseCategory, setPurchaseCategory] = useState('');
  const [purchaseLength, setPurchaseLength] = useState('');
  const [purchaseWidth, setPurchaseWidth] = useState('');
  const [purchaseThickness, setPurchaseThickness] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  useEffect(() => {
    const qItems = query(collection(db, 'inventory'), orderBy('code', 'asc'));
    const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
      setItems(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as InventoryItem)));
      setLoading(false);
    });

    const qMaterials = query(collection(db, 'materials'), orderBy('name', 'asc'));
    const unsubscribeMaterials = onSnapshot(qMaterials, (snapshot) => {
      setMaterials(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as Material)));
    });

    const unsubscribeReservations = onSnapshot(collection(db, 'inventoryReservations'), (snapshot) => {
      setReservations(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as InventoryReservation)));
    });

    const qPurchases = query(collection(db, 'inventoryPurchases'), orderBy('purchasedAt', 'desc'));
    const unsubscribePurchases = onSnapshot(qPurchases, (snapshot) => {
      setPurchases(snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as InventoryPurchase)));
    });

    return () => {
      unsubscribeItems();
      unsubscribeMaterials();
      unsubscribeReservations();
      unsubscribePurchases();
    };
  }, []);

  const resetForm = () => {
    setMaterialName('');
    setCode('');
    setProvider('');
    setCategory('');
    setLength('');
    setWidth('');
    setThickness('');
    setCost('');
    setStatus('Disponível');
    setNotes('');
    setEditingItem(null);
  };

  const currentUserName = profile?.name || user?.displayName || user?.email || 'Usuário';

  const resetPurchaseForm = () => {
    setPurchaseMaterialId('');
    setPurchaseMaterialName('');
    setPurchaseCode('');
    setPurchaseProvider('');
    setPurchaseCategory('');
    setPurchaseLength('');
    setPurchaseWidth('');
    setPurchaseThickness('');
    setPurchaseCost('');
    setPurchaseNotes('');
  };

  const upsertMaterialFromInventory = async (inventoryId: string, area: number, totalCost: number) => {
    const existingMaterial = editingItem?.materialId
      ? materials.find((material) => material.id === editingItem.materialId)
      : materials.find((material) => slugify(material.name) === slugify(materialName));

    const materialId = existingMaterial?.id || slugify(materialName);
    const baseCostPerM2 = area > 0 ? totalCost / area : 0;

    await setDoc(doc(db, 'materials', materialId), {
      name: materialName.trim(),
      provider: provider.trim(),
      category: category.trim(),
      baseCostPerM2,
      marginPercentage: existingMaterial?.marginPercentage ?? 0,
      pricePerM2: existingMaterial?.pricePerM2 ?? baseCostPerM2,
      active: existingMaterial?.active ?? true,
      sourceInventoryId: inventoryId,
      updatedAt: serverTimestamp(),
    }, {merge: true});

    return materialId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const area = (Number(length) * Number(width)) / 10000;
    const totalCost = Number(cost);
    const inventoryRef = editingItem ? doc(db, 'inventory', editingItem.id) : doc(collection(db, 'inventory'));
    const materialId = await upsertMaterialFromInventory(inventoryRef.id, area, totalCost);

    const data = {
      materialId,
      materialName: materialName.trim(),
      code: code.trim(),
      provider: provider.trim(),
      category: category.trim(),
      length: Number(length),
      width: Number(width),
      thickness: Number(thickness),
      area,
      cost: totalCost,
      status,
      notes,
    };

    if (editingItem) {
      await updateDoc(inventoryRef, data);
      await logSystemEvent({
        type: 'inventory_updated',
        title: 'Item de estoque atualizado',
        description: `${data.materialName} - ${data.code}`,
        entityType: 'inventory',
        entityId: inventoryRef.id,
        materialId,
        materialName: data.materialName,
        userUid: user?.uid || '',
        userName: currentUserName,
        metadata: {area, cost: totalCost, status},
      });
    } else {
      await setDoc(inventoryRef, data);
      await logSystemEvent({
        type: 'inventory_created',
        title: 'Item de estoque cadastrado',
        description: `${data.materialName} - ${data.code}`,
        entityType: 'inventory',
        entityId: inventoryRef.id,
        materialId,
        materialName: data.materialName,
        userUid: user?.uid || '',
        userName: currentUserName,
        metadata: {area, cost: totalCost, status},
      });
    }

    setShowModal(false);
    resetForm();
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setMaterialName(item.materialName);
    setCode(item.code);
    setProvider(item.provider);
    setCategory(item.category || materials.find((material) => material.id === item.materialId)?.category || '');
    setLength(item.length.toString());
    setWidth(item.width.toString());
    setThickness(item.thickness.toString());
    setCost(item.cost.toString());
    setStatus(item.status);
    setNotes(item.notes);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este item do estoque?');
    if (!confirmed) return;

    const deletedItem = items.find((item) => item.id === id);
    const ok = await deleteFirestoreDoc('inventory', id);
    if (!ok) return;

    if (deletedItem) {
      await logSystemEvent({
        type: 'inventory_deleted',
        title: 'Item de estoque excluído',
        description: `${deletedItem.materialName} - ${deletedItem.code}`,
        entityType: 'inventory',
        entityId: id,
        materialId: deletedItem.materialId,
        materialName: deletedItem.materialName,
        userUid: user?.uid || '',
        userName: currentUserName,
        metadata: {area: deletedItem.area, cost: deletedItem.cost},
      });
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const openPurchaseModal = (item: {materialId: string; materialName: string; missing: number}) => {
    const inventoryItem = items.find((stockItem) => stockItem.materialId === item.materialId);
    const material = materials.find((stockMaterial) => stockMaterial.id === item.materialId);
    setPurchaseMaterialId(item.materialId);
    setPurchaseMaterialName(item.materialName);
    setPurchaseProvider(inventoryItem?.provider || material?.provider || '');
    setPurchaseCategory(inventoryItem?.category || material?.category || '');
    setPurchaseLength('');
    setPurchaseWidth('');
    setPurchaseThickness(inventoryItem?.thickness ? String(inventoryItem.thickness) : '');
    setPurchaseCost('');
    setPurchaseCode('');
    setPurchaseNotes(`Compra pendente sugerida: ${formatNumber(item.missing)} m²`);
    setShowPurchaseModal(true);
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const area = (Number(purchaseLength) * Number(purchaseWidth)) / 10000;
    const purchaseRef = await addDoc(collection(db, 'inventoryPurchases'), {
      materialId: purchaseMaterialId,
      materialName: purchaseMaterialName.trim(),
      provider: purchaseProvider.trim(),
      code: purchaseCode.trim(),
      category: purchaseCategory.trim(),
      length: Number(purchaseLength),
      width: Number(purchaseWidth),
      thickness: Number(purchaseThickness),
      area,
      cost: Number(purchaseCost),
      status: 'Pedido',
      notes: purchaseNotes,
      purchasedByUid: user?.uid || '',
      purchasedByName: currentUserName,
      purchasedAt: serverTimestamp(),
    });
    await logSystemEvent({
      type: 'purchase_ordered',
      title: 'Compra de material lançada',
      description: `${purchaseMaterialName.trim()} - ${formatNumber(area)} m²`,
      entityType: 'purchase',
      entityId: purchaseRef.id,
      materialId: purchaseMaterialId,
      materialName: purchaseMaterialName.trim(),
      userUid: user?.uid || '',
      userName: currentUserName,
      metadata: {area, cost: Number(purchaseCost), status: 'Pedido'},
    });
    setShowPurchaseModal(false);
    resetPurchaseForm();
  };

  const receivePurchase = async (purchase: InventoryPurchase) => {
    if (purchase.status === 'Entregue') return;
    const inventoryRef = doc(collection(db, 'inventory'));
    await setDoc(inventoryRef, {
      materialId: purchase.materialId,
      materialName: purchase.materialName,
      code: purchase.code,
      provider: purchase.provider || '',
      category: purchase.category || '',
      length: purchase.length,
      width: purchase.width,
      thickness: purchase.thickness,
      area: purchase.area,
      cost: purchase.cost,
      status: 'Disponível',
      notes: purchase.notes || '',
    });
    await updateDoc(doc(db, 'inventoryPurchases', purchase.id), {
      status: 'Entregue',
      receivedByUid: user?.uid || '',
      receivedByName: currentUserName,
      receivedAt: serverTimestamp(),
      inventoryItemId: inventoryRef.id,
    });
    await logSystemEvent({
      type: 'purchase_received',
      title: 'Compra de material recebida',
      description: `${purchase.materialName} - ${formatNumber(purchase.area)} m²`,
      entityType: 'purchase',
      entityId: purchase.id,
      materialId: purchase.materialId,
      materialName: purchase.materialName,
      userUid: user?.uid || '',
      userName: currentUserName,
      metadata: {area: purchase.area, cost: purchase.cost, inventoryItemId: inventoryRef.id, status: 'Entregue'},
    });
  };

  const filteredItems = items.filter((item) => {
    const searchText = `${item.materialName} ${item.code} ${item.provider} ${item.category || ''}`.toLowerCase();
    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesStatus = !statusFilter || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const quoteReservedArea = reservations.reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const manualReservedArea = items
    .filter((item) => normalizeStatus(item.status) === 'reservada')
    .reduce((acc, item) => acc + item.area, 0);
  const totalReservedArea = manualReservedArea + quoteReservedArea;
  const totalPhysicalArea = items
    .filter((item) => !['usada', 'descarte'].includes(normalizeStatus(item.status)))
    .reduce((acc, item) => acc + item.area, 0);
  const totalAvailableArea = Math.max(0, totalPhysicalArea - totalReservedArea);

  const totalInventoryCost = items.reduce((acc, item) => acc + item.cost, 0);
  const reservedAreaByMaterial = (materialId: string) =>
    reservations
      .filter((reservation) => reservation.materialId === materialId)
      .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const purchaseRelevantReservedAreaByMaterial = (materialId: string) =>
    reservations
      .filter((reservation) => reservation.materialId === materialId && isPurchaseRelevantReservation(reservation))
      .reduce((acc, reservation) => acc + (reservation.area || 0), 0);
  const physicalAreaByMaterial = (materialId: string) =>
    items
      .filter((item) => item.materialId === materialId && !['usada', 'descarte'].includes(normalizeStatus(item.status)))
      .reduce((acc, item) => acc + item.area, 0);
  const orderedAreaByMaterial = (materialId: string) =>
    purchases
      .filter((purchase) => purchase.materialId === materialId && purchase.status === 'Pedido')
      .reduce((acc, purchase) => acc + (purchase.area || 0), 0);
  const pendingPurchases = Array.from(new Set([
    ...items.map((item) => item.materialId),
    ...reservations.map((reservation) => reservation.materialId),
    ...purchases.map((purchase) => purchase.materialId),
  ])).map((materialId) => {
    const reserved = purchaseRelevantReservedAreaByMaterial(materialId);
    const available = physicalAreaByMaterial(materialId);
    const ordered = orderedAreaByMaterial(materialId);
    const missing = Math.max(0, reserved - available - ordered);
    const inventoryItem = items.find((item) => item.materialId === materialId);
    const material = materials.find((item) => item.id === materialId);
    return {
      materialId,
      materialName: inventoryItem?.materialName || material?.name || reservations.find((reservation) => reservation.materialId === materialId)?.materialName || materialId,
      reserved,
      available,
      ordered,
      missing,
    };
  }).filter((item) => item.missing > 0);
  const totalPendingPurchaseArea = pendingPurchases.reduce((acc, item) => acc + item.missing, 0);
  const activePurchases = purchases.filter((purchase) => purchase.status === 'Pedido');

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Estoque</h1>
          <p className="text-slate-500 mt-1">Cadastre as pedras aqui. Elas aparecem automaticamente em Materiais.</p>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-brand-primary text-white px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Adicionar Pedra
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total de Itens</div>
          <div className="text-3xl font-display font-bold text-slate-900">{items.length}</div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Área Disponível</div>
          <div className="text-3xl font-display font-bold text-brand-primary">{formatNumber(totalAvailableArea)} m²</div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Área Reservada</div>
          <div className="text-3xl font-display font-bold text-amber-600">{formatNumber(totalReservedArea)} m²</div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Custo em Estoque</div>
          <div className="text-3xl font-display font-bold text-slate-900">{formatCurrency(totalInventoryCost)}</div>
        </div>
        <div className={cn(
          'p-6 rounded-[32px] border shadow-sm',
          pendingPurchases.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100',
        )}>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Compra Pendente</div>
          <div className={cn('text-3xl font-display font-bold', pendingPurchases.length > 0 ? 'text-amber-700' : 'text-slate-900')}>
            {formatNumber(totalPendingPurchaseArea)} m²
          </div>
        </div>
      </div>

      {pendingPurchases.length > 0 && (
        <div className="rounded-[28px] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl bg-amber-100 p-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold text-amber-900">Compra pendente para orçamento aprovado</h2>
              <p className="mt-1 text-sm text-amber-700">As pedras abaixo têm mais m² vendidos/reservados em orçamentos aprovados do que área disponível no estoque.</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {pendingPurchases.map((item) => (
                  <div key={item.materialId} className="rounded-2xl border border-amber-100 bg-white/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold text-slate-900">{item.materialName}</div>
                      <button
                        type="button"
                        onClick={() => openPurchaseModal(item)}
                        className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-amber-700 transition-all"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Comprar
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-slate-400">Disponível</span>
                        <strong className="text-slate-700">{formatNumber(item.available)} m²</strong>
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-slate-400">Vendido</span>
                        <strong className="text-amber-700">{formatNumber(item.reserved)} m²</strong>
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-slate-400">Pedido</span>
                        <strong className="text-blue-700">{formatNumber(item.ordered)} m²</strong>
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-slate-400">Comprar</span>
                        <strong className="text-red-600">{formatNumber(item.missing)} m²</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activePurchases.length > 0 && (
        <div className="rounded-[28px] border border-blue-100 bg-blue-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl bg-blue-100 p-2 text-blue-700">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold text-blue-950">Compras em pedido</h2>
              <p className="mt-1 text-sm text-blue-700">Quando a pedra chegar, marque como entregue para entrar no estoque e registrar quem recebeu.</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {activePurchases.map((purchase) => (
                  <div key={purchase.id} className="rounded-2xl border border-blue-100 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">{purchase.materialName}</div>
                        <div className="mt-1 text-xs text-slate-400">{purchase.code || 'Sem lote'} · {formatNumber(purchase.area)} m²</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => receivePurchase(purchase)}
                        className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-green-700 transition-all"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Receber
                      </button>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      Comprado por <strong>{purchase.purchasedByName}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por pedra, lote, fornecedor ou categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all text-sm font-medium"
            >
              <option value="">Todos os Status</option>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Pedra / Lote</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Dimensões (cm)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Área</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Custo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Carregando estoque...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Nenhuma pedra encontrada.</td></tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{item.materialName}</div>
                      <div className="text-xs text-brand-primary font-mono">{item.code}</div>
                      <div className="text-xs text-slate-400">{item.category}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{item.length} x {item.width} x {item.thickness}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{formatNumber(item.area)} m²</td>
                    <td className="px-6 py-4 font-mono text-sm">{formatCurrency(item.cost)}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase',
                        item.status === 'Disponível' ? 'bg-green-50 text-green-600' :
                        item.status === 'Reservada' ? 'bg-amber-50 text-amber-600' :
                        item.status === 'Retalho' ? 'bg-blue-50 text-blue-600' :
                        'bg-slate-100 text-slate-500',
                      )}>
                        {item.status}
                      </span>
                      {reservedAreaByMaterial(item.materialId) > 0 && (
                        <div className="mt-1 text-[10px] font-semibold text-amber-600">
                          {formatNumber(reservedAreaByMaterial(item.materialId))} m² em orçamentos
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => handleEdit(item)} className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button type="button" aria-label="Excluir" title="Excluir" onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                          <Trash2 className="w-4 h-4" />
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

      {purchases.length > 0 && (
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
          <div className="p-5 border-b border-slate-50">
            <h2 className="font-display text-xl font-bold text-slate-900">Histórico de compras</h2>
            <p className="mt-1 text-sm text-slate-400">Controle de pedidos, entregas e responsáveis.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Pedra</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Área</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Comprou</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Recebeu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{purchase.materialName}</div>
                      <div className="text-xs text-brand-primary font-mono">{purchase.code || 'Sem lote'}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">{formatNumber(purchase.area)} m²</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase',
                        purchase.status === 'Entregue' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600',
                      )}>
                        {purchase.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{purchase.purchasedByName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{purchase.receivedByName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">Registrar compra</h2>
                <p className="mt-1 text-sm text-slate-400">Status inicial: Pedido · Comprado por {currentUserName}</p>
              </div>
              <button type="button" onClick={() => { setShowPurchaseModal(false); resetPurchaseForm(); }} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handlePurchaseSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Nome da Pedra</label>
                  <input type="text" required value={purchaseMaterialName} onChange={(e) => setPurchaseMaterialName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Código / Lote</label>
                  <input type="text" required value={purchaseCode} onChange={(e) => setPurchaseCode(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Fornecedor</label>
                  <input type="text" value={purchaseProvider} onChange={(e) => setPurchaseProvider(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Categoria</label>
                  <input type="text" value={purchaseCategory} onChange={(e) => setPurchaseCategory(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="grid grid-cols-3 gap-2 md:col-span-2">
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Comprimento (cm)</label>
                    <input type="number" required value={purchaseLength} onChange={(e) => setPurchaseLength(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Largura (cm)</label>
                    <input type="number" required value={purchaseWidth} onChange={(e) => setPurchaseWidth(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Espessura (cm)</label>
                    <input type="number" value={purchaseThickness} onChange={(e) => setPurchaseThickness(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Custo Total</label>
                  <input type="number" step="0.01" required value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Área calculada</label>
                  <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold text-slate-700">
                    {formatNumber((Number(purchaseLength) * Number(purchaseWidth)) / 10000)} m²
                  </div>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-500 font-medium text-sm">Observações</label>
                  <textarea value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[60px]" />
                </div>
              </div>

              <button type="submit" className="w-full bg-amber-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition-all active:scale-95">
                Registrar Pedido de Compra
              </button>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-slate-900">
                {editingItem ? 'Editar Pedra' : 'Nova Pedra no Estoque'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Nome da Pedra</label>
                  <input type="text" required value={materialName} onChange={(e) => setMaterialName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Código / Lote</label>
                  <input type="text" required value={code} onChange={(e) => setCode(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Fornecedor</label>
                  <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Categoria</label>
                  <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Granito, Mármore, Quartzo..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as InventoryItem['status'])} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium">
                    {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2 md:col-span-2">
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Comprimento (cm)</label>
                    <input type="number" required value={length} onChange={(e) => setLength(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Largura (cm)</label>
                    <input type="number" required value={width} onChange={(e) => setWidth(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-medium text-xs">Espessura (cm)</label>
                    <input type="number" value={thickness} onChange={(e) => setThickness(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Custo Total da Pedra</label>
                  <input type="number" step="0.01" required value={cost} onChange={(e) => setCost(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-slate-500 font-medium text-sm">Observações</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[60px]" />
                </div>
              </div>

              <button type="submit" className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95">
                {editingItem ? 'Salvar Alterações' : 'Adicionar ao Estoque'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
