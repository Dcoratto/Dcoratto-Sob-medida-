import {User} from 'firebase/auth';
import {AccessRole, AccessUser, PermissionMap} from '../types';

export const MASTER_ADMIN_EMAIL = 'brian_takiya77@outlook.com';

export type PermissionModule = keyof PermissionMap;
export type PermissionAction<M extends PermissionModule = PermissionModule> = keyof PermissionMap[M];

const fullPermissions: PermissionMap = {
  orcamento: {visualizar: true, criar: true, editar: true, excluir: true, aprovar: true},
  estoque: {visualizar: true, adicionar: true, editar: true, excluir: true, movimentar: true},
  relatorios: {visualizar: true, exportar: true, verFaturamento: true, verProdutividade: true},
  admin: {visualizarUsuarios: true, alterarPermissoes: true, excluirUsuarios: true},
  cliente: {visualizar: true, editarDados: true, alterarEtapa: true, anexarArquivos: true, avaliarFuncionarios: true},
  medicao: {visualizar: true, criar: true, editar: true},
  projeto: {visualizar: true, criar: true, editar: true, aprovar: true},
  producao: {visualizar: true, alterarEtapa: true, conferirMedidas: true, finalizarProducao: true},
  liberacao: {visualizar: true, aprovar: true, reprovar: true},
};

const noPermissions: PermissionMap = {
  orcamento: {visualizar: false, criar: false, editar: false, excluir: false, aprovar: false},
  estoque: {visualizar: false, adicionar: false, editar: false, excluir: false, movimentar: false},
  relatorios: {visualizar: false, exportar: false, verFaturamento: false, verProdutividade: false},
  admin: {visualizarUsuarios: false, alterarPermissoes: false, excluirUsuarios: false},
  cliente: {visualizar: false, editarDados: false, alterarEtapa: false, anexarArquivos: false, avaliarFuncionarios: false},
  medicao: {visualizar: false, criar: false, editar: false},
  projeto: {visualizar: false, criar: false, editar: false, aprovar: false},
  producao: {visualizar: false, alterarEtapa: false, conferirMedidas: false, finalizarProducao: false},
  liberacao: {visualizar: false, aprovar: false, reprovar: false},
};

const clonePermissions = (source: PermissionMap): PermissionMap => JSON.parse(JSON.stringify(source));

const withPermissions = (patch: Partial<{[Module in keyof PermissionMap]: Partial<PermissionMap[Module]>}>): PermissionMap => {
  const merged = clonePermissions(noPermissions);
  Object.entries(patch).forEach(([module, actions]) => {
    merged[module as PermissionModule] = {...merged[module as PermissionModule], ...actions} as any;
  });
  return merged;
};

export const DEFAULT_ROLE_PERMISSIONS: Record<AccessRole, PermissionMap> = {
  vendedor: withPermissions({
    orcamento: {visualizar: true, criar: true, editar: true},
    cliente: {visualizar: true, editarDados: true, alterarEtapa: true, anexarArquivos: true},
    medicao: {visualizar: true, criar: true, editar: true},
    projeto: {visualizar: true, criar: true, editar: true},
    producao: {visualizar: true},
  }),
  coordenador: withPermissions({
    orcamento: {visualizar: true, criar: true, editar: true, aprovar: true},
    relatorios: {visualizar: true, exportar: true, verProdutividade: true},
    cliente: {visualizar: true, editarDados: true, alterarEtapa: true, anexarArquivos: true, avaliarFuncionarios: true},
    medicao: {visualizar: true, criar: true, editar: true},
    projeto: {visualizar: true, criar: true, editar: true, aprovar: true},
    producao: {visualizar: true, alterarEtapa: true, conferirMedidas: true, finalizarProducao: true},
    liberacao: {visualizar: true, aprovar: true, reprovar: true},
  }),
  liberacao: withPermissions({
    cliente: {visualizar: true},
    projeto: {visualizar: true, aprovar: true},
    producao: {visualizar: true, conferirMedidas: true},
    liberacao: {visualizar: true, aprovar: true, reprovar: true},
  }),
  administrativo: withPermissions({
    estoque: {visualizar: true, adicionar: true, editar: true, excluir: true, movimentar: true},
    relatorios: {visualizar: true, exportar: true, verFaturamento: true},
    cliente: {visualizar: true, editarDados: true, anexarArquivos: true},
    medicao: {visualizar: true},
    projeto: {visualizar: true},
  }),
};

export const ACCESS_ROLES: AccessRole[] = ['vendedor', 'coordenador', 'liberacao', 'administrativo'];

export const MODULE_LABELS: Record<PermissionModule, string> = {
  orcamento: 'Orcamento',
  estoque: 'Estoque',
  relatorios: 'Relatorios',
  admin: 'Admin',
  cliente: 'Cliente',
  medicao: 'Medicao',
  projeto: 'Projeto',
  producao: 'Producao',
  liberacao: 'Liberacao',
};

export const ACTION_LABELS: Record<string, string> = {
  visualizar: 'Visualizar',
  criar: 'Criar',
  editar: 'Editar',
  excluir: 'Excluir',
  aprovar: 'Aprovar',
  adicionar: 'Adicionar',
  movimentar: 'Movimentar',
  exportar: 'Exportar',
  verFaturamento: 'Ver faturamento',
  verProdutividade: 'Ver produtividade',
  visualizarUsuarios: 'Ver usuarios',
  alterarPermissoes: 'Alterar permissoes',
  excluirUsuarios: 'Excluir usuarios',
  editarDados: 'Editar dados',
  alterarEtapa: 'Alterar etapa',
  anexarArquivos: 'Anexar arquivos',
  avaliarFuncionarios: 'Avaliar funcionarios',
  conferirMedidas: 'Conferir medidas',
  finalizarProducao: 'Finalizar producao',
  reprovar: 'Reprovar',
};

export const getDefaultPermissions = (role: AccessRole = 'vendedor') => clonePermissions(DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.vendedor);

export const mergePermissions = (user?: AccessUser | null): PermissionMap => {
  if (isMasterAdmin(user)) return clonePermissions(fullPermissions);
  const base = getDefaultPermissions(user?.role || 'vendedor');
  Object.entries(user?.permissions || {}).forEach(([module, actions]) => {
    base[module as PermissionModule] = {...base[module as PermissionModule], ...actions} as any;
  });
  return base;
};

export const isMasterAdmin = (user?: Pick<User, 'email'> | Pick<AccessUser, 'email'> | null) =>
  String(user?.email || '').toLowerCase() === MASTER_ADMIN_EMAIL;

export const hasPermission = <M extends PermissionModule>(
  user: AccessUser | User | null | undefined,
  module: M,
  action: keyof PermissionMap[M],
) => {
  if (isMasterAdmin(user as any)) return true;
  const accessUser = user as AccessUser | null | undefined;
  if (!accessUser?.role) return false;
  const customValue = accessUser.permissions?.[module]?.[action as any];
  if (typeof customValue === 'boolean') return customValue;
  return Boolean(DEFAULT_ROLE_PERMISSIONS[accessUser.role]?.[module]?.[action as any]);
};

export const canEvaluateEmployees = (user?: AccessUser | User | null) =>
  isMasterAdmin(user as any)
  || (user as AccessUser | null | undefined)?.role === 'coordenador'
  || hasPermission(user, 'cliente', 'avaliarFuncionarios');

export const roleLabel = (role?: AccessRole) => {
  if (role === 'coordenador') return 'Coordenador';
  if (role === 'liberacao') return 'Liberacao';
  if (role === 'administrativo') return 'Administrativo';
  return 'Vendedor';
};
