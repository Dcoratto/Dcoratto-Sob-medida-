import React, {useEffect, useState} from 'react';
import {addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc} from 'firebase/firestore';
import {Edit2, Filter, Plus, Search, Trash2, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {InventoryItem, Material} from '../types';
import {cn, formatCurrency, formatNumber} from '../lib/utils';

const statusOptions: InventoryItem['status'][] = ['Disponível', 'Reservada', 'Usada', 'Retalho', 'Descarte'];

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const InventoryPage: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
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

    return () => {
      unsubscribeItems();
      unsubscribeMaterials();
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

  const upsertMaterialFromInventory = async (inventoryId: string, area: number, totalCost: number) => {
    const existingMaterial = editingItem?.materialId
      ? materials.find((material) => material.id === editingItem.materialId)
      : materials.find((material) => slugify(material.name) === slugify(materialName));

    const materialId = existingMaterial?.id || slugify(materialName);
    const baseCostPerM2 = area > 0 ? totalCost / area : 0;
    const marginPercentage = existingMaterial?.marginPercentage ?? 0;
    const pricePerM2 = baseCostPerM2 * (1 + marginPercentage / 100);

    await setDoc(doc(db, 'materials', materialId), {
      name: materialName.trim(),
      provider: provider.trim(),
      category: category.trim(),
      baseCostPerM2,
      marginPercentage,
      pricePerM2,
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
    } else {
      await setDoc(inventoryRef, data);
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

    const ok = await deleteFirestoreDoc('inventory', id);
    if (!ok) return;

    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredItems = items.filter((item) => {
    const searchText = `${item.materialName} ${item.code} ${item.provider} ${item.category || ''}`.toLowerCase();
    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesStatus = !statusFilter || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalAvailableArea = items
    .filter((item) => item.status === 'Disponível')
    .reduce((acc, item) => acc + item.area, 0);

  const totalInventoryCost = items.reduce((acc, item) => acc + item.cost, 0);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total de Itens</div>
          <div className="text-3xl font-display font-bold text-slate-900">{items.length}</div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Área Disponível</div>
          <div className="text-3xl font-display font-bold text-brand-primary">{formatNumber(totalAvailableArea)} m²</div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Custo em Estoque</div>
          <div className="text-3xl font-display font-bold text-slate-900">{formatCurrency(totalInventoryCost)}</div>
        </div>
      </div>

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
