import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {Quote, Settings} from '../types';

const money = (value = 0) => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(value);

const toDate = (value: any) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date();
};

const safeText = (value?: string) => value?.trim() || '-';
const sideTypeLabel = (type?: string) => {
  if (type === 'frontao') return 'Frontao';
  if (type === 'saia') return 'Saia';
  if (type === 'virada') return 'Virada';
  if (type === 'pe') return 'Pe de bancada';
  if (type === 'guarnicao') return 'Guarnicao';
  return type || '-';
};

type PdfColor = [number, number, number];

const addSectionTitle = (doc: jsPDF, title: string, y: number, primary: PdfColor) => {
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.roundedRect(14, y - 5, 3, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 30, 50);
  doc.text(title.toUpperCase(), 21, y);
};

const addFooter = (doc: jsPDF, settings: Settings, primary: PdfColor) => {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(230, 226, 220);
    doc.line(14, 282, 196, 282);
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 145);
    doc.text(`${settings.companyName} | ${settings.phone} | ${settings.email}`, 14, 287);
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text(`Página ${page} de ${pages}`, 196, 287, {align: 'right'});
  }
};

export const generateQuotePDF = (quote: Quote, settings: Settings) => {
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const primary: PdfColor = [140, 106, 72];
  const dark: PdfColor = [15, 23, 42];
  const muted: PdfColor = [100, 116, 139];
  const light: PdfColor = [248, 250, 252];

  doc.setFillColor(dark[0], dark[1], dark[2]);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(settings.companyName || 'D Coratto Sob Medida', 14, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(220, 226, 235);
  doc.text(safeText(settings.address), 14, 24);
  doc.text(`${safeText(settings.phone)} | ${safeText(settings.email)}`, 14, 29);

  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.roundedRect(146, 10, 50, 18, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ORÇAMENTO TÉCNICO', 171, 17, {align: 'center'});
  doc.setFontSize(7);
  doc.text(format(toDate(quote.createdAt), 'dd/MM/yyyy', {locale: ptBR}), 171, 23, {align: 'center'});

  doc.setFillColor(light[0], light[1], light[2]);
  doc.roundedRect(14, 46, 182, 34, 4, 4, 'F');
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(safeText(quote.clientName), 20, 56);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(`Telefone: ${safeText(quote.phone)}`, 20, 63);
  doc.text(`Endereço: ${safeText(quote.address)}`, 20, 69, {maxWidth: 96});
  doc.text(`Ambiente: ${safeText(quote.environment)}`, 20, 75);
  doc.text(`Responsável: ${safeText(quote.responsible)}`, 122, 56);
  doc.text(`Validade: ${format(toDate(quote.validityDate), 'dd/MM/yyyy', {locale: ptBR})}`, 122, 63);
  doc.text(`Prazo: ${quote.deliveryDays || 0} dias úteis`, 122, 70);
  doc.text(`Pagamento: ${safeText(quote.paymentMethod)}`, 122, 77);

  addSectionTitle(doc, 'Resumo financeiro', 93, primary);
  autoTable(doc, {
    startY: 99,
    theme: 'plain',
    body: [
      ['Área total', `${(quote.totalArea || 0).toFixed(4)} m²`, 'Recortes', `${(quote.cutouts?.cooktop || 0) + (quote.cutouts?.sinkUnder || 0) + (quote.cutouts?.sinkOver || 0) + (quote.cutouts?.faucetHole || 0) + (quote.cutouts?.trashBinCutout || 0) + (quote.cutouts?.popUpTowerCutout || 0)} un`],
      ['Status', quote.status, 'Valor total', money(quote.totalPrice || 0)],
    ],
    styles: {fontSize: 9, cellPadding: 4, lineColor: [230, 226, 220], lineWidth: 0.2},
    columnStyles: {
      0: {fontStyle: 'bold', textColor: muted},
      1: {textColor: dark},
      2: {fontStyle: 'bold', textColor: muted},
      3: {fontStyle: 'bold', textColor: primary, halign: 'right'},
    },
    didParseCell: (data) => {
      if (data.row.index % 2 === 0) data.cell.styles.fillColor = [250, 248, 245];
    },
  });

  let cursorY = (doc as any).lastAutoTable.finalY + 14;
  addSectionTitle(doc, 'Peças e medidas', cursorY, primary);
  autoTable(doc, {
    startY: cursorY + 6,
    head: [['Item', 'Peça', 'Dimensões', 'Área', 'Adicionais', 'Observações']],
    body: quote.pieces.map((piece, index) => {
      const additions = (piece.sides || [])
        .filter((side) => side.type && side.type !== 'none')
        .map((side) => `${sideTypeLabel(side.type)} ${side.sideLabel || side.side || ''}`.trim())
        .join('\n') || '-';
      return [
        String(index + 1).padStart(2, '0'),
        piece.sculptedSink?.active ? `${piece.name}\nPia esculpida: ${piece.sculptedSink.type}` : piece.name,
        `${piece.length || 0} x ${piece.width || 0} cm`,
        `${(piece.totalArea || piece.manualArea || piece.area || 0).toFixed(4)} m²`,
        additions,
        piece.notes || '-',
      ];
    }),
    headStyles: {fillColor: primary as any, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8},
    bodyStyles: {textColor: dark},
    styles: {fontSize: 8, cellPadding: 3, lineColor: [230, 226, 220], lineWidth: 0.2, valign: 'top'},
    alternateRowStyles: {fillColor: [250, 248, 245]},
    columnStyles: {
      0: {cellWidth: 13, halign: 'center', fontStyle: 'bold'},
      2: {cellWidth: 25},
      3: {cellWidth: 22, halign: 'right'},
      4: {cellWidth: 38},
    },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 12;
  const previews = quote.pieces.filter((piece) => piece.previewUrl);
  if (previews.length > 0) {
    if (cursorY > 210) {
      doc.addPage();
      cursorY = 20;
    }
    addSectionTitle(doc, 'Desenhos técnicos', cursorY, primary);
    cursorY += 8;
    previews.slice(0, 4).forEach((piece, index) => {
      const x = index % 2 === 0 ? 14 : 106;
      const y = cursorY + Math.floor(index / 2) * 58;
      doc.setFillColor(250, 248, 245);
      doc.roundedRect(x, y, 86, 50, 3, 3, 'F');
      doc.setTextColor(dark[0], dark[1], dark[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(piece.name, x + 4, y + 6);
      try {
        doc.addImage(piece.previewUrl, 'PNG', x + 4, y + 9, 78, 36, undefined, 'FAST');
      } catch {
        doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.text('Preview indisponível', x + 43, y + 28, {align: 'center'});
      }
    });
    cursorY += Math.ceil(previews.slice(0, 4).length / 2) * 58 + 4;
  }

  if (cursorY > 225) {
    doc.addPage();
    cursorY = 22;
  }

  addSectionTitle(doc, 'Recortes e condições', cursorY, primary);
  autoTable(doc, {
    startY: cursorY + 6,
    head: [['Tipo', 'Quantidade']],
    body: [
      ['Cooktop', quote.cutouts?.cooktop || 0],
      ['Cuba embutida', quote.cutouts?.sinkUnder || 0],
      ['Cuba sobreposta', quote.cutouts?.sinkOver || 0],
      ['Furação de torneira', quote.cutouts?.faucetHole || 0],
      ['Lixeira de embutir', quote.cutouts?.trashBinCutout || 0],
      ['Torre de tomada', quote.cutouts?.popUpTowerCutout || 0],
    ].filter((row) => Number(row[1]) > 0),
    theme: 'grid',
    headStyles: {fillColor: [31, 41, 55], textColor: [255, 255, 255], fontSize: 8},
    styles: {fontSize: 8, cellPadding: 3, lineColor: [230, 226, 220], lineWidth: 0.2},
  });

  cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 12) + 10;
  doc.setFillColor(dark[0], dark[1], dark[2]);
  doc.roundedRect(116, cursorY, 80, 24, 4, 4, 'F');
  doc.setTextColor(210, 216, 225);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('VALOR TOTAL DO ORÇAMENTO', 122, cursorY + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(money(quote.totalPrice || 0), 190, cursorY + 18, {align: 'right'});

  if (quote.commercialNotes) {
    const noteY = cursorY + 34;
    if (noteY < 265) {
      addSectionTitle(doc, 'Observações comerciais', noteY, primary);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text(doc.splitTextToSize(quote.commercialNotes, 180), 14, noteY + 8);
    }
  }

  addFooter(doc, settings, primary);
  doc.save(`Orcamento_${quote.clientName.replace(/\s+/g, '_')}.pdf`);
};
