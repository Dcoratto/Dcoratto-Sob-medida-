import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { deleteFirestoreDoc } from '../lib/firestore-helpers';
import { Profile } from '../types';
import { Shield, Mail, Phone, Edit2, Trash2, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('email', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Profile));
      // Deduplicate by email just in case there are orphaned profiles with different UIDs but same email
      const uniqueUsers = allUsers.reduce((acc: Profile[], current) => {
        const x = acc.find(item => item.email === current.email);
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);
      setUsers(uniqueUsers);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const toggleBlock = async (userId: string, isBlocked: boolean) => {
    await updateDoc(doc(db, 'profiles', userId), { blocked: !isBlocked });
  };

  const changeRole = async (userId: string, newRole: 'admin' | 'user') => {
    await updateDoc(doc(db, 'profiles', userId), { role: newRole });
  };

  const deleteUserProfile = async (userId: string) => {
    const confirmed = window.confirm("Tem certeza que deseja excluir este perfil?");
    if (!confirmed) return;

    const ok = await deleteFirestoreDoc('profiles', userId);
    if (!ok) return;

    setUsers(prev => prev.filter(u => u.uid !== userId));
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Administração</h1>
        <p className="text-slate-500 mt-1">Gerencie os usuários e permissões do sistema.</p>
      </header>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Usuário</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Função</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400">Carregando usuários...</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {u.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        value={u.role}
                        onChange={(e) => changeRole(u.uid, e.target.value as any)}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase outline-none",
                          u.role === 'admin' ? "bg-purple-50 text-purple-600" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        <option value="user">Usuário</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleBlock(u.uid, u.blocked)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all",
                          u.blocked 
                            ? "bg-red-50 text-red-600 hover:bg-red-100" 
                            : "bg-green-50 text-green-600 hover:bg-green-100"
                        )}
                      >
                        {u.blocked ? (
                          <><XCircle className="w-3 h-3" /> Bloqueado</>
                        ) : (
                          <><CheckCircle2 className="w-3 h-3" /> Ativo</>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        type="button"
                        aria-label="Excluir"
                        title="Excluir"
                        onClick={() => deleteUserProfile(u.uid)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
