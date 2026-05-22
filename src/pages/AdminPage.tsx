import React, {useEffect, useState} from 'react';
import {addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch} from '../lib/firestore';
import {deleteObject, ref as storageRef} from '../lib/storage';
import {AlertTriangle, BriefcaseBusiness, CheckCircle2, ChevronDown, Mail, Pencil, Plus, ShieldAlert, Trash2, XCircle} from 'lucide-react';
import {db} from '../lib/firestore';
import {storage} from '../lib/storage';
import {deleteFirestoreDoc} from '../lib/firestore-helpers';
import {useAuth} from '../contexts/AuthContext';
import {AccessRole, AccessUser, Employee, EmployeeRole, FixtureCatalogItem, FixtureCategory, Material, PermissionMap} from '../types';
import {cn} from '../lib/utils';
import { SettingsPage } from './SettingsPage';
import {ACCESS_ROLES, ACTION_LABELS, getDefaultPermissions, hasPermission, isMasterAdmin, mergePermissions, MODULE_LABELS, roleLabel} from '../lib/permissions';
import {logAuditEvent} from '../lib/auditLogs';
import {optimizeImageFile, readFileAsDataUrl} from '../lib/imageUtils';
import {useSettings} from '../hooks/useSettings';

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
  'fixtureCatalog',
  'inventory',
  'inventoryReservations',
  'inventoryPurchases',
  'condominiums',
  'systemEvents',
];

const MAX_IMAGE_SIZE_MB = 8;
const MAX_STORED_IMAGE_BYTES = 850 * 1024;
const IMAGE_MAX_SIDE = 900;
const parseThicknessValue = (label: string) => Number(String(label || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
const DEFAULT_STONE_CATEGORIES = [
  'Granito',
  'Mármore',
  'Quartzito',
  'Quartzo',
  'Lâmina Ultracompacta',
  'Porcelanato',
  'Superfície Sinterizada',
];
const DEFAULT_STONE_LINES = [
  'Nacional',
  'Importado',
  'Premium',
  'Super Premium',
];

const assertValidImage = (file: File) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem valido.');
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    throw new Error(`A imagem deve ter no maximo ${MAX_IMAGE_SIZE_MB} MB.`);
  }
};

const optimizeCatalogImage = async (file: File) => {
  assertValidImage(file);
  return optimizeImageFile(file, {
    maxBytes: MAX_STORED_IMAGE_BYTES,
    maxSide: IMAGE_MAX_SIDE,
    mimeType: 'image/webp',
  });
};

const getCatalogSaveErrorMessage = (error: any, itemName: string) => {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  if (code.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
    return `Sem permissão para salvar ${itemName}. Entre novamente e confirme se o acesso ao sistema foi liberado corretamente.`;
  }
  return message || `Não foi possível cadastrar ${itemName}.`;
};

const AdminAccordionSection: React.FC<{
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({title, description, defaultOpen = false, children}) => (
  <details open={defaultOpen} className="group rounded-[32px] border border-slate-100 bg-white shadow-sm overflow-hidden">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 md:p-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      <ChevronDown className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180" />
    </summary>
    <div className="px-5 pb-5 md:px-6 md:pb-6">
      {children}
    </div>
  </details>
);

export const AdminPage: React.FC = () => {
  const {isAdmin, accessUser, user: authUser, isMasterAdmin: masterAdmin} = useAuth();
  const {settings} = useSettings();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeError, setEmployeeError] = useState('');
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
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [materialImageFile, setMaterialImageFile] = useState<File | null>(null);
  const [materialForm, setMaterialForm] = useState({
    name: '',
    provider: '',
    category: '',
    materialLine: '',
    materialType: 'Chapa',
    thicknessLabel: '',
    texture: '',
  });
  const [savingFixture, setSavingFixture] = useState(false);
  const [fixtureError, setFixtureError] = useState('');
  const [editingFixture, setEditingFixture] = useState<FixtureCatalogItem | null>(null);
  const [fixtureImageFile, setFixtureImageFile] = useState<File | null>(null);
  const [fixtureManualFile, setFixtureManualFile] = useState<File | null>(null);
  const [fixtureForm, setFixtureForm] = useState<{
    name: string;
    category: FixtureCategory;
    brand: string;
    model: string;
    width: string;
    depth: string;
    height: string;
    diameter: string;
    imageUrl: string;
    manualUrl: string;
    manualFileName: string;
    notes: string;
  }>({
    name: '',
    category: 'cooktop',
    brand: '',
    model: '',
    width: '',
    depth: '',
    height: '',
    diameter: '',
    imageUrl: '',
    manualUrl: '',
    manualFileName: '',
    notes: '',
  });

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('email', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allUsers = snapshot.docs.map((item) => ({uid: item.id, ...item.data()} as AccessUser));
      const uniqueUsers = allUsers.reduce((acc: AccessUser[], current) => {
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
        console.error('Erro ao carregar funcionários:', error);
        setEmployeeError('Não foi possível carregar os funcionários agora.');
      },
    );
    return unsubscribe;
  }, []);

  const canAlterUsers = masterAdmin && hasPermission(accessUser, 'admin', 'alterarPermissoes');

  const toggleBlock = async (target: AccessUser) => {
    if (isMasterAdmin(target) || !masterAdmin) return;
    await updateDoc(doc(db, 'users', target.uid), {
      blocked: !target.blocked,
      updatedAt: serverTimestamp(),
      updatedByUid: authUser?.uid || '',
      updatedByEmail: authUser?.email || '',
      updatedByName: accessUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário',
    });
    await logAuditEvent({user: accessUser || authUser, action: 'toggle_user_block', module: 'admin', targetId: target.uid, oldValue: target.blocked, newValue: !target.blocked});
  };

  const changeRole = async (target: AccessUser, newRole: AccessRole) => {
    if (isMasterAdmin(target) || !masterAdmin) return;
    const nextPermissions = getDefaultPermissions(newRole);
    await updateDoc(doc(db, 'users', target.uid), {
      role: newRole,
      permissions: nextPermissions,
      updatedAt: serverTimestamp(),
      updatedByUid: authUser?.uid || '',
      updatedByEmail: authUser?.email || '',
      updatedByName: accessUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário',
    });
    await logAuditEvent({user: accessUser || authUser, action: 'change_user_role', module: 'admin', targetId: target.uid, oldValue: target.role, newValue: newRole});
  };

  const updateUserPermission = async (target: AccessUser, module: keyof PermissionMap, action: string, checked: boolean) => {
    if (isMasterAdmin(target) || !masterAdmin) return;
    const currentPermissions = mergePermissions(target);
    const nextPermissions = {
      ...currentPermissions,
      [module]: {
        ...(currentPermissions[module] as any),
        [action]: checked,
      },
    };
    await updateDoc(doc(db, 'users', target.uid), {
      permissions: nextPermissions,
      updatedAt: serverTimestamp(),
      updatedByUid: authUser?.uid || '',
      updatedByEmail: authUser?.email || '',
      updatedByName: accessUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário',
    });
    await logAuditEvent({user: accessUser || authUser, action: 'change_user_permission', module: 'admin', targetId: target.uid, oldValue: target.permissions?.[module]?.[action as never], newValue: checked});
  };

  const deleteUserProfile = async (target: AccessUser) => {
    if (isMasterAdmin(target) || !masterAdmin) return;
    const confirmed = window.confirm('Tem certeza que deseja excluir este perfil?');
    if (!confirmed) return;
    const ok = await deleteFirestoreDoc('users', target.uid);
    if (!ok) return;
    await logAuditEvent({user: accessUser || authUser, action: 'delete_user_access', module: 'admin', targetId: target.uid, oldValue: target, newValue: null});
    setUsers((prev) => prev.filter((user) => user.uid !== target.uid));
  };

  const addEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    const employeeName = employeeForm.name.trim();
    if (!employeeName) {
      setEmployeeError('Informe o nome do funcionário antes de adicionar.');
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
      console.error('Erro ao adicionar funcionário:', error);
      setEmployeeError('Não foi possível adicionar o funcionário. Confira sua conexão e tente novamente.');
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

  const resetMaterialForm = () => {
    setEditingMaterial(null);
    setMaterialForm({
      name: '',
      provider: '',
      category: '',
      materialLine: '',
      materialType: 'Chapa',
      thicknessLabel: '',
      texture: '',
    });
    setMaterialImageFile(null);
    setMaterialError('');
  };

  const startEditingMaterial = (material: Material) => {
    setEditingMaterial(material);
    setMaterialForm({
      name: material.name || '',
      provider: material.provider || '',
      category: material.category || '',
      materialLine: material.materialLine || material.category || '',
      materialType: material.materialType || 'Chapa',
      thicknessLabel: material.thicknessLabel || '',
      texture: material.texture || '',
    });
    setMaterialImageFile(null);
    setMaterialError('');
  };

  const resetFixtureForm = (category: FixtureCategory = fixtureForm.category) => {
    setEditingFixture(null);
    setFixtureForm({
      name: '',
      category,
      brand: '',
      model: '',
      width: '',
      depth: '',
      height: '',
      diameter: '',
      imageUrl: '',
      manualUrl: '',
      manualFileName: '',
      notes: '',
    });
    setFixtureImageFile(null);
    setFixtureManualFile(null);
    setFixtureError('');
  };

  const startEditingFixture = (item: FixtureCatalogItem) => {
    setEditingFixture(item);
    setFixtureForm({
      name: item.name || '',
      category: item.category,
      brand: item.brand || '',
      model: item.model || '',
      width: item.width ?String(item.width).replace('.', ',') : '',
      depth: item.depth ?String(item.depth).replace('.', ',') : '',
      height: item.height ?String(item.height).replace('.', ',') : '',
      diameter: item.diameter ?String(item.diameter).replace('.', ',') : '',
      imageUrl: item.imageUrl || '',
      manualUrl: item.manualUrl || '',
      manualFileName: item.manualFileName || '',
      notes: item.notes || '',
    });
    setFixtureImageFile(null);
    setFixtureManualFile(null);
    setFixtureError('');
  };

  const addMaterialCatalogItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = materialForm.name.trim();
    if (!name) return;

    setSavingMaterial(true);
    setMaterialError('');
    try {
      const materialLine = materialForm.materialLine.trim();
      const materialType = materialForm.materialType.trim() || 'Chapa';
      const thicknessLabel = materialForm.thicknessLabel.trim();
      const texture = materialForm.texture.trim();
      let imageUrl = editingMaterial?.imageUrl || '';
      if (materialImageFile) {
        imageUrl = await optimizeCatalogImage(materialImageFile);
      }
      const materialPayload = {
        name,
        provider: materialForm.provider.trim(),
        category: materialForm.category.trim(),
        materialLine,
        materialType,
        thicknessLabel,
        texture,
        thickness: parseThicknessValue(thicknessLabel),
        baseCostPerM2: editingMaterial?.baseCostPerM2 ?? 0,
        marginPercentage: editingMaterial?.marginPercentage ?? 0,
        pricePerM2: editingMaterial?.pricePerM2 ?? 0,
        ...(imageUrl ?{imageUrl} : {}),
        active: editingMaterial?.active ?? true,
        updatedAt: serverTimestamp(),
      };
      if (editingMaterial?.id) {
        await setDoc(doc(db, 'materials', editingMaterial.id), materialPayload, {merge: true});
      } else {
        await addDoc(collection(db, 'materials'), {
          ...materialPayload,
          createdAt: serverTimestamp(),
        });
      }
      resetMaterialForm();
    } catch (error: any) {
      console.error('Erro ao cadastrar pedra:', error);
      setMaterialError(getCatalogSaveErrorMessage(error, 'a pedra'));
    } finally {
      setSavingMaterial(false);
    }
  };

  const toggleMaterialCatalogItem = async (material: Material) => {
    await updateDoc(doc(db, 'materials', material.id), {active: !material.active, updatedAt: serverTimestamp()});
  };

  const deleteMaterialCatalogItem = async (material: Material) => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir a pedra "${material.name}"?`);
    if (!confirmed) return;
    const ok = await deleteFirestoreDoc('materials', material.id);
    if (!ok) return;
    if (editingMaterial?.id === material.id) {
      resetMaterialForm();
    }
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
      let manualUrl = fixtureForm.manualUrl.trim();
      let manualFileName = fixtureForm.manualFileName.trim();
      if (fixtureManualFile) {
        if (fixtureManualFile.type.startsWith('image/')) {
          manualUrl = await optimizeCatalogImage(fixtureManualFile);
        } else {
          manualUrl = await readFileAsDataUrl(fixtureManualFile);
        }
        manualFileName = fixtureManualFile.name;
      }
      const imagePayload = imageUrl ?{imageUrl} : {};
      const fixturePayload = {
        name: fixtureForm.name.trim(),
        category: fixtureForm.category,
        brand: fixtureForm.brand.trim(),
        model: fixtureForm.model.trim(),
        width: Number(fixtureForm.width.replace(',', '.')) || 0,
        depth: Number(fixtureForm.depth.replace(',', '.')) || 0,
        height: Number(fixtureForm.height.replace(',', '.')) || 0,
        diameter: Number(fixtureForm.diameter.replace(',', '.')) || 0,
        ...imagePayload,
        manualUrl,
        manualFileName,
        notes: fixtureForm.notes.trim(),
        active: editingFixture?.active ?? true,
        updatedAt: Timestamp.now(),
      };
      if (editingFixture) {
        await updateDoc(doc(db, 'fixtureCatalog', editingFixture.id), fixturePayload);
      } else {
        await addDoc(collection(db, 'fixtureCatalog'), {
          ...fixturePayload,
          createdAt: Timestamp.now(),
        });
      }
      resetFixtureForm(fixtureForm.category);
    } catch (error: any) {
      console.error('Erro ao cadastrar peça:', error);
      setFixtureError(getCatalogSaveErrorMessage(error, 'a peça'));
    } finally {
      setSavingFixture(false);
    }
  };

  const toggleFixtureCatalogItem = async (item: FixtureCatalogItem) => {
    await updateDoc(doc(db, 'fixtureCatalog', item.id), {active: !item.active});
  };

  const materialCatalog = settings.materialCatalog;
  const supplierOptions = materialCatalog.suppliers || [];
  const thicknessOptions = materialForm.materialType === 'Lamina' ? materialCatalog.slabThicknesses : materialCatalog.naturalThicknesses;
  const categoryOptions = materialCatalog.materialCategories?.length ? materialCatalog.materialCategories : DEFAULT_STONE_CATEGORIES;
  const materialLineOptions = materialCatalog.materialLines?.length ? materialCatalog.materialLines : DEFAULT_STONE_LINES;

  const deleteStoredFile = async (fileUrl?: unknown) => {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) return;

    try {
      await deleteObject(storageRef(storage, fileUrl));
    } catch (error) {
      console.warn('Não foi possível excluir arquivo armazenado:', error);
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

      if (collectionName === 'fixtureCatalog') {
        await deleteStoredFile(item.data().manualUrl);
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

    if (!authUser?.email) {
      setResetError('Não foi possível confirmar sua conta. Entre novamente e tente de novo.');
      return;
    }

    if (resetConfirmation.trim().toUpperCase() !== 'RESETAR') {
      setResetError('Digite RESETAR no campo de confirmacao.');
      return;
    }

    const confirmed = window.confirm('Esta ação vai apagar clientes, orçamentos, materiais, estoque, compras, funcionários, condomínios e histórico. Deseja continuar?');
    if (!confirmed) return;

    setResettingData(true);
    try {
      let totalDeleted = 0;
      for (const collectionName of resetCollections) {
        totalDeleted += await deleteCollectionData(collectionName);
      }

      setResetConfirmation('');
      setResetMessage(`${totalDeleted} registros foram excluídos. Usuários, permissões e configurações foram mantidos.`);
    } catch (error) {
      console.error('Erro ao resetar dados:', error);
      setResetError('Não foi possível limpar os dados. Tente novamente em instantes.');
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

      <AdminAccordionSection
        title="Funcionários"
        description="Cadastre a equipe para vincular responsáveis e avaliações aos projetos."
        defaultOpen
      >
        <section className="space-y-6">
        <div className="flex items-center justify-end gap-4">
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
      </AdminAccordionSection>

      <AdminAccordionSection
        title="Catálogo de pedras e chapas"
        description="Gerencie pedras e as opções de chapas no mesmo lugar."
      >
        <section className="space-y-6">
        {editingMaterial && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            Editando pedra: {editingMaterial.name}
          </div>
        )}

        <form onSubmit={addMaterialCatalogItem} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input value={materialForm.name} onChange={(event) => setMaterialForm((form) => ({...form, name: event.target.value}))} placeholder="Nome da pedra" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <select value={materialForm.provider} onChange={(event) => setMaterialForm((form) => ({...form, provider: event.target.value}))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <option value="">Fornecedor</option>
            {supplierOptions.map((supplier) => <option key={supplier.name} value={supplier.name}>{supplier.name}</option>)}
          </select>
          <select value={materialForm.category} onChange={(event) => setMaterialForm((form) => ({...form, category: event.target.value}))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <option value="">Categoria</option>
            {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={materialForm.materialLine} onChange={(event) => setMaterialForm((form) => ({...form, materialLine: event.target.value}))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <option value="">Linha do material</option>
            {materialLineOptions.map((line) => <option key={line} value={line}>{line}</option>)}
          </select>
          <select value={materialForm.materialType} onChange={(event) => setMaterialForm((form) => ({...form, materialType: event.target.value, thicknessLabel: ''}))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            {materialCatalog.materialTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={materialForm.texture} onChange={(event) => setMaterialForm((form) => ({...form, texture: event.target.value}))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <option value="">Textura</option>
            {materialCatalog.textures.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={materialForm.thicknessLabel} onChange={(event) => setMaterialForm((form) => ({...form, thicknessLabel: event.target.value}))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <option value="">Espessura</option>
            {thicknessOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
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
            {savingMaterial ?'Salvando...' : editingMaterial ? 'Salvar pedra' : 'Cadastrar pedra'}
          </button>
          {editingMaterial && (
            <button type="button" onClick={resetMaterialForm} className="rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-600 hover:bg-slate-200">
              Cancelar edição
            </button>
          )}
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
                  <div className="text-xs text-slate-400">
                    {material.materialLine || material.category || 'Sem categoria'} · {material.provider || 'Sem fornecedor'}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {[material.materialType, material.thicknessLabel, material.texture].filter(Boolean).join(' · ') || 'Sem especificações'}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">Preco e margem definidos na aba Materiais.</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => startEditingMaterial(material)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-primary/10 hover:text-brand-primary" title="Editar pedra" aria-label="Editar pedra">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => deleteMaterialCatalogItem(material)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir pedra" aria-label="Excluir pedra">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => toggleMaterialCatalogItem(material)} className={cn('rounded-full px-3 py-1 text-[10px] font-bold uppercase', material.active ?'bg-green-50 text-green-700' : 'bg-slate-200 text-slate-500')}>
                    {material.active ?'Ativo' : 'Inativo'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {materials.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-400">Nenhuma pedra cadastrada.</div>}
        </div>
        </section>
      </AdminAccordionSection>

      <AdminAccordionSection
        title="Catálogo de peças do cliente"
        description="Cadastre cooktop, cuba, torneira e demais peças para orçamento."
      >
        <section className="space-y-6">
        {editingFixture && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            Editando peça: {editingFixture.name}
          </div>
        )}

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
          <input value={fixtureForm.width} onChange={(e) => setFixtureForm((f) => ({...f, width: e.target.value}))} placeholder="Largura (cm)" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input value={fixtureForm.depth} onChange={(e) => setFixtureForm((f) => ({...f, depth: e.target.value}))} placeholder="Profundidade (cm)" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input value={fixtureForm.height} onChange={(e) => setFixtureForm((f) => ({...f, height: e.target.value}))} placeholder="Altura (cm)" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <input value={fixtureForm.diameter} onChange={(e) => setFixtureForm((f) => ({...f, diameter: e.target.value}))} placeholder="Diâmetro (cm)" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
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
          <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 cursor-pointer md:col-span-2 xl:col-span-1">
            {fixtureManualFile ? fixtureManualFile.name : fixtureForm.manualFileName || 'Upload do manual'}
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(event) => {
                setFixtureError('');
                setFixtureManualFile(event.target.files?.[0] || null);
              }}
            />
          </label>
          <input value={fixtureForm.notes} onChange={(e) => setFixtureForm((f) => ({...f, notes: e.target.value}))} placeholder="Informações" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2 xl:col-span-1" />
          <button type="submit" disabled={savingFixture} className="rounded-2xl bg-brand-primary px-4 py-3 font-bold text-white disabled:opacity-60">
            {savingFixture ?'Salvando...' : editingFixture ? 'Salvar peça' : 'Cadastrar peça'}
          </button>
          {editingFixture && (
            <button type="button" onClick={() => resetFixtureForm()} className="rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-600 hover:bg-slate-200">
              Cancelar edição
            </button>
          )}
        </form>

        {fixtureError && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {fixtureError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {fixtureCatalog.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              {item.imageUrl ?(
                <img src={item.imageUrl} alt={item.name} className="mb-3 h-32 w-full rounded-xl bg-white object-contain p-2" />
              ) : (
                <div className="mb-3 flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-xs font-bold uppercase text-slate-300">
                  Sem imagem
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900">{item.name}</div>
                  <div className="text-xs text-slate-400">{item.category} · {[item.brand, item.model].filter(Boolean).join(' / ')}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {[item.width ?`${item.width} cm largura` : '', item.depth ?`${item.depth} cm profundidade` : '', item.diameter ?`${item.diameter} cm diâmetro` : ''].filter(Boolean).join(' · ') || 'Sem medidas cadastradas'}
                  </div>
                  {item.manualUrl && (
                    <a
                      href={item.manualUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-100"
                    >
                      Manual disponível
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => startEditingFixture(item)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-primary/10 hover:text-brand-primary" title="Editar peça" aria-label="Editar peça">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => toggleFixtureCatalogItem(item)} className={cn('rounded-full px-3 py-1 text-[10px] font-bold uppercase', item.active ?'bg-green-50 text-green-700' : 'bg-slate-200 text-slate-500')}>
                    {item.active ?'Ativo' : 'Inativo'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {fixtureCatalog.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-400">Nenhuma peça cadastrada.</div>}
        </div>
        </section>
      </AdminAccordionSection>

      <AdminAccordionSection
        title="Configurações, catálogo de chapas e condomínios"
        description="Defina configurações gerais, regras de condomínio e opções de chapas."
      >
        <SettingsPage />
      </AdminAccordionSection>

      {isAdmin && (
        <AdminAccordionSection
          title="Zona de risco"
          description="Ações críticas para limpar dados operacionais do sistema."
        >
          <section className="rounded-[24px] border border-red-100 bg-red-50/60 p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <p className="max-w-3xl text-sm text-red-700">
                  Use este botão apenas quando o sistema estiver pronto para começar do zero. Ele apaga clientes, orçamentos, materiais, estoque, reservas, compras, funcionários, condomínios e histórico.
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  Usuários, permissões e configurações da empresa serão mantidos.
                </p>
              </div>
            </div>

            <form onSubmit={resetOperationalData} className="w-full max-w-xl space-y-3 rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3">
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
        </AdminAccordionSection>
      )}

      <AdminAccordionSection
        title="Usuários do sistema"
        description="Controle cargos, permissões individuais e bloqueios de acesso."
      >
        <section className="overflow-hidden rounded-[24px] border border-slate-100 bg-white p-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Usuário</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Funcao</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Permissoes</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ?(
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Carregando usuarios...</td></tr>
              ) : (
                users.map((user) => {
                  const userIsMaster = isMasterAdmin(user);
                  const effectivePermissions = mergePermissions(user);
                  const displayName = user.nome || user.email || 'Usuário';
                  const updatedBy = user.updatedByName || user.updatedByEmail;
                  const canEditThisUser = canAlterUsers && !userIsMaster;

                  return (
                    <tr key={user.uid} className="align-top hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 min-w-[260px]">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-slate-900">{displayName}</div>
                          {userIsMaster && (
                            <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                              Super admin
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {user.email}
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400">
                          Atualizado por: {updatedBy || 'Não informado'}
                        </div>
                      </td>
                      <td className="px-6 py-4 min-w-[190px]">
                        <select
                          value={user.role || 'vendedor'}
                          disabled={!canEditThisUser}
                          onChange={(event) => changeRole(user, event.target.value as AccessRole)}
                          className={cn(
                            'w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
                            userIsMaster ?'border-brand-primary/30 bg-brand-primary/5 text-brand-primary' : 'text-slate-700'
                          )}
                        >
                          {ACCESS_ROLES.map((role) => (
                            <option key={role} value={role}>{roleLabel(role)}</option>
                          ))}
                        </select>
                        {userIsMaster && <p className="mt-2 text-[11px] font-semibold text-brand-primary">Acesso total permanente.</p>}
                      </td>
                      <td className="px-6 py-4 min-w-[140px]">
                        <button
                          type="button"
                          disabled={!canEditThisUser}
                          onClick={() => toggleBlock(user)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all disabled:cursor-not-allowed disabled:opacity-50',
                            user.blocked ?'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'
                          )}
                        >
                          {user.blocked ?<><XCircle className="w-3 h-3" /> Bloqueado</> : <><CheckCircle2 className="w-3 h-3" /> Ativo</>}
                        </button>
                      </td>
                      <td className="px-6 py-4 min-w-[560px]">
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {Object.entries(effectivePermissions).map(([moduleName, actions]) => (
                            <div key={moduleName} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                                {MODULE_LABELS[moduleName as keyof PermissionMap] || moduleName}
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {Object.entries(actions).map(([actionName, allowed]) => (
                                  <label key={moduleName + '-' + actionName} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(allowed)}
                                      disabled={!canEditThisUser}
                                      onChange={(event) => updateUserPermission(user, moduleName as keyof PermissionMap, actionName, event.target.checked)}
                                      className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary disabled:cursor-not-allowed"
                                    />
                                    <span>{ACTION_LABELS[actionName] || actionName}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          aria-label="Excluir"
                          title={userIsMaster ?'O super admin nao pode ser excluido' : 'Excluir'}
                          disabled={!canEditThisUser}
                          onClick={() => deleteUserProfile(user)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </section>
      </AdminAccordionSection>
    </div>
  );
};




