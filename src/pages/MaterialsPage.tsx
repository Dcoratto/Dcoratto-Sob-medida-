import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { deleteFirestoreDoc } from '../lib/firestore-helpers';
import { Material } from '../types';
import { Plus, Search, Edit2, Trash2, X, Check } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';

export const MaterialsPage: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [pricePerM2, setPricePerM2] = useState('');
  const [provider, setProvider] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'materials'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const resetForm = () => {
    setName('');
    setPricePerM2('');
    setProvider('');
    setCategory('');
    setActive(true);
    setEditingMaterial(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name,
      pricePerM2: Number(pricePerM2),
      provider,
      category,
      active
    };

    if (editingMaterial) {
      await updateDoc(doc(db, 'materials', editingMaterial.id), data);
    } else {
      await addDoc(collection(db, 'materials'), data);
    }

    setShowModal(false);
    resetForm();
  };

  const handleEdit = (m: Material) => {
    setEditingMaterial(m);
    setName(m.name);
    setPricePerM2(m.pricePerM2.toString());
    setProvider(m.provider);
    setCategory(m.category);
    setActive(m.active);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Tem certeza que deseja excluir este material?");
    if (!confirmed) return;

    const ok = await deleteFirestoreDoc('materials', id);
    if (!ok) return;

    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.provider.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Materiais</h1>
          <p className="text-slate-500 mt-1">Gerencie o catálogo de pedras e valores por m².</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-brand-primary text-white px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Novo Material
        </button>
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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Valor/m²</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Carregando catálogo...</td></tr>
              ) : filteredMaterials.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Nenhum material encontrado.</td></tr>
              ) : (
                filteredMaterials.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{m.name}</div>
                      <div className="text-xs text-slate-400">{m.category}</div>
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-brand-primary">
                      {formatCurrency(m.pricePerM2)}
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {m.provider}
                    </td>
                    <td className="px-6 py-4">
                      {m.active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 uppercase">
                          <Check className="w-3 h-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 uppercase">
                          <X className="w-3 h-3" /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(m)}
                          className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          type="button"
                          aria-label="Excluir"
                          title="Excluir"
                          onClick={() => handleDelete(m.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
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
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-slate-900">
                {editingMaterial ? 'Editar Material' : 'Novo Material'}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Nome do Material</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Valor por m²</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={pricePerM2}
                    onChange={(e) => setPricePerM2(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 font-medium text-sm">Categoria</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Fornecedor</label>
                <input
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-5 h-5 rounded-md border-slate-300 text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="active" className="text-slate-700 font-medium cursor-pointer">Material Ativo</label>
              </div>

              <button
                type="submit"
                className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95"
              >
                {editingMaterial ? 'Salvar Alterações' : 'Cadastrar Material'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
