import React, {useEffect, useState} from 'react';
import {collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where} from 'firebase/firestore';
import {Check, Edit2, Search, Trash2, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {Material, UserMaterialPrice} from '../types';
import {cn, formatCurrency} from '../lib/utils';
import {useAuth} from '../contexts/AuthContext';

type MaterialWithUserPrice = Material & {
  userMarginPercentage?: number;
  userPricePerM2?: number;
};

export const MaterialsPage: React.FC = () => {
  const {user} = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [userPrices, setUserPrices] = useState<UserMaterialPrice[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [marginPercentage, setMarginPercentage] = useState('');
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

  const materialRows: MaterialWithUserPrice[] = materials.map((material) => {
    const userPrice = userPrices.find((price) => price.materialId === material.id);
    return {
      ...material,
      userMarginPercentage: userPrice?.marginPercentage ?? material.marginPercentage ?? 0,
      userPricePerM2: userPrice?.pricePerM2 ?? material.pricePerM2 ?? 0,
    };
  });

  const handleEdit = (material: MaterialWithUserPrice) => {
    setEditingMaterial(material);
    setMarginPercentage(String(material.userMarginPercentage ?? 0));
    setActive(material.active);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    const margin = Number(marginPercentage);
    const baseCost = editingMaterial.baseCostPerM2 ?? editingMaterial.pricePerM2 ?? 0;
    const pricePerM2 = baseCost * (1 + margin / 100);

    if (user?.uid) {
      await setDoc(doc(db, 'userMaterialPrices', `${user.uid}_${editingMaterial.id}`), {
        userId: user.uid,
        materialId: editingMaterial.id,
        baseCostPerM2: baseCost,
        marginPercentage: margin,
        pricePerM2,
        updatedAt: serverTimestamp(),
      }, {merge: true});
    }

    await updateDoc(doc(db, 'materials', editingMaterial.id), {active});

    setShowModal(false);
    setEditingMaterial(null);
  };

  const handleDelete = async (material: Material) => {
    const confirmed = window.confirm(`Excluir o material "${material.name}" da lista de venda?`);
    if (!confirmed) return;
    await deleteDoc(doc(db, 'materials', material.id));
  };

  const handleStatusChange = async (material: Material, nextActive: boolean) => {
    await updateDoc(doc(db, 'materials', material.id), {active: nextActive});
  };

  const filteredMaterials = materialRows.filter((material) => {
    const searchText = `${material.name} ${material.provider} ${material.category}`.toLowerCase();
    return searchText.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Materiais</h1>
          <p className="text-slate-500 mt-1">Controle os preços de venda das pedras cadastradas no estoque.</p>
        </div>
      </header>

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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Custo/m²</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Margem</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Venda/m²</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ?(
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Carregando materiais...</td></tr>
              ) : filteredMaterials.length === 0 ?(
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">Nenhum material encontrado. Cadastre uma pedra no estoque primeiro.</td></tr>
              ) : (
                filteredMaterials.map((material) => (
                  <tr key={material.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{material.name}</div>
                      <div className="text-xs text-slate-400">{material.category || 'Sem categoria'} · {material.provider || 'Sem fornecedor'}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-600">{formatCurrency(material.baseCostPerM2 ?? material.pricePerM2 ?? 0)}</td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-900">{material.userMarginPercentage ?? 0}%</td>
                    <td className="px-6 py-4 font-mono font-bold text-brand-primary">{formatCurrency(material.userPricePerM2 || 0)}</td>
                    <td className="px-6 py-4">
                      <select
                        value={material.active ?'active' : 'inactive'}
                        onChange={(e) => handleStatusChange(material, e.target.value === 'active')}
                        className={cn(
                          'cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold uppercase outline-none',
                          material.active ?'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100',
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
                        <button type="button" onClick={() => handleDelete(material)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Excluir material">
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

      {showModal && editingMaterial && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900">Preço de Venda</h2>
                <p className="text-sm text-slate-500 mt-1">{editingMaterial.name}</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Custo por m²</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-slate-600">
                    {formatCurrency(editingMaterial.baseCostPerM2 ?? editingMaterial.pricePerM2 ?? 0)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Margem (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={marginPercentage}
                    onChange={(e) => setMarginPercentage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Preço de venda calculado</div>
                <div className="text-2xl font-display font-bold text-brand-primary mt-1">
                  {formatCurrency((editingMaterial.baseCostPerM2 ?? editingMaterial.pricePerM2 ?? 0) * (1 + Number(marginPercentage || 0) / 100))}
                </div>
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
                Salvar Preço
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
