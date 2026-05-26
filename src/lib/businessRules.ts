import {Client, InventoryItem, InventoryPurchase, InventoryReservation, Material, Quote} from '../types';

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizeStockStatus = (value: unknown) => normalize(value);

export const validateClientPayload = (payload: {
  name?: string;
  phone?: string;
  city?: string;
  addressType?: Client['addressType'];
  condominiumId?: string | null;
  block?: string;
  lot?: string;
}) => {
  if (!String(payload.name || '').trim()) return 'Informe o nome do cliente.';
  if (!String(payload.phone || '').trim()) return 'Informe o telefone do cliente.';
  if (!String(payload.city || '').trim()) return 'Informe a cidade do cliente.';
  if (payload.addressType === 'condominio' && payload.condominiumId && (!String(payload.block || '').trim() || !String(payload.lot || '').trim())) {
    return 'Preencha quadra e lote para clientes vinculados a condomínio em modo lote.';
  }
  return null;
};

export const validateInventoryItemPayload = (
  payload: {
    selectedMaterialId?: string;
    code?: string;
    length?: number;
    width?: number;
    cost?: number;
    minimumSalePrice?: number;
  },
  items: InventoryItem[],
  editingId?: string,
) => {
  if (!payload.selectedMaterialId) return 'Selecione uma pedra cadastrada no Admin.';
  if (!String(payload.code || '').trim()) return 'Informe o código ou lote da chapa.';
  if (!Number(payload.length) || Number(payload.length) <= 0) return 'Informe um comprimento válido para a chapa.';
  if (!Number(payload.width) || Number(payload.width) <= 0) return 'Informe uma largura válida para a chapa.';
  if (!Number(payload.cost) || Number(payload.cost) <= 0) return 'Informe um valor de compra válido.';
  if (!Number(payload.minimumSalePrice) || Number(payload.minimumSalePrice) <= 0) return 'Informe um valor mínimo de venda válido.';

  const duplicateCode = items.find((item) =>
    item.id !== editingId &&
    normalize(item.code) === normalize(payload.code) &&
    normalize(item.materialId) === normalize(payload.selectedMaterialId),
  );
  if (duplicateCode) {
    return `Já existe uma chapa desta pedra com o lote "${payload.code}".`;
  }
  return null;
};

export const validateMaterialSalePrice = (minimumSalePerM2: number, salePricePerM2: number) => {
  if (!Number.isFinite(salePricePerM2) || salePricePerM2 <= 0) return 'Informe um preço final de venda válido.';
  if (minimumSalePerM2 > 0 && salePricePerM2 < minimumSalePerM2) {
    return 'O preço final não pode ficar abaixo do mínimo de venda definido no estoque.';
  }
  return null;
};

export const validatePurchaseSlabs = (
  slabs: Array<{length: string | number; width: string | number; cost: string | number; minimumSalePrice?: string | number; code?: string}>,
) => {
  if (slabs.length === 0) return 'Adicione pelo menos uma chapa ao pedido.';
  for (const slab of slabs) {
    if (!Number(slab.length) || !Number(slab.width)) return 'Preencha comprimento e largura de todas as chapas.';
    if (!Number(slab.cost) || !Number(slab.minimumSalePrice || slab.cost)) return 'Preencha compra e mínimo de venda de todas as chapas.';
  }
  return null;
};

export const validateQuoteBeforeSave = ({
  clientId,
  pieces,
  selectedClient,
  totalArea,
  totalPrice,
  calculatePieceArea,
}: {
  clientId?: string;
  pieces: Quote['pieces'];
  selectedClient?: Client | null;
  totalArea: number;
  totalPrice: number;
  calculatePieceArea: (piece: Quote['pieces'][number]) => {totalArea: number};
}) => {
  const MAX_QUOTE_TOTAL_AREA = 9999999999.9999;
  const MAX_QUOTE_TOTAL_PRICE = 999999999999.99;
  const MAX_DIMENSION_CM = 5000;
  const MAX_DIMENSION_M = 50;
  const MAX_PIECE_AREA = 5000;

  if (!clientId) return 'Por favor, selecione um cliente.';
  if (!selectedClient) return 'O cliente selecionado não foi encontrado. Atualize a tela e tente novamente.';
  if (!pieces.length) return 'Adicione pelo menos uma peça ao orçamento.';
  if (pieces.some((piece) => !piece.materialId)) return 'Selecione o material de todas as peças.';
  if (pieces.some((piece) => !piece.name?.trim())) return 'Preencha o nome de todas as peças.';

  for (const piece of pieces) {
    if (piece.stair?.active) {
      const unitLimit = piece.stair.unit === 'cm' ? MAX_DIMENSION_CM : MAX_DIMENSION_M;
      const values = [
        {label: 'largura do degrau', value: Number(piece.stair.stepWidth || 0)},
        {label: 'profundidade do piso', value: Number(piece.stair.treadDepth || 0)},
        {label: 'altura do espelho', value: Number(piece.stair.riserHeight || 0)},
        {label: 'largura do patamar', value: Number(piece.stair.landingWidth || 0)},
        {label: 'profundidade do patamar', value: Number(piece.stair.landingDepth || 0)},
      ];
      const invalidStairDimension = values.find(({value}) => !Number.isFinite(value) || value < 0 || value > unitLimit);
      if (invalidStairDimension) {
        return `A peça "${piece.name}" tem ${invalidStairDimension.label} fora do limite esperado. Revise as medidas da escada.`;
      }
    } else {
      const unitLimit = piece.unit === 'cm' ? MAX_DIMENSION_CM : MAX_DIMENSION_M;
      const width = Number(piece.width || 0);
      const length = Number(piece.length || 0);
      if (!Number.isFinite(width) || width <= 0 || width > unitLimit) {
        return `A peça "${piece.name}" está com uma largura fora do limite esperado. Revise a medida antes de salvar.`;
      }
      if (!Number.isFinite(length) || length <= 0 || length > unitLimit) {
        return `A peça "${piece.name}" está com um comprimento fora do limite esperado. Revise a medida antes de salvar.`;
      }
    }

    if (piece.manualArea && (!Number.isFinite(piece.manualArea) || piece.manualArea <= 0 || piece.manualArea > MAX_PIECE_AREA)) {
      return `A peça "${piece.name}" está com uma área de desenho fora do limite esperado. Reabra o desenho e salve novamente.`;
    }

    const pieceTotals = calculatePieceArea(piece);
    if (!Number.isFinite(pieceTotals.totalArea) || pieceTotals.totalArea <= 0 || pieceTotals.totalArea > MAX_PIECE_AREA) {
      return `A peça "${piece.name}" ficou com uma área total inválida. Revise medidas, desenho e adicionais antes de salvar.`;
    }
  }

  if (!Number.isFinite(totalArea) || totalArea <= 0 || totalArea > MAX_QUOTE_TOTAL_AREA) {
    return 'A área total do orçamento ficou inválida. Revise as medidas das peças antes de salvar.';
  }

  if (!Number.isFinite(totalPrice) || totalPrice <= 0 || totalPrice > MAX_QUOTE_TOTAL_PRICE) {
    return 'O valor total do orçamento ficou inválido. Revise medidas e preços das peças antes de salvar.';
  }

  return null;
};

export type OperationalAlert = {
  id: string;
  level: 'high' | 'medium' | 'info';
  title: string;
  detail: string;
  path: string;
};

export const buildOperationalAlerts = ({
  materials,
  inventory,
  purchases,
  reservations,
}: {
  materials: Material[];
  inventory: InventoryItem[];
  purchases: InventoryPurchase[];
  reservations: InventoryReservation[];
}) => {
  const alerts: OperationalAlert[] = [];
  const activeInventory = inventory.filter((item) => !['usada', 'descarte'].includes(normalizeStockStatus(item.status)));
  const stockMaterialIds = new Set(activeInventory.map((item) => item.materialId).filter(Boolean));
  const materialsWithoutPrice = materials.filter((material) => stockMaterialIds.has(material.id) && !(material.pricePerM2 > 0));
  const inventoryWithoutRack = activeInventory.filter((item) => !String(item.rackId || '').trim());
  const inventoryWithoutMinimum = activeInventory.filter((item) => !(Number(item.minimumSalePrice) > 0));
  const inactiveInStock = materials.filter((material) => material.active === false && stockMaterialIds.has(material.id));
  const pendingPurchases = purchases.filter((purchase) => purchase.status === 'Pedido');
  const activeReservations = reservations.filter((reservation) => !['cancelado', 'recusado', 'finalizado'].includes(normalize(reservation.quoteStatus)));

  if (materialsWithoutPrice.length) {
    alerts.push({
      id: 'materials-without-price',
      level: 'high',
      title: 'Pedras sem preço final de venda',
      detail: `${materialsWithoutPrice.length} pedra(s) do estoque ainda não têm preço final configurado em Materiais.`,
      path: '/materials',
    });
  }

  if (inventoryWithoutRack.length) {
    alerts.push({
      id: 'inventory-without-rack',
      level: 'medium',
      title: 'Chapas sem localização no pátio',
      detail: `${inventoryWithoutRack.length} chapa(s) estão sem cavalete definido.`,
      path: '/inventory',
    });
  }

  if (inventoryWithoutMinimum.length) {
    alerts.push({
      id: 'inventory-without-minimum',
      level: 'high',
      title: 'Chapas sem mínimo de venda',
      detail: `${inventoryWithoutMinimum.length} chapa(s) precisam de mínimo de venda para manter o fluxo comercial íntegro.`,
      path: '/inventory',
    });
  }

  if (inactiveInStock.length) {
    alerts.push({
      id: 'inactive-material-in-stock',
      level: 'info',
      title: 'Pedras inativas ainda presentes no estoque',
      detail: `${inactiveInStock.length} pedra(s) estão inativas no cadastro base, mas ainda possuem chapa física no estoque.`,
      path: '/admin',
    });
  }

  if (pendingPurchases.length) {
    alerts.push({
      id: 'pending-purchases',
      level: 'info',
      title: 'Compras aguardando recebimento',
      detail: `${pendingPurchases.length} pedido(s) ainda estão marcados como Pedido.`,
      path: '/inventory',
    });
  }

  if (activeReservations.length) {
    alerts.push({
      id: 'active-reservations',
      level: 'info',
      title: 'Reservas de estoque em andamento',
      detail: `${activeReservations.length} reserva(s) seguem vinculadas a orçamentos em andamento.`,
      path: '/materials',
    });
  }

  return alerts;
};

export type QuickSearchResult = {
  id: string;
  type: 'cliente' | 'orcamento' | 'estoque' | 'material';
  label: string;
  subtitle: string;
  path: string;
};

export const buildQuickSearchResults = ({
  term,
  clients,
  quotes,
  inventory,
  materials,
}: {
  term: string;
  clients: Client[];
  quotes: Quote[];
  inventory: InventoryItem[];
  materials: Material[];
}) => {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return [] as QuickSearchResult[];

  const results: QuickSearchResult[] = [];

  clients.forEach((client) => {
    const haystack = normalize(`${client.name} ${client.phone} ${client.city} ${client.address}`);
    if (!haystack.includes(normalizedTerm)) return;
    results.push({
      id: `client-${client.id}`,
      type: 'cliente',
      label: client.name,
      subtitle: [client.phone, client.city].filter(Boolean).join(' · ') || 'Cliente',
      path: '/clients',
    });
  });

  quotes.forEach((quote) => {
    const haystack = normalize(`${quote.clientName} ${quote.environment} ${quote.materialName} ${quote.status}`);
    if (!haystack.includes(normalizedTerm)) return;
    results.push({
      id: `quote-${quote.id}`,
      type: 'orcamento',
      label: quote.clientName || 'Orçamento',
      subtitle: [quote.environment, quote.status].filter(Boolean).join(' · '),
      path: `/quotes/edit/${quote.id}`,
    });
  });

  inventory.forEach((item) => {
    const haystack = normalize(`${item.materialName} ${item.code} ${item.provider} ${item.rackId}`);
    if (!haystack.includes(normalizedTerm)) return;
    results.push({
      id: `inventory-${item.id}`,
      type: 'estoque',
      label: `${item.materialName} · ${item.code}`,
      subtitle: [item.provider, item.rackId || 'Sem cavalete'].filter(Boolean).join(' · '),
      path: '/inventory',
    });
  });

  materials.forEach((material) => {
    const haystack = normalize(`${material.name} ${material.provider} ${material.category} ${material.materialLine}`);
    if (!haystack.includes(normalizedTerm)) return;
    results.push({
      id: `material-${material.id}`,
      type: 'material',
      label: material.name,
      subtitle: [material.provider, material.category].filter(Boolean).join(' · ') || 'Material',
      path: '/materials',
    });
  });

  return results;
};
