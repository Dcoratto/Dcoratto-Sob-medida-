import React, {useEffect, useState} from 'react';
import {addDoc, collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc} from 'firebase/firestore';
import {BriefcaseBusiness, CheckCircle2, Mail, Plus, Trash2, XCircle} from 'lucide-react';
import {db} from '../lib/firebase';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {Employee, EmployeeRole, Profile} from '../types';
import {cn} from '../lib/utils';

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeForm, setEmployeeForm] = useState<{name: string; role: EmployeeRole; phone: string}>({
    name: '',
    role: 'Medidor',
    phone: '',
  });

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('email', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allUsers = snapshot.docs.map((item) => ({uid: item.id, ...item.data()} as Profile));
      const uniqueUsers = allUsers.reduce((acc: Profile[], current) => {
        const exists = acc.find((item) => item.email === current.email);
        return exists ? acc : acc.concat([current]);
      }, []);
      setUsers(uniqueUsers);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'employees'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Employee)));
    });
    return unsubscribe;
  }, []);

  const toggleBlock = async (userId: string, isBlocked: boolean) => {
    await updateDoc(doc(db, 'profiles', userId), {blocked: !isBlocked});
  };

  const changeRole = async (userId: string, newRole: 'admin' | 'user') => {
    await updateDoc(doc(db, 'profiles', userId), {role: newRole});
  };

  const deleteUserProfile = async (userId: string) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este perfil?');
    if (!confirmed) return;
    const ok = await deleteFirestoreDoc('profiles', userId);
    if (!ok) return;
    setUsers((prev) => prev.filter((user) => user.uid !== userId));
  };

  const addEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeForm.name.trim()) return;
    await addDoc(collection(db, 'employees'), {
      name: employeeForm.name.trim(),
      role: employeeForm.role,
      phone: employeeForm.phone.trim(),
      active: true,
      createdAt: Timestamp.now(),
    });
    setEmployeeForm({name: '', role: 'Medidor', phone: ''});
  };

  const toggleEmployee = async (employee: Employee) => {
    await updateDoc(doc(db, 'employees', employee.id), {active: !employee.active});
  };

  const deleteEmployee = async (employeeId: string) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este funcionário?');
    if (!confirmed) return;
    const ok = await deleteFirestoreDoc('employees', employeeId);
    if (!ok) return;
    setEmployees((prev) => prev.filter((employee) => employee.id !== employeeId));
  };

  return (
    <div className="space-y-6 pb-20">
      <header>
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Administração</h1>
        <p className="text-slate-500 mt-1">Gerencie usuários, permissões e funcionários da produção.</p>
      </header>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">Funcionários</h2>
            <p className="text-sm text-slate-400">Cadastre a equipe para vincular responsáveis e avaliações aos projetos.</p>
          </div>
          <BriefcaseBusiness className="w-6 h-6 text-brand-primary" />
        </div>

        <form onSubmit={addEmployee} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] gap-3">
          <input
            value={employeeForm.name}
            onChange={(event) => setEmployeeForm((form) => ({...form, name: event.target.value}))}
            placeholder="Nome do funcionário"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20"
          />
          <select
            value={employeeForm.role}
            onChange={(event) => setEmployeeForm((form) => ({...form, role: event.target.value as EmployeeRole}))}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            {(['Vendedor', 'Medidor', 'Cortador', 'Acabador', 'Instalador', 'Entregador', 'Administrativo'] as EmployeeRole[]).map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <input
            value={employeeForm.phone}
            onChange={(event) => setEmployeeForm((form) => ({...form, phone: event.target.value}))}
            placeholder="Telefone"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20"
          />
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 font-bold text-white shadow-lg shadow-brand-primary/20">
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {employees.map((employee) => (
            <div key={employee.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900">{employee.name}</div>
                <div className="text-xs text-slate-400">{employee.role}{employee.phone ? ` · ${employee.phone}` : ''}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleEmployee(employee)}
                  className={cn('rounded-full px-3 py-1 text-[10px] font-bold uppercase', employee.active ? 'bg-green-50 text-green-700' : 'bg-slate-200 text-slate-500')}
                >
                  {employee.active ? 'Ativo' : 'Inativo'}
                </button>
                <button type="button" onClick={() => deleteEmployee(employee.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {employees.length === 0 && (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-400">Nenhum funcionário cadastrado.</div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-2">
        <div className="p-4">
          <h2 className="font-display text-xl font-bold text-slate-900">Usuários do sistema</h2>
          <p className="text-sm text-slate-400">Controle de acesso ao sistema.</p>
        </div>
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
                users.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{user.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(event) => changeRole(user.uid, event.target.value as 'admin' | 'user')}
                        className={cn('px-3 py-1 rounded-full text-[10px] font-bold uppercase outline-none', user.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500')}
                      >
                        <option value="user">Usuário</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleBlock(user.uid, user.blocked)}
                        className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all', user.blocked ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100')}
                      >
                        {user.blocked ? <><XCircle className="w-3 h-3" /> Bloqueado</> : <><CheckCircle2 className="w-3 h-3" /> Ativo</>}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button type="button" aria-label="Excluir" title="Excluir" onClick={() => deleteUserProfile(user.uid)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
