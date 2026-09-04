import React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  History,
  Loader2,
  PackageOpen,
  Plus,
  RefreshCcw,
  Search,
  ShoppingCart,
  ToolCase,
  Undo2,
  Wrench,
  X,
} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {useSettings} from '../hooks/useSettings';
import {cn, formatCurrency, parseCurrencyInput} from '../lib/utils';
import {CurrencyInput} from '../components/inputs/NumericInput';
import {
  checkoutWarehouseTool,
  createWarehousePurchase,
  createWarehouseTool,
  deactivateWarehouseProduct,
  getWarehouseSummary,
  getWarehouseWorkConsumption,
  listWarehouseAlerts,
  listWarehouseClientProjects,
  listWarehouseEmployees,
  listWarehouseMovements,
  listWarehouseProducts,
  listWarehousePurchases,
  listWarehouseTools,
  listWarehouseToolHistory,
  receiveWarehousePurchase,
  recordWarehouseMovement,
  returnWarehouseTool,
  saveWarehouseProduct,
  searchWarehouseClients,
  searchWarehouseProducts,
  updateWarehousePurchaseStatus,
  type WarehouseAlertItem,
  type WarehouseActor,
  type WarehouseItemType,
  type WarehouseMovement,
  type WarehouseMovementType,
  type WarehouseProduct,
  type WarehousePurchase,
  type WarehousePurchaseStatus,
  type WarehouseReferenceOption,
  type WarehouseSummary,
  type WarehouseTool,
  type WarehouseToolMovement,
  type WarehouseToolStatus,
  type WarehouseWorkConsumption,
} from '../lib/warehouseManagement';

type TabKey = 'overview' | 'products' | 'movements' | 'tools' | 'purchases';
type Feedback = {type: 'success' | 'error'; message: string} | null;

const PAGE_SIZE = 16;
const CATEGORIES = ['Abrasivos', 'Corte', 'Colagem', 'Polimento', 'Ferramentas', 'EPI', 'Instalação', 'Limpeza', 'Outros'];
const UNITS = ['un', 'cx', 'kg', 'g', 'l', 'ml', 'm', 'par', 'rolo'];
const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 disabled:bg-slate-100';
const textareaClass = 'min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20';
const primaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-[#3F3A34] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const useDebouncedValue = <T,>(value: T, delay = 350) => {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
};

const Field: React.FC<{label: string; required?: boolean; children: React.ReactNode}> = ({label, required, children}) => (
  <label className="block min-w-0">
    <span className="mb-1.5 block text-xs font-medium text-slate-500">{label}{required ? ' *' : ''}</span>
    {children}
  </label>
);

const Modal: React.FC<{title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean}> = ({title, open, onClose, children, wide}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Fechar" />
      <div className={cn('relative max-h-[92svh] w-full overflow-y-auto rounded-t-lg bg-white shadow-2xl sm:rounded-lg', wide ? 'sm:max-w-3xl' : 'sm:max-w-xl')}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{icon: React.ComponentType<{className?: string}>; title: string; body: string}> = ({icon: Icon, title, body}) => (
  <div className="border-y border-dashed border-slate-200 py-12 text-center">
    <Icon className="mx-auto h-7 w-7 text-slate-300" />
    <h3 className="mt-3 text-sm font-semibold text-slate-800">{title}</h3>
    <p className="mt-1 text-sm text-slate-500">{body}</p>
  </div>
);

const Pagination: React.FC<{page: number; total: number; onChange: (page: number) => void}> = ({page, total, onChange}) => {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
      <span className="text-xs text-slate-500">Página {page + 1} de {pages}</span>
      <div className="flex gap-2">
        <button type="button" className={secondaryButton} disabled={page <= 0} onClick={() => onChange(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" className={secondaryButton} disabled={page + 1 >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

const formatQuantity = (value: number) => new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 3}).format(value);
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';

const toolStatusMeta: Record<WarehouseToolStatus, {label: string; className: string}> = {
  DISPONIVEL: {label: 'Disponível', className: 'border-emerald-200 bg-emerald-50 text-emerald-700'},
  EM_USO: {label: 'Em uso', className: 'border-blue-200 bg-blue-50 text-blue-700'},
  MANUTENCAO: {label: 'Manutenção', className: 'border-amber-200 bg-amber-50 text-amber-700'},
  DANIFICADA: {label: 'Danificada', className: 'border-red-200 bg-red-50 text-red-700'},
  INATIVA: {label: 'Inativa', className: 'border-slate-200 bg-slate-100 text-slate-600'},
};

const purchaseStatuses: WarehousePurchaseStatus[] = ['PENDENTE', 'SOLICITADO', 'COMPRADO', 'RECEBIDO', 'CANCELADO'];

export const WarehousePage: React.FC = () => {
  const {accessUser, profile, user, hasPermission} = useAuth();
  const {settings} = useSettings();
  const actor = React.useMemo<WarehouseActor>(() => ({
    uid: accessUser?.uid || user?.id || '',
    name: accessUser?.nome || profile?.name || user?.email?.split('@')[0] || 'Usuário',
    empresaId: accessUser?.empresaId || profile?.empresaId || 'dcoratto-main',
  }), [accessUser, profile, user]);
  const canEdit = hasPermission('almoxarifado', 'editar');
  const canMove = hasPermission('almoxarifado', 'movimentar');
  const canBuy = hasPermission('almoxarifado', 'comprar');

  const [activeTab, setActiveTab] = React.useState<TabKey>('overview');
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const [summary, setSummary] = React.useState<WarehouseSummary | null>(null);
  const [alerts, setAlerts] = React.useState<WarehouseAlertItem[]>([]);
  const [overviewLoading, setOverviewLoading] = React.useState(true);
  const [reportClientId, setReportClientId] = React.useState('');
  const [reportProjects, setReportProjects] = React.useState<WarehouseReferenceOption[]>([]);
  const [reportWorkId, setReportWorkId] = React.useState('');
  const [workConsumption, setWorkConsumption] = React.useState<WarehouseWorkConsumption[]>([]);
  const [reportLoading, setReportLoading] = React.useState(false);

  const [products, setProducts] = React.useState<WarehouseProduct[]>([]);
  const [productsTotal, setProductsTotal] = React.useState(0);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [productPage, setProductPage] = React.useState(0);
  const [productSearch, setProductSearch] = React.useState('');
  const [productTypeFilter, setProductTypeFilter] = React.useState<WarehouseItemType | ''>('');
  const debouncedProductSearch = useDebouncedValue(productSearch);

  const [movements, setMovements] = React.useState<WarehouseMovement[]>([]);
  const [movementsTotal, setMovementsTotal] = React.useState(0);
  const [movementsLoading, setMovementsLoading] = React.useState(false);
  const [movementPage, setMovementPage] = React.useState(0);
  const [movementFilters, setMovementFilters] = React.useState({type: '' as WarehouseMovementType | '', category: '', productId: '', employeeId: '', clientId: '', workQuoteId: '', dateFrom: '', dateTo: ''});

  const [tools, setTools] = React.useState<WarehouseTool[]>([]);
  const [toolsTotal, setToolsTotal] = React.useState(0);
  const [toolsLoading, setToolsLoading] = React.useState(false);
  const [toolPage, setToolPage] = React.useState(0);
  const [toolSearch, setToolSearch] = React.useState('');
  const [toolStatus, setToolStatus] = React.useState<WarehouseToolStatus | ''>('');
  const debouncedToolSearch = useDebouncedValue(toolSearch);

  const [purchases, setPurchases] = React.useState<WarehousePurchase[]>([]);
  const [purchasesTotal, setPurchasesTotal] = React.useState(0);
  const [purchasesLoading, setPurchasesLoading] = React.useState(false);
  const [purchasePage, setPurchasePage] = React.useState(0);
  const [purchaseStatus, setPurchaseStatus] = React.useState<WarehousePurchaseStatus | ''>('');

  const [productOptions, setProductOptions] = React.useState<WarehouseProduct[]>([]);
  const [employees, setEmployees] = React.useState<WarehouseReferenceOption[]>([]);
  const [clients, setClients] = React.useState<WarehouseReferenceOption[]>([]);
  const [projects, setProjects] = React.useState<WarehouseReferenceOption[]>([]);
  const [referencesLoading, setReferencesLoading] = React.useState(false);

  const [productModalOpen, setProductModalOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<WarehouseProduct | null>(null);
  const [productDraft, setProductDraft] = React.useState({name: '', description: '', category: 'Abrasivos', itemType: 'CONSUMIVEL' as WarehouseItemType, unit: 'un', minimumQuantity: '0', physicalLocation: '', supplierId: '', unitCost: ''});
  const [savingProduct, setSavingProduct] = React.useState(false);

  const [movementModalOpen, setMovementModalOpen] = React.useState(false);
  const [movementDraft, setMovementDraft] = React.useState({type: 'SAIDA' as WarehouseMovementType, productId: '', quantity: '', employeeId: '', clientId: '', workQuoteId: '', quoteId: '', reason: '', notes: ''});
  const [savingMovement, setSavingMovement] = React.useState(false);

  const [toolModalMode, setToolModalMode] = React.useState<'create' | 'checkout' | 'return' | null>(null);
  const [selectedTool, setSelectedTool] = React.useState<WarehouseTool | null>(null);
  const [toolDraft, setToolDraft] = React.useState({productId: '', assetCode: '', serialNumber: '', condition: 'Boa', employeeId: '', clientId: '', workQuoteId: '', expectedReturnAt: '', notes: ''});
  const [savingTool, setSavingTool] = React.useState(false);
  const [toolHistoryOpen, setToolHistoryOpen] = React.useState(false);
  const [toolHistory, setToolHistory] = React.useState<WarehouseToolMovement[]>([]);
  const [toolHistoryLoading, setToolHistoryLoading] = React.useState(false);

  const [purchaseModalOpen, setPurchaseModalOpen] = React.useState(false);
  const [purchaseDraft, setPurchaseDraft] = React.useState({productId: '', quantity: '', suggestedQuantity: '', supplierId: '', notes: ''});
  const [savingPurchase, setSavingPurchase] = React.useState(false);
  const tabCacheRef = React.useRef<Record<TabKey, string>>({
    overview: '',
    products: '',
    movements: '',
    tools: '',
    purchases: '',
  });
  const referencesCacheRef = React.useRef('');

  const refresh = React.useCallback((message?: string) => {
    setRefreshKey((value) => value + 1);
    if (message) setFeedback({type: 'success', message});
  }, []);

  React.useEffect(() => {
    if (activeTab !== 'overview') return;
    const cacheKey = String(refreshKey);
    if (tabCacheRef.current.overview === cacheKey) return;
    let active = true;
    setOverviewLoading(true);
    Promise.all([getWarehouseSummary(), listWarehouseAlerts()])
      .then(([nextSummary, nextAlerts]) => {
        if (!active) return;
        tabCacheRef.current.overview = cacheKey;
        setSummary(nextSummary);
        setAlerts(nextAlerts);
      })
      .catch((error) => active && setFeedback({type: 'error', message: (error as Error).message}))
      .finally(() => active && setOverviewLoading(false));
    return () => { active = false; };
  }, [activeTab, refreshKey]);

  React.useEffect(() => {
    if (activeTab !== 'products') return;
    const cacheKey = JSON.stringify({refreshKey, productPage, debouncedProductSearch, productTypeFilter});
    if (tabCacheRef.current.products === cacheKey) return;
    let active = true;
    setProductsLoading(true);
    listWarehouseProducts({page: productPage, pageSize: PAGE_SIZE, search: debouncedProductSearch, itemType: productTypeFilter, activeOnly: false})
      .then((result) => {
        if (!active) return;
        tabCacheRef.current.products = cacheKey;
        setProducts(result.items);
        setProductsTotal(result.total);
      })
      .catch((error) => active && setFeedback({type: 'error', message: (error as Error).message}))
      .finally(() => active && setProductsLoading(false));
    return () => { active = false; };
  }, [activeTab, debouncedProductSearch, productPage, productTypeFilter, refreshKey]);

  React.useEffect(() => {
    if (activeTab !== 'movements') return;
    const cacheKey = JSON.stringify({refreshKey, movementPage, movementFilters});
    if (tabCacheRef.current.movements === cacheKey) return;
    let active = true;
    setMovementsLoading(true);
    listWarehouseMovements({
      page: movementPage,
      pageSize: PAGE_SIZE,
      movementType: movementFilters.type,
      productId: movementFilters.productId,
      employeeId: movementFilters.employeeId,
      clientId: movementFilters.clientId,
      workQuoteId: movementFilters.workQuoteId,
      category: movementFilters.category,
      dateFrom: movementFilters.dateFrom,
      dateTo: movementFilters.dateTo,
    }).then((result) => {
      if (!active) return;
      tabCacheRef.current.movements = cacheKey;
      setMovements(result.items);
      setMovementsTotal(result.total);
    }).catch((error) => active && setFeedback({type: 'error', message: (error as Error).message}))
      .finally(() => active && setMovementsLoading(false));
    return () => { active = false; };
  }, [activeTab, movementFilters, movementPage, refreshKey]);

  React.useEffect(() => {
    if (activeTab !== 'tools') return;
    const cacheKey = JSON.stringify({refreshKey, toolPage, debouncedToolSearch, toolStatus});
    if (tabCacheRef.current.tools === cacheKey) return;
    let active = true;
    setToolsLoading(true);
    listWarehouseTools({page: toolPage, pageSize: PAGE_SIZE, search: debouncedToolSearch, status: toolStatus})
      .then((result) => {
        if (!active) return;
        tabCacheRef.current.tools = cacheKey;
        setTools(result.items);
        setToolsTotal(result.total);
      }).catch((error) => active && setFeedback({type: 'error', message: (error as Error).message}))
      .finally(() => active && setToolsLoading(false));
    return () => { active = false; };
  }, [activeTab, debouncedToolSearch, refreshKey, toolPage, toolStatus]);

  React.useEffect(() => {
    if (activeTab !== 'purchases') return;
    const cacheKey = JSON.stringify({refreshKey, purchasePage, purchaseStatus});
    if (tabCacheRef.current.purchases === cacheKey) return;
    let active = true;
    setPurchasesLoading(true);
    listWarehousePurchases({page: purchasePage, pageSize: PAGE_SIZE, status: purchaseStatus})
      .then((result) => {
        if (!active) return;
        tabCacheRef.current.purchases = cacheKey;
        setPurchases(result.items);
        setPurchasesTotal(result.total);
      }).catch((error) => active && setFeedback({type: 'error', message: (error as Error).message}))
      .finally(() => active && setPurchasesLoading(false));
    return () => { active = false; };
  }, [activeTab, purchasePage, purchaseStatus, refreshKey]);

  const loadReferences = React.useCallback(async (productType?: WarehouseItemType) => {
    const cacheKey = JSON.stringify({refreshKey, productType: productType || 'ALL', hasEmployees: employees.length > 0, hasClients: clients.length > 0, hasProducts: productOptions.length > 0});
    if (referencesCacheRef.current === cacheKey) return;
    setReferencesLoading(true);
    try {
      const [nextProducts, nextEmployees, nextClients] = await Promise.all([
        searchWarehouseProducts('', productType),
        employees.length ? Promise.resolve(employees) : listWarehouseEmployees(),
        clients.length ? Promise.resolve(clients) : searchWarehouseClients(),
      ]);
      referencesCacheRef.current = cacheKey;
      setProductOptions(nextProducts);
      setEmployees(nextEmployees);
      setClients(nextClients);
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setReferencesLoading(false);
    }
  }, [clients, employees, productOptions.length, refreshKey]);

  const loadProjects = React.useCallback(async (clientId: string) => {
    setProjects([]);
    if (!clientId) return;
    try {
      setProjects(await listWarehouseClientProjects(clientId));
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === 'movements') void loadReferences();
    if (activeTab === 'overview') void loadReferences();
  }, [activeTab, loadReferences]);

  const selectReportClient = async (clientId: string) => {
    setReportClientId(clientId);
    setReportWorkId('');
    setWorkConsumption([]);
    setReportProjects([]);
    if (!clientId) return;
    try {
      setReportProjects(await listWarehouseClientProjects(clientId));
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    }
  };

  const selectReportWork = async (workId: string) => {
    setReportWorkId(workId);
    setWorkConsumption([]);
    if (!workId) return;
    setReportLoading(true);
    try {
      setWorkConsumption(await getWarehouseWorkConsumption(workId));
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setReportLoading(false);
    }
  };

  const openToolHistory = async (tool: WarehouseTool) => {
    setSelectedTool(tool);
    setToolHistory([]);
    setToolHistoryOpen(true);
    setToolHistoryLoading(true);
    try {
      setToolHistory(await listWarehouseToolHistory(tool.id));
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setToolHistoryLoading(false);
    }
  };

  const openProductModal = (product?: WarehouseProduct) => {
    setEditingProduct(product || null);
    setProductDraft(product ? {
      name: product.name,
      description: product.description || '',
      category: product.category,
      itemType: product.itemType,
      unit: product.unit,
      minimumQuantity: String(product.minimumQuantity),
      physicalLocation: product.physicalLocation,
      supplierId: product.defaultSupplierId || '',
      unitCost: product.unitCost == null ? '' : String(product.unitCost),
    } : {name: '', description: '', category: 'Abrasivos', itemType: 'CONSUMIVEL', unit: 'un', minimumQuantity: '0', physicalLocation: '', supplierId: '', unitCost: ''});
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!productDraft.name.trim() || !productDraft.category.trim() || !productDraft.unit.trim()) return;
    setSavingProduct(true);
    try {
      await saveWarehouseProduct({
        id: editingProduct?.id,
        name: productDraft.name,
        description: productDraft.description,
        category: productDraft.category,
        itemType: productDraft.itemType,
        unit: productDraft.unit,
        minimumQuantity: Number(productDraft.minimumQuantity) || 0,
        physicalLocation: productDraft.physicalLocation,
        defaultSupplierId: productDraft.supplierId || null,
        unitCost: productDraft.unitCost === '' ? null : parseCurrencyInput(productDraft.unitCost),
        active: editingProduct?.active ?? true,
      }, actor);
      setProductModalOpen(false);
      refresh(editingProduct ? 'Produto atualizado.' : 'Produto cadastrado. Registre uma entrada para adicionar saldo.');
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingProduct(false);
    }
  };

  const openMovementModal = async (type: WarehouseMovementType = 'SAIDA', product?: WarehouseProduct) => {
    setMovementDraft({type, productId: product?.id || '', quantity: '', employeeId: '', clientId: '', workQuoteId: '', quoteId: '', reason: type === 'SAIDA' ? 'Consumo operacional' : '', notes: ''});
    setProjects([]);
    setMovementModalOpen(true);
    await loadReferences('CONSUMIVEL');
  };

  const handleSaveMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedProduct = productOptions.find((item) => item.id === movementDraft.productId);
    const quantity = Number(movementDraft.quantity);
    if (!selectedProduct || quantity <= 0 || !movementDraft.reason.trim()) return;
    if (!window.confirm(`${movementDraft.type}: ${formatQuantity(quantity)} ${selectedProduct.unit} de ${selectedProduct.name}. Confirmar?`)) return;
    setSavingMovement(true);
    try {
      await recordWarehouseMovement({
        productId: movementDraft.productId,
        movementType: movementDraft.type,
        quantity,
        employeeId: movementDraft.employeeId,
        clientId: movementDraft.clientId,
        workQuoteId: movementDraft.workQuoteId,
        quoteId: movementDraft.quoteId,
        reason: movementDraft.reason,
        notes: movementDraft.notes,
      }, actor);
      setMovementModalOpen(false);
      refresh('Movimentação registrada com saldo e histórico atualizados.');
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingMovement(false);
    }
  };

  const openCreateTool = async () => {
    setSelectedTool(null);
    setToolDraft({productId: '', assetCode: '', serialNumber: '', condition: 'Boa', employeeId: '', clientId: '', workQuoteId: '', expectedReturnAt: '', notes: ''});
    setToolModalMode('create');
    await loadReferences('FERRAMENTA');
  };

  const openCheckoutTool = async (tool: WarehouseTool) => {
    setSelectedTool(tool);
    setToolDraft({productId: tool.productId, assetCode: tool.assetCode, serialNumber: '', condition: tool.condition, employeeId: '', clientId: '', workQuoteId: '', expectedReturnAt: '', notes: ''});
    setProjects([]);
    setToolModalMode('checkout');
    await loadReferences('FERRAMENTA');
  };

  const openReturnTool = (tool: WarehouseTool) => {
    setSelectedTool(tool);
    setToolDraft({productId: tool.productId, assetCode: tool.assetCode, serialNumber: '', condition: tool.condition, employeeId: '', clientId: '', workQuoteId: '', expectedReturnAt: '', notes: ''});
    setToolModalMode('return');
  };

  const handleSaveTool = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingTool(true);
    try {
      if (toolModalMode === 'create') {
        await createWarehouseTool({productId: toolDraft.productId, assetCode: toolDraft.assetCode, serialNumber: toolDraft.serialNumber, condition: toolDraft.condition, notes: toolDraft.notes}, actor);
      } else if (toolModalMode === 'checkout' && selectedTool) {
        if (!window.confirm(`Confirmar retirada da ferramenta ${selectedTool.assetCode}?`)) return;
        await checkoutWarehouseTool({toolId: selectedTool.id, employeeId: toolDraft.employeeId, clientId: toolDraft.clientId, workQuoteId: toolDraft.workQuoteId, expectedReturnAt: toolDraft.expectedReturnAt || undefined, notes: toolDraft.notes}, actor);
      } else if (toolModalMode === 'return' && selectedTool) {
        if (!window.confirm(`Confirmar devolucao da ferramenta ${selectedTool.assetCode}?`)) return;
        await returnWarehouseTool(selectedTool.id, toolDraft.condition, toolDraft.notes, actor);
      }
      setToolModalMode(null);
      refresh(toolModalMode === 'create' ? 'Ferramenta cadastrada.' : toolModalMode === 'return' ? 'Ferramenta devolvida com histórico preservado.' : 'Ferramenta retirada.');
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingTool(false);
    }
  };

  const openPurchaseModal = async (product?: WarehouseProduct | WarehouseAlertItem) => {
    const suggested = product ? Math.max(1, product.minimumQuantity * 2 - product.currentQuantity) : 0;
    const supplierId = product && 'defaultSupplierId' in product ? (product.defaultSupplierId || '') : '';
    setPurchaseDraft({productId: product?.id || '', quantity: suggested ? String(suggested) : '', suggestedQuantity: suggested ? String(suggested) : '', supplierId, notes: ''});
    setPurchaseModalOpen(true);
    await loadReferences();
  };

  const handleSavePurchase = async (event: React.FormEvent) => {
    event.preventDefault();
    const quantity = Number(purchaseDraft.quantity);
    if (!purchaseDraft.productId || quantity <= 0) return;
    setSavingPurchase(true);
    try {
      await createWarehousePurchase({productId: purchaseDraft.productId, quantity, suggestedQuantity: Number(purchaseDraft.suggestedQuantity) || undefined, supplierId: purchaseDraft.supplierId, notes: purchaseDraft.notes}, actor);
      setPurchaseModalOpen(false);
      refresh('Item adicionado a lista de compras.');
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    } finally {
      setSavingPurchase(false);
    }
  };

  const handlePurchaseStatus = async (purchase: WarehousePurchase, status: WarehousePurchaseStatus) => {
    if (status === purchase.status) return;
    if (status === 'RECEBIDO') {
      if (!window.confirm(`Receber ${formatQuantity(purchase.requestedQuantity)} ${purchase.product?.unit || ''} de ${purchase.product?.name || 'produto'} e gerar a entrada?`)) return;
      try {
        await receiveWarehousePurchase(purchase.id, purchase.requestedQuantity, actor);
        refresh('Compra recebida e entrada registrada atomicamente.');
      } catch (error) {
        setFeedback({type: 'error', message: (error as Error).message});
      }
      return;
    }
    if (!window.confirm(`Alterar status da compra para ${status}?`)) return;
    try {
      await updateWarehousePurchaseStatus(purchase.id, status as Exclude<WarehousePurchaseStatus, 'RECEBIDO'>);
      refresh('Status da compra atualizado.');
    } catch (error) {
      setFeedback({type: 'error', message: (error as Error).message});
    }
  };

  const tabs: Array<{key: TabKey; label: string; icon: React.ComponentType<{className?: string}>}> = [
    {key: 'overview', label: 'Visão Geral', icon: Boxes},
    {key: 'products', label: 'Produtos', icon: PackageOpen},
    {key: 'movements', label: 'Movimentações', icon: ArrowLeftRight},
    {key: 'tools', label: 'Ferramentas', icon: Wrench},
    {key: 'purchases', label: 'Compras', icon: ShoppingCart},
  ];

  const summaryCards = [
    {label: 'Itens cadastrados', value: summary?.totalProducts || 0, icon: PackageOpen, tone: 'bg-blue-50 text-blue-700'},
    {label: 'Abaixo do mínimo', value: summary?.belowMinimum || 0, icon: AlertTriangle, tone: 'bg-amber-50 text-amber-700'},
    {label: 'Itens zerados', value: summary?.outOfStock || 0, icon: Boxes, tone: 'bg-red-50 text-red-700'},
    {label: 'Ferramentas emprestadas', value: summary?.borrowedTools || 0, icon: ToolCase, tone: 'bg-violet-50 text-violet-700'},
    {label: 'Aguardando compra', value: summary?.pendingPurchases || 0, icon: ShoppingCart, tone: 'bg-cyan-50 text-cyan-700'},
    {label: 'Movimentações hoje', value: summary?.movementsToday || 0, icon: History, tone: 'bg-emerald-50 text-emerald-700'},
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-primary text-[#3F3A34]"><PackageOpen className="h-5 w-5" /></div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-slate-900">Almoxarifado</h1>
              <p className="mt-0.5 text-sm text-slate-500">Insumos, consumíveis e ferramentas da operação.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} onClick={() => refresh()}><RefreshCcw className="h-4 w-4" /> Atualizar</button>
          {canMove && <button type="button" className={primaryButton} onClick={() => void openMovementModal('SAIDA')}><ArrowUpFromLine className="h-4 w-4" /> Retirar material</button>}
        </div>
      </div>

      {feedback && (
        <div className={cn('mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm', feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="mt-5 overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={cn('flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium transition', activeTab === tab.key ? 'border-brand-primary text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              <tab.icon className="h-4 w-4" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="py-6">
          {overviewLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {summaryCards.map((card) => (
                  <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', card.tone)}><card.icon className="h-4 w-4" /></div>
                    <div className="mt-4 text-2xl font-medium text-slate-900">{card.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{card.label}</div>
                  </div>
                ))}
              </div>
              <section className="mt-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><h2 className="text-lg font-semibold text-slate-900">Alertas de estoque</h2><p className="text-sm text-slate-500">Itens zerados, abaixo ou proximos do minimo.</p></div>
                </div>
                {alerts.length === 0 ? <EmptyState icon={Boxes} title="Estoque em dia" body="Nenhum item requer reposição agora." /> : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {alerts.map((item) => {
                      const zero = item.currentQuantity === 0;
                      const below = item.currentQuantity <= item.minimumQuantity;
                      return (
                        <div key={item.id} className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
                          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', zero ? 'bg-red-50 text-red-600' : below ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600')}><AlertTriangle className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-slate-900">{item.name}</h3>
                            <p className="mt-1 text-xs text-slate-500">{formatQuantity(item.currentQuantity)} {item.unit} · minimo {formatQuantity(item.minimumQuantity)}</p>
                            <span className={cn('mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', zero ? 'border-red-200 bg-red-50 text-red-700' : below ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700')}>{zero ? 'SEM ESTOQUE' : below ? 'REPOR' : 'PROXIMO DO MINIMO'}</span>
                          </div>
                          {canBuy && <button type="button" onClick={() => void openPurchaseModal(item)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="Adicionar a lista de compras"><ShoppingCart className="h-4 w-4" /></button>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              <section className="mt-8 border-t border-slate-200 pt-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div><h2 className="text-lg font-semibold text-slate-900">Consumo por obra</h2><p className="text-sm text-slate-500">Custos históricos preservados no momento de cada retirada.</p></div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:w-[620px]">
                    <select className={inputClass} value={reportClientId} onChange={(event) => void selectReportClient(event.target.value)}><option value="">Selecione o cliente</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                    <select className={inputClass} disabled={!reportClientId} value={reportWorkId} onChange={(event) => void selectReportWork(event.target.value)}><option value="">Selecione a obra</option>{reportProjects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.detail}</option>)}</select>
                  </div>
                </div>
                {reportLoading ? <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-brand-primary" /></div> : reportWorkId && workConsumption.length === 0 ? <div className="mt-5"><EmptyState icon={CircleDollarSign} title="Sem consumo registrado" body="Esta obra ainda não possui retiradas vinculadas." /></div> : workConsumption.length > 0 && (
                  <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="hidden grid-cols-[minmax(180px,1fr)_130px_140px_minmax(220px,1fr)] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 md:grid"><span>Produto</span><span>Quantidade</span><span>Custo total</span><span>Retiradas</span></div>
                    {workConsumption.map((item) => <div key={item.productId} className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(180px,1fr)_130px_140px_minmax(220px,1fr)] md:items-start"><div><h3 className="text-sm font-semibold text-slate-900">{item.productName}</h3><p className="mt-1 text-xs text-slate-500">{item.category}</p></div><div className="text-sm text-slate-700">{formatQuantity(item.totalQuantity)} {item.unit}</div><div className="text-sm font-medium text-slate-900">{formatCurrency(item.totalCost)}</div><div className="space-y-1 text-xs text-slate-500">{item.withdrawals.map((entry, index) => <div key={`${entry.date}-${index}`}>{new Date(entry.date).toLocaleDateString('pt-BR')} · {formatQuantity(entry.quantity)} {item.unit} · {entry.unitCost == null ? 'sem custo' : formatCurrency(entry.unitCost)} · {entry.employee || entry.performedBy}</div>)}</div></div>)}
                    <div className="flex items-center justify-between bg-slate-50 px-4 py-4"><span className="text-sm font-semibold text-slate-700">Custo total de insumos da obra</span><span className="text-lg font-semibold text-slate-900">{formatCurrency(workConsumption.reduce((sum, item) => sum + item.totalCost, 0))}</span></div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {activeTab === 'products' && (
        <div className="py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative max-w-xl flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={productSearch} onChange={(event) => {setProductSearch(event.target.value); setProductPage(0);}} className={cn(inputClass, 'pl-9')} placeholder="Buscar por nome ou categoria" /></div>
              <select value={productTypeFilter} onChange={(event) => {setProductTypeFilter(event.target.value as WarehouseItemType | ''); setProductPage(0);}} className={cn(inputClass, 'sm:w-48')}><option value="">Todos os tipos</option><option value="CONSUMIVEL">Consumiveis</option><option value="FERRAMENTA">Ferramentas</option></select>
            </div>
            {canEdit && <button type="button" className={primaryButton} onClick={() => openProductModal()}><Plus className="h-4 w-4" /> Novo produto</button>}
          </div>
          {productsLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div> : products.length === 0 ? <div className="mt-6"><EmptyState icon={PackageOpen} title="Nenhum produto encontrado" body="Cadastre o primeiro item ou ajuste os filtros." /></div> : (
            <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="hidden grid-cols-[minmax(220px,1.4fr)_150px_120px_130px_120px_160px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 lg:grid"><span>Produto</span><span>Categoria</span><span>Tipo</span><span>Saldo</span><span>Minimo</span><span className="text-right">Acoes</span></div>
              {products.map((item) => (
                <div key={item.id} className={cn('grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(220px,1.4fr)_150px_120px_130px_120px_160px] lg:items-center', !item.active && 'bg-slate-50 opacity-60')}>
                  <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{item.name}</h3><p className="mt-1 truncate text-xs text-slate-500">{item.physicalLocation || 'Local nao informado'}{item.unitCost != null ? ` · ${formatCurrency(item.unitCost)}/${item.unit}` : ''}</p></div>
                  <span className="text-sm text-slate-600">{item.category}</span>
                  <span className="text-xs font-medium text-slate-500">{item.itemType === 'CONSUMIVEL' ? 'Consumível' : 'Ferramenta'}</span>
                  <span className={cn('text-sm font-medium', item.currentQuantity === 0 ? 'text-red-600' : item.currentQuantity <= item.minimumQuantity ? 'text-amber-600' : 'text-slate-900')}>{formatQuantity(item.currentQuantity)} {item.unit}</span>
                  <span className="text-sm text-slate-600">{formatQuantity(item.minimumQuantity)} {item.unit}</span>
                  <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                    {canMove && item.active && item.itemType === 'CONSUMIVEL' && <button type="button" onClick={() => void openMovementModal('ENTRADA', item)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><ArrowDownToLine className="h-3.5 w-3.5" /> Entrada</button>}
                    {canEdit && <button type="button" onClick={() => openProductModal(item)} className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Editar</button>}
                    {canEdit && item.active && <button type="button" onClick={async () => {if (!window.confirm(`Desativar ${item.name}? O historico sera preservado.`)) return; try {await deactivateWarehouseProduct(item.id); refresh('Produto desativado com historico preservado.');} catch (error) {setFeedback({type: 'error', message: (error as Error).message});}}} className="inline-flex h-9 items-center rounded-lg px-2 text-xs font-medium text-red-600 hover:bg-red-50">Desativar</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Pagination page={productPage} total={productsTotal} onChange={setProductPage} />
        </div>
      )}

      {activeTab === 'movements' && (
        <div className="py-6">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <select className={inputClass} value={movementFilters.type} onChange={(event) => {setMovementFilters((value) => ({...value, type: event.target.value as WarehouseMovementType | ''})); setMovementPage(0);}}><option value="">Todos os tipos</option>{(['ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO'] as WarehouseMovementType[]).map((type) => <option key={type}>{type}</option>)}</select>
            <select className={inputClass} value={movementFilters.category} onChange={(event) => {setMovementFilters((value) => ({...value, category: event.target.value})); setMovementPage(0);}}><option value="">Categorias</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
            <select className={inputClass} value={movementFilters.productId} onChange={(event) => {setMovementFilters((value) => ({...value, productId: event.target.value})); setMovementPage(0);}}><option value="">Todos os produtos</option>{productOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className={inputClass} value={movementFilters.employeeId} onChange={(event) => {setMovementFilters((value) => ({...value, employeeId: event.target.value})); setMovementPage(0);}}><option value="">Funcionarios</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className={inputClass} value={movementFilters.clientId} onChange={(event) => {const clientId = event.target.value; setMovementFilters((value) => ({...value, clientId, workQuoteId: ''})); setMovementPage(0); void loadProjects(clientId);}}><option value="">Clientes</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className={inputClass} value={movementFilters.workQuoteId} disabled={!movementFilters.clientId} onChange={(event) => {setMovementFilters((value) => ({...value, workQuoteId: event.target.value})); setMovementPage(0);}}><option value="">Obras</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <input type="date" className={inputClass} value={movementFilters.dateFrom} onChange={(event) => {setMovementFilters((value) => ({...value, dateFrom: event.target.value})); setMovementPage(0);}} aria-label="Data inicial" />
            <input type="date" className={inputClass} value={movementFilters.dateTo} onChange={(event) => {setMovementFilters((value) => ({...value, dateTo: event.target.value})); setMovementPage(0);}} aria-label="Data final" />
          </div>
          {movementsLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div> : movements.length === 0 ? <div className="mt-6"><EmptyState icon={History} title="Nenhuma movimentacao" body="Nao existem registros para os filtros escolhidos." /></div> : (
            <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {movements.map((item) => (
                <div key={item.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 md:grid-cols-[150px_minmax(180px,1fr)_110px_130px_minmax(150px,1fr)] md:items-center">
                  <div><span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-medium', item.movementType === 'SAIDA' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>{item.movementType}</span><div className="mt-2 text-xs text-slate-500">{formatDateTime(item.createdAt)}</div></div>
                  <div><h3 className="text-sm font-semibold text-slate-900">{item.product?.name || 'Produto'}</h3><p className="mt-1 text-xs text-slate-500">{item.reason}</p></div>
                  <div className="text-sm text-slate-800">{formatQuantity(item.quantity)} {item.product?.unit}</div>
                  <div className="text-xs text-slate-500">{formatQuantity(item.previousQuantity)} → <span className="font-medium text-slate-800">{formatQuantity(item.resultingQuantity)}</span></div>
                  <div className="text-xs text-slate-500"><div>{item.employee?.name || 'Sem funcionario'}</div><div>{item.client?.name || item.work?.client_name || 'Sem cliente'}{item.work?.environment ? ` · ${item.work.environment}` : ''}</div><div className="mt-1">Por {item.performedByName}</div></div>
                </div>
              ))}
            </div>
          )}
          <Pagination page={movementPage} total={movementsTotal} onChange={setMovementPage} />
        </div>
      )}

      {activeTab === 'tools' && (
        <div className="py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row"><div className="relative max-w-xl flex-1"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input className={cn(inputClass, 'pl-9')} value={toolSearch} onChange={(event) => {setToolSearch(event.target.value); setToolPage(0);}} placeholder="Buscar patrimonio ou serie" /></div><select className={cn(inputClass, 'sm:w-48')} value={toolStatus} onChange={(event) => {setToolStatus(event.target.value as WarehouseToolStatus | ''); setToolPage(0);}}><option value="">Todos os status</option>{Object.entries(toolStatusMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div>
            {canEdit && <button type="button" className={primaryButton} onClick={() => void openCreateTool()}><Plus className="h-4 w-4" /> Nova ferramenta</button>}
          </div>
          {toolsLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div> : tools.length === 0 ? <div className="mt-6"><EmptyState icon={Wrench} title="Nenhuma ferramenta" body="Cadastre unidades com patrimonio individual." /></div> : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tools.map((tool) => {
                const meta = toolStatusMeta[tool.status];
                return <div key={tool.id} className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{tool.product?.name || 'Ferramenta'}</h3><p className="mt-1 text-sm text-slate-600">Patrimônio: {tool.assetCode}</p></div><span className={cn('shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium', meta.className)}>{meta.label}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-400">Estado</dt><dd className="mt-1 text-slate-700">{tool.condition}</dd></div><div><dt className="text-slate-400">Funcionário</dt><dd className="mt-1 text-slate-700">{tool.employee?.name || '-'}</dd></div><div><dt className="text-slate-400">Obra</dt><dd className="mt-1 text-slate-700">{tool.work?.environment || '-'}</dd></div><div><dt className="text-slate-400">Retirada</dt><dd className="mt-1 text-slate-700">{tool.checkedOutAt ? new Date(tool.checkedOutAt).toLocaleDateString('pt-BR') : '-'}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3"><button type="button" className={secondaryButton} onClick={() => void openToolHistory(tool)}><History className="h-4 w-4" /> Histórico</button>{canMove && (tool.status === 'DISPONIVEL' ? <button type="button" className={primaryButton} onClick={() => void openCheckoutTool(tool)}><ArrowUpFromLine className="h-4 w-4" /> Retirar</button> : tool.status === 'EM_USO' ? <button type="button" className={secondaryButton} onClick={() => openReturnTool(tool)}><Undo2 className="h-4 w-4" /> Devolver</button> : null)}</div></div>;
              })}
            </div>
          )}
          <Pagination page={toolPage} total={toolsTotal} onChange={setToolPage} />
        </div>
      )}

      {activeTab === 'purchases' && (
        <div className="py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><select className={cn(inputClass, 'sm:w-52')} value={purchaseStatus} onChange={(event) => {setPurchaseStatus(event.target.value as WarehousePurchaseStatus | ''); setPurchasePage(0);}}><option value="">Todos os status</option>{purchaseStatuses.map((status) => <option key={status}>{status}</option>)}</select>{canBuy && <button type="button" className={primaryButton} onClick={() => void openPurchaseModal()}><Plus className="h-4 w-4" /> Adicionar item</button>}</div>
          {purchasesLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-primary" /></div> : purchases.length === 0 ? <div className="mt-6"><EmptyState icon={ShoppingCart} title="Lista de compras vazia" body="Adicione manualmente ou use os alertas de estoque." /></div> : (
            <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(200px,1fr)_130px_140px_190px] md:items-center">
                  <div><h3 className="text-sm font-semibold text-slate-900">{purchase.product?.name || 'Produto'}</h3><p className="mt-1 text-xs text-slate-500">Saldo {formatQuantity(Number(purchase.product?.current_quantity) || 0)} · minimo {formatQuantity(Number(purchase.product?.minimum_quantity) || 0)} · solicitado por {purchase.requestedByName}</p></div>
                  <div className="text-sm text-slate-800">{formatQuantity(purchase.requestedQuantity)} {purchase.product?.unit}</div>
                  <div className="text-xs text-slate-500">{new Date(purchase.requestedAt).toLocaleDateString('pt-BR')}</div>
                  <select className={inputClass} value={purchase.status} disabled={!canBuy || purchase.status === 'RECEBIDO' || purchase.status === 'CANCELADO'} onChange={(event) => void handlePurchaseStatus(purchase, event.target.value as WarehousePurchaseStatus)}>{purchaseStatuses.map((status) => <option key={status}>{status}</option>)}</select>
                </div>
              ))}
            </div>
          )}
          <Pagination page={purchasePage} total={purchasesTotal} onChange={setPurchasePage} />
        </div>
      )}

      <Modal title={editingProduct ? 'Editar produto' : 'Novo produto'} open={productModalOpen} onClose={() => !savingProduct && setProductModalOpen(false)} wide>
        <form onSubmit={handleSaveProduct} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Nome" required><input className={inputClass} maxLength={120} required value={productDraft.name} onChange={(event) => setProductDraft((value) => ({...value, name: event.target.value}))} /></Field></div>
          <Field label="Categoria" required><input className={inputClass} list="warehouse-categories" maxLength={60} required value={productDraft.category} onChange={(event) => setProductDraft((value) => ({...value, category: event.target.value}))} /><datalist id="warehouse-categories">{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</datalist></Field>
          <Field label="Tipo" required><select className={inputClass} disabled={Boolean(editingProduct)} value={productDraft.itemType} onChange={(event) => setProductDraft((value) => ({...value, itemType: event.target.value as WarehouseItemType}))}><option value="CONSUMIVEL">Consumível</option><option value="FERRAMENTA">Ferramenta</option></select></Field>
          <Field label="Unidade" required><input className={inputClass} list="warehouse-units" maxLength={30} required value={productDraft.unit} onChange={(event) => setProductDraft((value) => ({...value, unit: event.target.value}))} /><datalist id="warehouse-units">{UNITS.map((item) => <option key={item}>{item}</option>)}</datalist></Field>
          <Field label="Estoque minimo"><input className={inputClass} type="number" min="0" max="1000000" step="0.001" value={productDraft.minimumQuantity} onChange={(event) => setProductDraft((value) => ({...value, minimumQuantity: event.target.value}))} /></Field>
          <Field label="Localizacao fisica"><input className={inputClass} maxLength={120} value={productDraft.physicalLocation} onChange={(event) => setProductDraft((value) => ({...value, physicalLocation: event.target.value}))} /></Field>
          <Field label="Fornecedor padrao"><select className={inputClass} value={productDraft.supplierId} onChange={(event) => setProductDraft((value) => ({...value, supplierId: event.target.value}))}><option value="">Não informado</option>{settings.materialCatalog.suppliers.map((supplier) => <option key={supplier.id || supplier.name} value={supplier.id || supplier.name}>{supplier.name}</option>)}</select></Field>
          <Field label="Custo unitario"><CurrencyInput className={inputClass} value={productDraft.unitCost} onValueChange={(_, rawValue) => setProductDraft((value) => ({...value, unitCost: rawValue}))} /></Field>
          <div className="sm:col-span-2"><Field label="Descricao"><textarea className={textareaClass} maxLength={1000} value={productDraft.description} onChange={(event) => setProductDraft((value) => ({...value, description: event.target.value}))} /></Field></div>
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className={secondaryButton} onClick={() => setProductModalOpen(false)}>Cancelar</button><button type="submit" className={primaryButton} disabled={savingProduct}>{savingProduct && <Loader2 className="h-4 w-4 animate-spin" />} Salvar produto</button></div>
        </form>
      </Modal>

      <Modal title={movementDraft.type === 'SAIDA' ? 'Retirar material' : 'Registrar movimentacao'} open={movementModalOpen} onClose={() => !savingMovement && setMovementModalOpen(false)} wide>
        <form onSubmit={handleSaveMovement} className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" required><select className={inputClass} value={movementDraft.type} onChange={(event) => setMovementDraft((value) => ({...value, type: event.target.value as WarehouseMovementType}))}>{(['ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO'] as WarehouseMovementType[]).map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="Produto" required><select className={inputClass} required value={movementDraft.productId} onChange={(event) => setMovementDraft((value) => ({...value, productId: event.target.value}))}><option value="">Selecione</option>{productOptions.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatQuantity(item.currentQuantity)} {item.unit}</option>)}</select></Field>
          <Field label={movementDraft.type === 'AJUSTE' ? 'Novo saldo' : 'Quantidade'} required><input className={inputClass} type="number" min="0.001" max="1000000" step="0.001" required value={movementDraft.quantity} onChange={(event) => setMovementDraft((value) => ({...value, quantity: event.target.value}))} /></Field>
          <Field label="Funcionario" required={movementDraft.type === 'SAIDA'}><select className={inputClass} required={movementDraft.type === 'SAIDA'} value={movementDraft.employeeId} onChange={(event) => setMovementDraft((value) => ({...value, employeeId: event.target.value}))}><option value="">Nao vincular</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Cliente"><select className={inputClass} value={movementDraft.clientId} onChange={(event) => {const clientId = event.target.value; setMovementDraft((value) => ({...value, clientId, workQuoteId: '', quoteId: ''})); void loadProjects(clientId);}}><option value="">Nao vincular</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Obra"><select className={inputClass} disabled={!movementDraft.clientId} value={movementDraft.workQuoteId} onChange={(event) => setMovementDraft((value) => ({...value, workQuoteId: event.target.value}))}><option value="">Nao vincular</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.detail}</option>)}</select></Field>
          <Field label="Orcamento"><select className={inputClass} disabled={!movementDraft.clientId} value={movementDraft.quoteId} onChange={(event) => setMovementDraft((value) => ({...value, quoteId: event.target.value}))}><option value="">Nao vincular</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.detail}</option>)}</select></Field>
          <Field label="Motivo" required><input className={inputClass} maxLength={160} required value={movementDraft.reason} onChange={(event) => setMovementDraft((value) => ({...value, reason: event.target.value}))} /></Field>
          <div className="sm:col-span-2"><Field label="Observacao"><textarea className={textareaClass} maxLength={1000} value={movementDraft.notes} onChange={(event) => setMovementDraft((value) => ({...value, notes: event.target.value}))} /></Field></div>
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className={secondaryButton} onClick={() => setMovementModalOpen(false)}>Cancelar</button><button type="submit" className={primaryButton} disabled={savingMovement || referencesLoading}>{savingMovement && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar</button></div>
        </form>
      </Modal>

      <Modal title={toolModalMode === 'create' ? 'Nova ferramenta' : toolModalMode === 'return' ? 'Devolver ferramenta' : 'Retirar ferramenta'} open={Boolean(toolModalMode)} onClose={() => !savingTool && setToolModalMode(null)}>
        <form onSubmit={handleSaveTool} className="grid gap-4 sm:grid-cols-2">
          {toolModalMode === 'create' && <><div className="sm:col-span-2"><Field label="Produto" required><select className={inputClass} required value={toolDraft.productId} onChange={(event) => setToolDraft((value) => ({...value, productId: event.target.value}))}><option value="">Selecione</option>{productOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><Field label="Patrimonio" required><input className={inputClass} maxLength={80} required value={toolDraft.assetCode} onChange={(event) => setToolDraft((value) => ({...value, assetCode: event.target.value}))} /></Field><Field label="Numero de serie"><input className={inputClass} maxLength={120} value={toolDraft.serialNumber} onChange={(event) => setToolDraft((value) => ({...value, serialNumber: event.target.value}))} /></Field></>}
          {toolModalMode === 'checkout' && <><div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{selectedTool?.product?.name} · {selectedTool?.assetCode}</div><Field label="Funcionario" required><select className={inputClass} required value={toolDraft.employeeId} onChange={(event) => setToolDraft((value) => ({...value, employeeId: event.target.value}))}><option value="">Selecione</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Previsao de devolucao"><input className={inputClass} type="datetime-local" value={toolDraft.expectedReturnAt} onChange={(event) => setToolDraft((value) => ({...value, expectedReturnAt: event.target.value}))} /></Field><Field label="Cliente"><select className={inputClass} value={toolDraft.clientId} onChange={(event) => {const clientId = event.target.value; setToolDraft((value) => ({...value, clientId, workQuoteId: ''})); void loadProjects(clientId);}}><option value="">Nao vincular</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Obra"><select className={inputClass} disabled={!toolDraft.clientId} value={toolDraft.workQuoteId} onChange={(event) => setToolDraft((value) => ({...value, workQuoteId: event.target.value}))}><option value="">Nao vincular</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></>}
          {(toolModalMode === 'create' || toolModalMode === 'return') && <div className="sm:col-span-2"><Field label="Estado" required><input className={inputClass} maxLength={60} required value={toolDraft.condition} onChange={(event) => setToolDraft((value) => ({...value, condition: event.target.value}))} /></Field></div>}
          <div className="sm:col-span-2"><Field label="Observacao"><textarea className={textareaClass} maxLength={1000} value={toolDraft.notes} onChange={(event) => setToolDraft((value) => ({...value, notes: event.target.value}))} /></Field></div>
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className={secondaryButton} onClick={() => setToolModalMode(null)}>Cancelar</button><button type="submit" className={primaryButton} disabled={savingTool || referencesLoading}>{savingTool && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar</button></div>
        </form>
      </Modal>

      <Modal title="Adicionar a lista de compras" open={purchaseModalOpen} onClose={() => !savingPurchase && setPurchaseModalOpen(false)}>
        <form onSubmit={handleSavePurchase} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Produto" required><select className={inputClass} required value={purchaseDraft.productId} onChange={(event) => {const product = productOptions.find((item) => item.id === event.target.value); setPurchaseDraft((value) => ({...value, productId: event.target.value, supplierId: product?.defaultSupplierId || value.supplierId}));}}><option value="">Selecione</option>{productOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
          <Field label="Quantidade" required><input className={inputClass} type="number" min="0.001" max="1000000" step="0.001" required value={purchaseDraft.quantity} onChange={(event) => setPurchaseDraft((value) => ({...value, quantity: event.target.value}))} /></Field>
          <Field label="Quantidade sugerida"><input className={inputClass} type="number" min="0.001" max="1000000" step="0.001" value={purchaseDraft.suggestedQuantity} onChange={(event) => setPurchaseDraft((value) => ({...value, suggestedQuantity: event.target.value}))} /></Field>
          <div className="sm:col-span-2"><Field label="Fornecedor"><select className={inputClass} value={purchaseDraft.supplierId} onChange={(event) => setPurchaseDraft((value) => ({...value, supplierId: event.target.value}))}><option value="">Não informado</option>{settings.materialCatalog.suppliers.map((supplier) => <option key={supplier.id || supplier.name} value={supplier.id || supplier.name}>{supplier.name}</option>)}</select></Field></div>
          <div className="sm:col-span-2"><Field label="Observacao"><textarea className={textareaClass} maxLength={1000} value={purchaseDraft.notes} onChange={(event) => setPurchaseDraft((value) => ({...value, notes: event.target.value}))} /></Field></div>
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className={secondaryButton} onClick={() => setPurchaseModalOpen(false)}>Cancelar</button><button type="submit" className={primaryButton} disabled={savingPurchase || referencesLoading}>{savingPurchase && <Loader2 className="h-4 w-4 animate-spin" />} Adicionar</button></div>
        </form>
      </Modal>

      <Modal title={`Histórico · ${selectedTool?.assetCode || ''}`} open={toolHistoryOpen} onClose={() => setToolHistoryOpen(false)}>
        {toolHistoryLoading ? <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-brand-primary" /></div> : toolHistory.length === 0 ? <EmptyState icon={History} title="Sem historico" body="Nenhuma retirada ou devolucao registrada." /> : <div className="space-y-0">{toolHistory.map((entry) => <div key={entry.id} className="border-b border-slate-100 py-4 first:pt-0 last:border-b-0"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-900">{entry.movementType === 'RETIRADA' ? 'Retirada' : entry.movementType === 'DEVOLUCAO' ? 'Devolvida' : 'Status alterado'}</span><span className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</span></div><p className="mt-2 text-sm text-slate-600">{entry.employee?.name || 'Sem funcionario'}{entry.client?.name ? ` · ${entry.client.name}` : ''}{entry.work?.environment ? ` · ${entry.work.environment}` : ''}</p><p className="mt-1 text-xs text-slate-500">{entry.previousStatus} → {entry.resultingStatus} · por {entry.performedByName}</p>{entry.notes && <p className="mt-2 text-xs text-slate-500">{entry.notes}</p>}</div>)}</div>}
      </Modal>
    </div>
  );
};
