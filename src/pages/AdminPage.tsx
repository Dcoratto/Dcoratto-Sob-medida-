import React, {useEffect, useState} from 'react';
import {EmailAuthProvider, reauthenticateWithCredential} from 'firebase/auth';
import {addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch} from 'firebase/firestore';
import {deleteObject, ref as storageRef} from 'firebase/storage';
import {AlertTriangle, BriefcaseBusiness, CheckCircle2, Mail, Plus, ShieldAlert, Trash2, XCircle} from 'lucide-react';
import {auth, db, storage} from '../lib/firebase';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {useAuth} from '../contexts/AuthContext';
import {Employee, EmployeeRole, FixtureCatalogItem, FixtureCategory, Material, Profile} from '../types';
import {cn} from '../lib/utils';
import { SettingsPage } from './SettingsPage';

const employeeRoles: EmployeeRole[] = ['Vendedor', 'Medidor', 'Cortador', 'Acabador', 'Instalador', 'Entregador', 'Administrativo'];
const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
const resetCollections = [
  'clients',
  'quotes',
  'employees',
  'materials',
  'inventory',
  'inventoryReservations',
  'inventoryPurchases',
  'condominiums',
  'systemEvents',
];

const MAX_IMAGE_SIZE_MB = 8;
const MAX_STORED_IMAGE_BYTES = 850 * 1024;
const IMAGE_MAX_SIDE = 900;

const assertValidImage = (file: File) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    throw new Error(`A imagem deve ter no máximo ${MAX_IMAGE_SIZE_MB} MB.`);
  }
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });

const dataUrlSize = (dataUrl: string) => Math.ceil((dataUrl.length * 3) / 4);

const optimizeCatalogImage = async (file: File) => {
  assertValidImage(file);
  const source = await readFileAsDataUrl(file);

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem selecionada.'));
    img.src = source;
  });

  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível preparar a imagem.');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlSize(dataUrl) <= MAX_STORED_IMAGE_BYTES) {
      return dataUrl;
    }
  }

  throw new Error('A imagem ficou muito pesada. Tente uma imagem menor ou mais simples.');
};

export const AdminPage: React.FC = () => {
  const {isAdmin} = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeError, setEmployeeError] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resettingData, setResettingData] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [employeeForm, setEmployeeForm] = useState<{name: string; role: EmployeeRole; phone: string}>({
    name: '',
    role: 'Medidor',
    phone: '',
  });
  const [fixtureCatalog, setFixtureCatalog] = useState<FixtureCatalogItem[]>([]);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialError, setMaterialError] = useState('');
  const [materialImageFile, setMaterialImageFile] = useState<File | null>(null);
  const [materialForm, setMaterialForm] = useState({
    name: '',
    provider: '',
    category: '',
    baseCostPerM2: '',
    marginPercentage: '',
  });
  const [savingFixture, setSavingFixture] = useState(false);
  const [fixtureError, setFixtureError] = useState('');
  const [fixtureImageFile, setFixtureImageFile] = useState<File | null>(null);
  const [fixtureForm, setFixtureForm] = useState<{
    name: string;
    category: FixtureCategory;
    brand: string;
    model: string;
    imageUrl: string;
    notes: string;
  }>({
    name: '',
    category: 'cooktop',
    brand: '',
    model: '',
    imageUrl: '',
    notes: '',
  });

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('email', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allUsers = snapshot.docs.map((item) => ({uid: item.id, ...item.data()} as Profile));
      const uniqueUsers = allUsers.reduce((acc: Profile[], current) => {
        const exists = acc.find((item) => item.email === current.email);
        return exists ?acc : acc.concat([current]);
      }, []);
      setUsers(uniqueUsers);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'materials'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMaterials(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Material)));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'fixtureCatalog'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFixtureCatalog(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as FixtureCatalogItem)));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'employees'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEmployees(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Employee)));
        setEmployeeError('');
      },
      (error) => {
        console.error('Erro ao carregar funcionarios:', error);
        setEmployeeError('Nao foi possivel carregar os funcionarios agora.');
      },
    );
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
    const employeeName = employeeForm.name.trim();
    if (!employeeName) {
      setEmployeeError('Informe o nome do funcionario antes de adicionar.');
      return;
    }

    setSavingEmployee(true);
    setEmployeeError('');
    try {
      await addDoc(collection(db, 'employees'), {
        name: employeeName,
        role: employeeForm.role,
        phone: employeeForm.phone.trim(),
        active: true,
        createdAt: Timestamp.now(),
      });
      setEmployeeForm({name: '', role: 'Medidor', phone: ''});
    } catch (error) {
      console.error('Erro ao adicionar funcionario:', error);
      setEmployeeError('Nao foi possivel adicionar o funcionario. Confira sua conexao e tente novamente.');
    } finally {
      setSavingEmployee(false);
    }
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

  const addMaterialCatalogItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = materialForm.name.trim();
    if (!name) return;

    const baseCostPerM2 = Number(materialForm.baseCostPerM2) || 0;
    const marginPercentage = Number(materialForm.marginPercentage) || 0;
    const pricePerM2 = baseCostPerM2 * (1 + marginPercentage / 100);

    setSavingMaterial(true);
    setMaterialError('');
    try {
      const materialId = slugify(name);
      let imageUrl = '';
      if (materialImageFile) {
        imageUrl = await optimizeCatalogImage(materialImageFile);
      }
      await setDoc(doc(db, 'materials', materialId), {
        name,
        provider: materialForm.provider.trim(),
        category: materialForm.category.trim(),
        baseCostPerM2,
        marginPercentage,
        pricePerM2,
        ...(imageUrl ?{imageUrl} : {}),
        active: true,
        updatedAt: serverTimestamp(),
      }, {merge: true});
      setMaterialForm({name: '', provider: '', category: '', baseCostPerM2: '', marginPercentage: ''});
      setMaterialImageFile(null);
    } catch (error: any) {
      console.error('Erro ao cadastrar pedra:', error);
      setMaterialError(error?.message || 'Não foi possível cadastrar a pedra com imagem.');
    } finally {
      setSavingMaterial(false);
    }
  };

  const toggleMaterialCatalogItem = async (material: Material) => {
    await updateDoc(doc(db, 'materials', material.id), {active: !material.active, updatedAt: serverTimestamp()});
  };

  const addFixtureCatalogItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fixtureForm.name.trim()) return;
    setSavingFixture(true);
    setFixtureError('');
    try {
      let imageUrl = fixtureForm.imageUrl.trim();
      if (fixtureImageFile) {
        imageUrl = await optimizeCatalogImage(fixtureImageFile);
      }
      await addDoc(collection(db, 'fixtureCatalog'), {
        name: fixtureForm.name.trim(),
        category: fixtureForm.category,
        brand: fixtureForm.brand.trim(),
        model: fixtureForm.model.trim(),
        imageUrl,
        notes: fixtureForm.notes.trim(),
        active: true,
        createdAt: Timestamp.now(),
      });
      setFixtureForm({
        name: '',
        category: fixtureForm.category,
        brand: '',
        model: '',
        imageUrl: '',
        notes: '',
      });
      setFixtureImageFile(null);
    } catch (error: any) {
      console.error('Erro ao cadastrar peça:', error);
      setFixtureError(error?.message || 'Não foi possível cadastrar a peça com imagem.');
    } finally {
      setSavingFixture(false);
    }
  };

  const toggleFixtureCatalogItem = async (item: FixtureCatalogItem) => {
    await updateDoc(doc(db, 'fixtureCatalog', item.id), {active: !item.active});
  };

  const deleteStoredFile = async (fileUrl?: unknown) => {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) return;

    try {
      await deleteObject(storageRef(storage, fileUrl));
    } catch (error) {
      console.warn('Nao foi possivel excluir arquivo armazenado:', error);
    }
  };

  const deleteCollectionData = async (collectionName: string) => {
    const snapshot = await getDocs(collection(db, collectionName));
    let batch = writeBatch(db);
    let batchSize = 0;
    let deleted = 0;

    for (const item of snapshot.docs) {
      if (collectionName === 'inventory') {
        await deleteStoredFile(item.data().photoUrl);
      }

      batch.delete(item.ref);
      batchSize += 1;
      deleted += 1;

      if (batchSize === 450) {
        await batch.commit();
        batch = writeBatch(db);
        batchSize = 0;
      }
    }

    if (batchSize > 0) {
      await batch.commit();
    }

    return deleted;
  };

  const resetOperationalData = async (event: React.FormEvent) => {
    event.preventDefault();
    setResetError('');
    setResetMessage('');

    if (!isAdmin) {
      setResetError('Apenas administradores podem limpar os dados do sistema.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      setResetError('Nao foi possivel confirmar sua conta. Entre novamente e tente de novo.');
      return;
    }

    if (!resetPassword) {
      setResetError('Digite a senha da sua conta para confirmar.');
      return;
    }

    if (resetConfirmation.trim().toUpperCase() !== 'RESETAR') {
      setResetError('Digite RESETAR no campo de confirmacao.');
      return;
    }

    const confirmed = window.confirm('Esta acao vai apagar clientes, orcamentos, materiais, estoque, compras, funcionarios, condominios e historico. Deseja continuar?');
    if (!confirmed) return;

    setResettingData(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, resetPassword);
      await reauthenticateWithCredential(currentUser, credential);

      let totalDeleted = 0;
      for (const collectionName of resetCollections) {
        totalDeleted += await deleteCollectionData(collectionName);
      }

      setResetPassword('');
      setResetConfirmation('');
      setResetMessage(`${totalDeleted} registros foram excluidos. Usuarios, permissoes e configuracoes foram mantidos.`);
    } catch (error) {
      console.error('Erro ao resetar dados:', error);
      setResetError('Nao foi possivel limpar os dados. Confira a senha e tente novamente.');
    } finally {
      setResettingData(false);
    }
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

        <div className="space-y-2">
        <form onSubmit={addEmployee} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] gap-3">
          <input
            value={employeeForm.name}
            onChange={(event) => {
              setEmployeeError('');
              setEmployeeForm((form) => ({...form, name: event.target.value}));
            }}
            placeholder="Nome do funcionário"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20"
          />
          <select
            value={employeeForm.role}
            onChange={(event) => setEmployeeForm((form) => ({...form, role: event.target.value as EmployeeRole}))}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            {employeeRoles.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <input
            value={employeeForm.phone}
            onChange={(event) => setEmployeeForm((form) => ({...form, phone: event.target.value}))}
            placeholder="Telefone"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20"
          />
          <button type="submit" disabled={savingEmployee} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-3 font-bold text-white shadow-lg shadow-brand-primary/20 disabled:cursor-not-allowed disabled:opacity-60">
            <Plus className="w-4 h-4" />
            {savingEmployee ?'Adicionando...' : 'Adicionar'}
          </button>
        </form>
        {employeeError && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {employeeError}
          </div>
        )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {employees.map((employee) => (
            <div key={employee.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900">{employee.name}</div>
                <div className="text-xs text-slate-400">{employee.role}{employee.phone ?` · ${employee.phone}` : ''}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleEmployee(employee)}
                  className={cn('rounded-full px-3 py-1 text-[10px] font-bold uppercase', employee.active ?'bg-green-50 text-green-700' : 'bg-slate-200 text-slate-500')}
                >
                  {employee.active ?'Ativo' : 'Inativo'}
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

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-6 space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">Catálogo de pedras</h2>
          <p className="text-sm text-slate-400">Cadastre as pedras aqui para seleção no estoque, compras e orçamentos.</p>
        </div>

        <form onSubmit={addMaterialCatalogItem} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <input value={materialForm.name} onChange={(event) => setMaterialForm((form) => ({...form, name: event.target.value}))} placeholder="Nome da pedra" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input value={materialForm.provider} onChange={(event) => setMaterialForm((form) => ({...form, provider: event.target.value}))} placeholder="Fornecedor" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input value={materialForm.category} onChange={(event) => setMaterialForm((form) => ({...form, category: event.target.value}))} placeholder="Categoria" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input type="number" step="0.01" value={materialForm.baseCostPerM2} onChange={(event) => setMaterialForm((form) => ({...form, baseCostPerM2: event.target.value}))} placeholder="Custo/m²" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input type="number" step="0.01" value={materialForm.marginPercentage} onChange={(event) => setMaterialForm((form) => ({...form, marginPercentage: event.target.value}))} placeholder="Margem %" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 cursor-pointer">
            {materialImageFile ?materialImageFile.name : 'Imagem da pedra'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                setMaterialError('');
                setMaterialImageFile(event.target.files?.[0] || null);
              }}
            />
          </label>
          <button type="submit" disabled={savingMaterial} className="rounded-2xl bg-brand-primary px-4 py-3 font-bold text-white disabled:opacity-60">
            {savingMaterial ?'Salvando...' : 'Cadastrar pedra'}
          </button>
        </form>

        {materialError && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {materialError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {materials.map((material) => (
            <div key={material.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              {material.imageUrl && <img src={material.imageUrl} alt={material.name} className="mb-3 h-28 w-full rounded-xl object-cover" />}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900">{material.name}</div>
                  <div className="text-xs text-slate-400">{material.category || 'Sem categoria'} · {material.provider || 'Sem fornecedor'}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">Venda/m²: R$ {(material.pricePerM2 || 0).toFixed(2)}</div>
                </div>
                <button type="button" onClick={() => toggleMaterialCatalogItem(material)} className={cn('rounded-full px-3 py-1 text-[10px] font-bold uppercase', material.active ?'bg-green-50 text-green-700' : 'bg-slate-200 text-slate-500')}>
                  {material.active ?'Ativo' : 'Inativo'}
                </button>
              </div>
            </div>
          ))}
          {materials.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-400">Nenhuma pedra cadastrada.</div>}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-6 space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">Catálogo de peças do cliente</h2>
          <p className="text-sm text-slate-400">Cadastre cooktop, cuba, torneira, torre de tomada e lixeira para seleção no orçamento.</p>
        </div>

        <form onSubmit={addFixtureCatalogItem} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input value={fixtureForm.name} onChange={(e) => setFixtureForm((f) => ({...f, name: e.target.value}))} placeholder="Nome da peça" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <select value={fixtureForm.category} onChange={(e) => setFixtureForm((f) => ({...f, category: e.target.value as FixtureCategory}))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <option value="cooktop">Cooktop</option>
            <option value="sink">Cuba</option>
            <option value="faucet">Torneira</option>
            <option value="popUpTower">Torre de tomada</option>
            <option value="trashBin">Lixeira de embutir</option>
          </select>
          <input value={fixtureForm.brand} onChange={(e) => setFixtureForm((f) => ({...f, brand: e.target.value}))} placeholder="Marca" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input value={fixtureForm.model} onChange={(e) => setFixtureForm((f) => ({...f, model: e.target.value}))} placeholder="Modelo" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input value={fixtureForm.imageUrl} onChange={(e) => setFixtureForm((f) => ({...f, imageUrl: e.target.value}))} placeholder="URL da imagem" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2 xl:col-span-2" />
          <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 cursor-pointer md:col-span-2 xl:col-span-1">
            {fixtureImageFile ? fixtureImageFile.name : 'Upload da imagem'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                setFixtureError('');
                setFixtureImageFile(event.target.files?.[0] || null);
              }}
            />
          </label>
          <input value={fixtureForm.notes} onChange={(e) => setFixtureForm((f) => ({...f, notes: e.target.value}))} placeholder="Informações" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2 xl:col-span-1" />
          <button type="submit" disabled={savingFixture} className="rounded-2xl bg-brand-primary px-4 py-3 font-bold text-white disabled:opacity-60">
            {savingFixture ?'Salvando...' : 'Cadastrar peça'}
          </button>
        </form>

        {fixtureError && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {fixtureError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {fixtureCatalog.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900">{item.name}</div>
                  <div className="text-xs text-slate-400">{item.category} · {[item.brand, item.model].filter(Boolean).join(' / ')}</div>
                </div>
                <button type="button" onClick={() => toggleFixtureCatalogItem(item)} className={cn('rounded-full px-3 py-1 text-[10px] font-bold uppercase', item.active ?'bg-green-50 text-green-700' : 'bg-slate-200 text-slate-500')}>
                  {item.active ?'Ativo' : 'Inativo'}
                </button>
              </div>
            </div>
          ))}
          {fixtureCatalog.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-400">Nenhuma peça cadastrada.</div>}
        </div>
      </section>

      <section className="space-y-4">
        <div className="sr-only">
          <h2 className="font-display text-xl font-bold text-slate-900">Configurações do sistema</h2>
          <p className="text-sm text-slate-400">As configurações foram migradas para a área de Admin.</p>
        </div>
        <SettingsPage />
      </section>

      {isAdmin && (
        <section className="rounded-[32px] border border-red-100 bg-red-50/60 p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-red-950">Zona de risco</h2>
                <p className="mt-1 max-w-3xl text-sm text-red-700">
                  Use este botão apenas quando o sistema estiver pronto para começar do zero. Ele apaga clientes, orçamentos, materiais, estoque, reservas, compras, funcionários, condomínios e histórico.
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  Usuários, permissões e configurações da empresa serão mantidos.
                </p>
              </div>
            </div>

            <form onSubmit={resetOperationalData} className="w-full max-w-xl space-y-3 rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(event) => {
                    setResetError('');
                    setResetPassword(event.target.value);
                  }}
                  placeholder="Senha da conta"
                  className="rounded-2xl border border-red-100 bg-red-50/40 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-200"
                />
                <input
                  value={resetConfirmation}
                  onChange={(event) => {
                    setResetError('');
                    setResetConfirmation(event.target.value);
                  }}
                  placeholder="Digite RESETAR"
                  className="rounded-2xl border border-red-100 bg-red-50/40 px-4 py-3 text-sm uppercase outline-none focus:ring-2 focus:ring-red-200"
                />
              </div>
              <button
                type="submit"
                disabled={resettingData}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 font-bold text-white shadow-lg shadow-red-600/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {resettingData ?'Limpando dados...' : 'Excluir todos os dados operacionais'}
              </button>
              {resetError && <p className="text-sm font-semibold text-red-600">{resetError}</p>}
              {resetMessage && <p className="text-sm font-semibold text-green-700">{resetMessage}</p>}
            </form>
          </div>
        </section>
      )}

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
              {loading ?(
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
                        className={cn('px-3 py-1 rounded-full text-[10px] font-bold uppercase outline-none', user.role === 'admin' ?'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500')}
                      >
                        <option value="user">Usuário</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleBlock(user.uid, user.blocked)}
                        className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all', user.blocked ?'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100')}
                      >
                        {user.blocked ?<><XCircle className="w-3 h-3" /> Bloqueado</> : <><CheckCircle2 className="w-3 h-3" /> Ativo</>}
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
