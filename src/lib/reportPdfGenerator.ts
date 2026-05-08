import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import {Employee, InventoryItem, Material, ProductionStep, Quote} from '../types';

type PdfColor = [number, number, number];

export interface ReportMaterialSale {
  name: string;
  count: number;
  value: number;
}

export interface ReportDeadlineAlert {
  quote: Quote;
  daysLeft: number;
}

export interface ReportEmployeeStat {
  employee: Employee;
  evaluations: Array<{rating: number; evaluatedByName?: string}>;
  assignments: unknown[];
  average: number;
}

export interface ReportEvaluationHistory {
  quote: Quote;
  item: {
    step: ProductionStep;
    employeeId: string;
    employeeName: string;
    rating: number;
    notes?: string;
    createdAt?: any;
    evaluatedByName?: string;
  };
}

export interface ReportProductionHistory {
  quote: Quote;
  item: {
    status: string;
    changedAt: any;
    changedByName?: string;
    responsibleEmployeeName?: string;
    step?: ProductionStep;
    note?: string;
  };
}

export interface ReportPdfData {
  periodLabel: string;
  quotes: Quote[];
  materials: Material[];
  inventory: InventoryItem[];
  totalSold: number;
  openValue: number;
  refusedValue: number;
  conversionRate: number;
  statusCounts: Array<{status: string; count: number}>;
  materialSales: ReportMaterialSale[];
  deadlineAlerts: ReportDeadlineAlert[];
  employeeStats: ReportEmployeeStat[];
  evaluationHistory: ReportEvaluationHistory[];
  productionHistory: ReportProductionHistory[];
  productionStepLabels: Record<ProductionStep, string>;
}

const money = (value = 0) => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(value);

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

const dateText = (value: any) => {
  const date = toDate(value);
  return date ?date.toLocaleDateString('pt-BR') : '-';
};

const addFooter = (doc: jsPDF, primary: PdfColor) => {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 282, 196, 282);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Relatório emitido em ${new Date().toLocaleString('pt-BR')}`, 14, 287);
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text(`Página ${page} de ${pages}`, 196, 287, {align: 'right'});
  }
};

const sectionTitle = (doc: jsPDF, title: string, y: number, primary: PdfColor) => {
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.roundedRect(14, y - 5, 3, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title.toUpperCase(), 21, y);
};

const card = (doc: jsPDF, x: number, y: number, w: number, label: string, value: string, primary: PdfColor) => {
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, 24, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x + 4, y + 8);
  doc.setFontSize(13);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text(value, x + 4, y + 18, {maxWidth: w - 8});
};

const currentStepText = (quote: Quote, labels: Record<ProductionStep, string>) => {
  const assignments = quote.employeeAssignments || [];
  const openStep = assignments.find((item) => !item.finishedAt);
  const lastStep = assignments[assignments.length - 1];
  const step = openStep || lastStep;
  if (!step) return 'Sem responsável';
  const label = labels[step.step] || step.step;
  return `${label}${step.employeeName ?` | ${step.employeeName}` : ''}`;
};

export const generateReportPDF = (data: ReportPdfData) => {
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const primary: PdfColor = [140, 106, 72];
  const dark: PdfColor = [15, 23, 42];
  const muted: PdfColor = [100, 116, 139];

  doc.setFillColor(dark[0], dark[1], dark[2]);
  doc.rect(0, 0, 210, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text("D'Coratto Sob Medida", 14, 22);
  doc.setFontSize(13);
  doc.text('Relatório gerencial da marmoraria', 14, 33);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(210, 216, 225);
  doc.text(`Período: ${data.periodLabel}`, 14, 43);
  doc.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 50);
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.roundedRect(148, 18, 48, 26, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('GESTÃO', 172, 29, {align: 'center'});
  doc.setFontSize(8);
  doc.text('Produção | Prazos | Equipe', 172, 36, {align: 'center'});

  let y = 76;
  sectionTitle(doc, 'Resumo executivo', y, primary);
  y += 8;
  card(doc, 14, y, 42, 'Fechado', money(data.totalSold), primary);
  card(doc, 60, y, 40, 'Conversão', `${data.conversionRate}%`, primary);
  card(doc, 104, y, 42, 'Em aberto', money(data.openValue), primary);
  card(doc, 150, y, 46, 'Estoque', `${data.inventory.length} itens`, primary);
  y += 34;

  sectionTitle(doc, 'Sumário por seção', y, primary);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text('Financeiro | Funil de produção | Projetos e prazos | Materiais | Desempenho da equipe | Histórico operacional', 14, y + 9, {maxWidth: 180});
  y += 22;

  sectionTitle(doc, 'Financeiro detalhado', y, primary);
  autoTable(doc, {
    startY: y + 6,
    head: [['Indicador', 'Valor']],
    body: [
      ['Orçamentos fechados', money(data.totalSold)],
      ['Orçamentos em aberto', money(data.openValue)],
      ['Orçamentos recusados', money(data.refusedValue)],
      ['Ticket médio', money(data.quotes.length ?data.quotes.reduce((sum, quote) => sum + (quote.totalPrice || 0), 0) / data.quotes.length : 0)],
      ['Total de orçamentos no período', String(data.quotes.length)],
    ],
    headStyles: {fillColor: primary, textColor: [255, 255, 255], fontSize: 8},
    styles: {fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.2},
    alternateRowStyles: {fillColor: [248, 250, 252]},
    columnStyles: {1: {halign: 'right', fontStyle: 'bold'}},
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  sectionTitle(doc, 'Funil de orçamento e produção', y, primary);
  y += 8;
  const maxStatus = Math.max(1, ...data.statusCounts.map((item) => item.count));
  data.statusCounts.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(item.status, 14, y);
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(58, y - 4, 100, 4, 2, 2, 'F');
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.roundedRect(58, y - 4, (item.count / maxStatus) * 100, 4, 2, 2, 'F');
    doc.text(String(item.count), 164, y);
    y += 7;
  });

  doc.addPage();
  y = 20;
  sectionTitle(doc, 'Projetos, responsáveis e prazos', y, primary);
  autoTable(doc, {
    startY: y + 6,
    head: [['Cliente', 'Projeto', 'Status', 'Resp. orcamento', 'Etapa atual', 'Prazo', 'Valor']],
    body: data.quotes.slice(0, 30).map((quote) => [
      quote.clientName,
      quote.environment || '-',
      quote.status,
      quote.responsibleUserName || quote.responsible || '-',
      currentStepText(quote, data.productionStepLabels),
      dateText(quote.validityDate),
      money(quote.totalPrice || 0),
    ]),
    headStyles: {fillColor: primary, textColor: [255, 255, 255], fontSize: 7.5},
    styles: {fontSize: 7.3, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2, valign: 'top'},
    alternateRowStyles: {fillColor: [248, 250, 252]},
    columnStyles: {6: {halign: 'right'}},
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  if (y > 210) {
    doc.addPage();
    y = 20;
  }
  sectionTitle(doc, 'Alertas e prazos críticos', y, primary);
  autoTable(doc, {
    startY: y + 6,
    head: [['Cliente', 'Projeto', 'Situação', 'Status']],
    body: data.deadlineAlerts.length
      ?data.deadlineAlerts.map(({quote, daysLeft}) => [
        quote.clientName,
        quote.environment || '-',
        daysLeft < 0 ?`${Math.abs(daysLeft)} dia(s) atrasado` : `vence em ${daysLeft} dia(s)`,
        quote.status,
      ])
      : [['Sem alertas críticos', '-', '-', '-']],
    headStyles: {fillColor: dark, textColor: [255, 255, 255], fontSize: 8},
    styles: {fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.2},
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  if (y > 215) {
    doc.addPage();
    y = 20;
  }
  sectionTitle(doc, 'Materiais mais vendidos', y, primary);
  autoTable(doc, {
    startY: y + 6,
    head: [['Material', 'Orçamentos', 'Valor gerado']],
    body: data.materialSales.length
      ?data.materialSales.map((item) => [item.name, item.count, money(item.value)])
      : [['Sem materiais vendidos', '-', '-']],
    headStyles: {fillColor: primary, textColor: [255, 255, 255], fontSize: 8},
    styles: {fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.2},
    columnStyles: {2: {halign: 'right', fontStyle: 'bold'}},
  });

  doc.addPage();
  y = 20;
  sectionTitle(doc, 'Desempenho da equipe', y, primary);
  autoTable(doc, {
    startY: y + 6,
    head: [['Funcionário', 'Função', 'Etapas', 'Avaliações', 'Média']],
    body: data.employeeStats.length
      ?data.employeeStats.map(({employee, assignments, evaluations, average}) => [
        employee.name,
        employee.role,
        assignments.length,
        evaluations.length,
        average ?average.toFixed(1) : '-',
      ])
      : [['Sem funcionários cadastrados', '-', '-', '-', '-']],
    headStyles: {fillColor: primary, textColor: [255, 255, 255], fontSize: 8},
    styles: {fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.2},
    alternateRowStyles: {fillColor: [248, 250, 252]},
    columnStyles: {2: {halign: 'center'}, 3: {halign: 'center'}, 4: {halign: 'center', fontStyle: 'bold'}},
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  if (y > 210) {
    doc.addPage();
    y = 20;
  }
  sectionTitle(doc, 'Avaliacoes registradas', y, primary);
  autoTable(doc, {
    startY: y + 6,
    head: [['Data', 'Cliente', 'Funcionario', 'Etapa', 'Nota', 'Avaliador', 'Observacao']],
    body: data.evaluationHistory.length
      ?data.evaluationHistory.slice(0, 30).map(({quote, item}) => [
        dateText(item.createdAt),
        quote.clientName,
        item.employeeName,
        data.productionStepLabels[item.step],
        `${item.rating}/5`,
        item.evaluatedByName || '-',
        item.notes || '-',
      ])
      : [['-', 'Sem avaliacoes no periodo', '-', '-', '-', '-', '-']],
    headStyles: {fillColor: primary, textColor: [255, 255, 255], fontSize: 7.2},
    styles: {fontSize: 6.8, cellPadding: 2.2, lineColor: [226, 232, 240], lineWidth: 0.2, valign: 'top'},
    alternateRowStyles: {fillColor: [248, 250, 252]},
    columnStyles: {0: {cellWidth: 18}, 1: {cellWidth: 28}, 4: {cellWidth: 14, halign: 'center'}, 5: {cellWidth: 26}},
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  if (y > 210) {
    doc.addPage();
    y = 20;
  }
  sectionTitle(doc, 'Histórico operacional', y, primary);
  autoTable(doc, {
    startY: y + 6,
    head: [['Data', 'Cliente', 'Movimentação', 'Funcionário', 'Alterado por', 'Etapa']],
    body: data.productionHistory.length
      ?data.productionHistory.slice(0, 35).map(({quote, item}) => [
        dateText(item.changedAt),
        quote.clientName,
        item.note || item.status,
        item.responsibleEmployeeName || '-',
        item.changedByName || '-',
        item.step ?data.productionStepLabels[item.step] : '-',
      ])
      : [['-', 'Sem movimentações no período', '-', '-', '-', '-']],
    headStyles: {fillColor: dark, textColor: [255, 255, 255], fontSize: 7.5},
    styles: {fontSize: 7.2, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2, valign: 'top'},
    columnStyles: {0: {cellWidth: 18}, 1: {cellWidth: 30}, 3: {cellWidth: 28}, 4: {cellWidth: 28}, 5: {cellWidth: 22}},
  });

  addFooter(doc, primary);
  doc.save(`Relatorio_DCoratto_${data.periodLabel.replace(/\s+/g, '_')}.pdf`);
};
