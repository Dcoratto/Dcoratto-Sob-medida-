import {formatMaterialSpecsWithProvider} from './materialSpecs';
import {formatArea, formatCentimeters, formatCurrency, formatNumber} from './utils';
import type {InventoryPurchase, Settings} from '../types';

type PurchaseOrderGroup = {
  groupId: string;
  supplier: string;
  purchases: InventoryPurchase[];
};

const AREA_UNIT = 'm²';

const sanitizePdfText = (value: string) =>
  String(value || '')
    .replace(/[²]/g, '2')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/²/g, '2')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const safeFilePart = (value: string) =>
  sanitizePdfText(value || 'pedido')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const generatePurchaseOrderPdf = async (group: PurchaseOrderGroup, settings: Settings) => {
  const [{jsPDF}, {default: autoTable}] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const totalArea = group.purchases.reduce((sum, item) => sum + (item.area || 0), 0);
  const totalCost = group.purchases.reduce((sum, item) => sum + (item.cost || 0), 0);

  doc.setFillColor(18, 49, 120);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(sanitizePdfText(settings.companyName || "D'Coratto Sob Medida"), 14, 13);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Pedido de compra de chapas', 14, 21);

  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Fornecedor', 14, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(sanitizePdfText(group.supplier || 'Não informado'), 14, 44);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 140, 44);

  autoTable(doc, {
    startY: 54,
    head: [[
      'Material',
      'Especificações',
      'Lote',
      'Dimensões',
      'Área',
      'Compra',
    ]],
    body: group.purchases.map((purchase) => [
      sanitizePdfText(purchase.materialName),
      sanitizePdfText(formatMaterialSpecsWithProvider(purchase)),
      sanitizePdfText(purchase.code || '-'),
      `${formatCentimeters(purchase.length)} x ${formatCentimeters(purchase.width)}`,
      formatArea(purchase.area || 0),
      sanitizePdfText(formatCurrency(purchase.cost || 0)),
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: [18, 49, 120],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 10,
      cellPadding: 2.5,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: {cellWidth: 34},
      1: {cellWidth: 58},
      2: {cellWidth: 24},
      3: {cellWidth: 28},
      4: {cellWidth: 18},
      5: {cellWidth: 22},
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 60;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Total de chapas: ${group.purchases.length}`, 14, finalY + 12);
  doc.text(`Área total: ${formatNumber(totalArea)} m²`, 14, finalY + 18);
  doc.text(sanitizePdfText(`Compra total: ${formatCurrency(totalCost)}`), 14, finalY + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(sanitizePdfText(`${settings.phone || ''} ${settings.email ? ` | ${settings.email}` : ''}`.trim()), 14, 286);

  doc.save(`Pedido_${safeFilePart(group.supplier || group.groupId)}.pdf`);
};


