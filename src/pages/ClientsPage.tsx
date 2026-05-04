import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { deleteFirestoreDoc } from '../lib/firestore-helpers';
import { Client } from '../types';
import { Plus, Search, Edit2, Trash2, X, User, Phone, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';

export const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const resetForm = () => {
    setName('');
    setPhone('');
    setAddress('');
    setNotes('');
    setEditingClient(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { name, phone, address, notes };

    if (editingClient) {
      await updateDoc(doc(db, 'clients', editingClient.id), data);
    } else {
      await addDoc(collection(db, 'clients'), data);
    }

    setShowModal(false);
    resetForm();
  };

  const handleEdit = (c: Client) => {
    setEditingClient(c);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address);
    setNotes(c.notes);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Tem certeza que deseja excluir este cliente?");
    if (!confirmed) return;

    const ok = await deleteFirestoreDoc('clients', id);
    if (!ok) return;

    setClients(prev => prev.filter(c => c.id !== id));
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Clientes</h1>
          <p className="text-slate-500 mt-1">Gerencie seu banco de dados de clientes.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-brand-primary text-white px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Novo Cliente
        </button>
      </header>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="p-4 border-b border-slate-50">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar clientes por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-400">Carregando clientes...</div>
          ) : filteredClients.length === 0 ? (
            <div className="col-span-full py-20 text-center text-slate-400">Nenhum cliente cadastrado.</div>
          ) : (
            filteredClients.map((c) => (
              <div key={c.id} className="group relative bg-slate-50 border border-slate-100 p-6 rounded-[24px] hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300">
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(c)}
                    className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    aria-label="Excluir"
                    title="Excluir"
                    onClick={() => handleDelete(c.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-brand-primary border border-slate-100">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-slate-900 group-hover:text-brand-primary transition-colors">{c.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mt-0.5">
                      <Phone className="w-3 h-3" />
                      {c.phone}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-slate-600">
                    <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                    <span className="line-clamp-2">{c.address || 'Sem endereço cadastrado'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-slate-900">
                {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
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
                <label className="text-slate-500 font-medium text-sm">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Telefone</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Endereço</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[80px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-sm">Observações</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[60px]"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-95"
              >
                {editingClient ? 'Salvar Alterações' : 'Cadastrar Cliente'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
