import type {Settings} from '../types';
import {formatArea, formatCentimeters, formatCurrency} from './utils';

type QuickQuotePiece = {
  name: string;
  materialName: string;
  area: number;
  price: number;
  length?: number;
  width?: number;
  previewUrl?: string;
};

type QuickQuotePdfData = {
  clientName: string;
  clientPhone?: string;
  environment?: string;
  quoteDate?: Date;
  totalArea: number;
  totalPrice: number;
  pieces: QuickQuotePiece[];
};

const safeText = (value?: string) => value?.trim() || '-';

const detectImageFormat = (src?: string) => {
  const value = String(src || '');
  if (value.startsWith('data:image/png')) return 'PNG';
  if (value.startsWith('data:image/jpeg') || value.startsWith('data:image/jpg')) return 'JPEG';
  if (value.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
};

export const generateQuickQuotePDF = async (data: QuickQuotePdfData, settings: Settings) => {
  const [{jsPDF}] = await Promise.all([
    import('jspdf'),
  ]);

  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const gold: [number, number, number] = [151, 116, 79];
  const sand: [number, number, number] = [244, 238, 231];
  const ink: [number, number, number] = [32, 35, 42];
  const muted: [number, number, number] = [113, 118, 128];

  doc.setFillColor(sand[0], sand[1], sand[2]);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setFillColor(gold[0], gold[1], gold[2]);
  doc.roundedRect(margin, 12, pageWidth - margin * 2, 30, 8, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(settings.companyName || "D'Coratto Sob Medida", margin + 6, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text([safeText(settings.phone), safeText(settings.email)].filter((item) => item !== '-').join('  •  ') || '-', margin + 6, 32);
  doc.text('Orçamento rápido', pageWidth - margin - 6, 25, {align: 'right'});
  doc.text((data.quoteDate || new Date()).toLocaleDateString('pt-BR'), pageWidth - margin - 6, 32, {align: 'right'});

  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(safeText(data.clientName), margin, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(`Ambiente: ${safeText(data.environment)}`, margin, 61);
  doc.text(`Telefone: ${safeText(data.clientPhone)}`, margin, 67);

  const cardY = 76;
  const cardWidth = (pageWidth - margin * 2 - 8) / 2;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, cardY, cardWidth, 26, 6, 6, 'F');
  doc.roundedRect(margin + cardWidth + 8, cardY, cardWidth, 26, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text('Valor do projeto', margin + 5, cardY + 8);
  doc.text('Metragem total', margin + cardWidth + 13, cardY + 8);
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFontSize(20);
  doc.text(formatCurrency(data.totalPrice), margin + 5, cardY + 19);
  doc.text(formatArea(data.totalArea), margin + cardWidth + 13, cardY + 19);

  let y = 112;
  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Resumo das peças', margin, y);
  y += 7;

  data.pieces.forEach((piece, index) => {
    if (y > 242) {
      doc.addPage();
      doc.setFillColor(sand[0], sand[1], sand[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      y = 20;
    }

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 48, 6, 6, 'F');
    doc.setDrawColor(232, 224, 214);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 48, 6, 6, 'S');

    const imageX = margin + 4;
    const imageY = y + 4;
    const imageW = 48;
    const imageH = 40;

    if (piece.previewUrl) {
      try {
        doc.addImage(piece.previewUrl, detectImageFormat(piece.previewUrl), imageX, imageY, imageW, imageH, undefined, 'FAST');
      } catch {
        doc.setFillColor(246, 241, 235);
        doc.roundedRect(imageX, imageY, imageW, imageH, 4, 4, 'F');
        doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.setFontSize(8);
        doc.text('Desenho', imageX + imageW / 2, imageY + imageH / 2, {align: 'center'});
      }
    } else {
      doc.setFillColor(246, 241, 235);
      doc.roundedRect(imageX, imageY, imageW, imageH, 4, 4, 'F');
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.setFontSize(8);
      doc.text('Sem desenho', imageX + imageW / 2, imageY + imageH / 2, {align: 'center'});
    }

    const contentX = imageX + imageW + 6;
    doc.setTextColor(ink[0], ink[1], ink[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${index + 1}. ${safeText(piece.name)}`, contentX, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(`Material: ${safeText(piece.materialName)}`, contentX, y + 17);
    doc.text(
      `Medidas: ${piece.length && piece.width ? `${formatCentimeters(piece.length)} x ${formatCentimeters(piece.width)}` : '-'}`,
      contentX,
      y + 23,
    );
    doc.text(`Metragem: ${formatArea(piece.area)}`, contentX, y + 29);

    doc.setTextColor(gold[0], gold[1], gold[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(formatCurrency(piece.price), pageWidth - margin - 5, y + 18, {align: 'right'});
    doc.setFontSize(8);
    doc.text('Valor estimado da peça', pageWidth - margin - 5, y + 25, {align: 'right'});

    y += 55;
  });

  if (y > 248) {
    doc.addPage();
    doc.setFillColor(sand[0], sand[1], sand[2]);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    y = 22;
  }

  doc.setFillColor(gold[0], gold[1], gold[2]);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 6, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Investimento total', margin + 6, y + 8);
  doc.setFontSize(18);
  doc.text(formatCurrency(data.totalPrice), pageWidth - margin - 6, y + 14, {align: 'right'});

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(`${settings.companyName || "D'Coratto Sob Medida"} • ${safeText(settings.phone)} • ${safeText(settings.email)}`, margin, 287);

  doc.save(`Orcamento_Rapido_${safeText(data.clientName).replace(/\s+/g, '_')}.pdf`);
};
