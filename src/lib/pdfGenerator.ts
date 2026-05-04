import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quote, Settings } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const generateQuotePDF = (quote: Quote, settings: Settings) => {
  const doc = new jsPDF();
  const primaryColor = [140, 106, 72]; // #8C6A48

  // Header
  // doc.addImage(settings.logoUrl, 'PNG', 10, 10, 30, 30); // If logo available
  doc.setFontSize(22);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(settings.companyName.toUpperCase(), 15, 25);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(settings.address, 15, 32);
  doc.text(`${settings.phone} | ${settings.email}`, 15, 37);

  doc.setDrawColor(240, 240, 240);
  doc.line(15, 45, 195, 45);

  // Client Info
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('DADOS DO CLIENTE', 15, 55);
  
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Cliente: ${quote.clientName}`, 15, 62);
  doc.text(`Telefone: ${quote.phone}`, 15, 67);
  doc.text(`Endereço: ${quote.address}`, 15, 72);
  doc.text(`Ambiente: ${quote.environment}`, 15, 77);

  // Quote Info
  doc.text(`Data: ${format(quote.createdAt?.toDate ? quote.createdAt.toDate() : new Date(), 'dd/MM/yyyy')}`, 140, 62);
  doc.text(`Validade: ${format(quote.validityDate?.toDate ? quote.validityDate.toDate() : new Date(), 'dd/MM/yyyy')}`, 140, 67);
  doc.text(`Responsável: ${quote.responsible}`, 140, 72);

  // Pieces Table
  autoTable(doc, {
    startY: 85,
    head: [['ITEM', 'PEÇA', 'DIMENSÕES', 'OBSERVAÇÕES']],
    body: quote.pieces.map((p, i) => {
      let name = p.name;
      if (p.sculptedSink?.active) {
        name += `\n(Pia Esculpida ${p.sculptedSink.type})`;
      }
      return [
        i + 1,
        name,
        `${p.length} x ${p.width} cm`,
        p.notes || '-'
      ];
    }),
    headStyles: { fillColor: primaryColor as any, textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    alternateRowStyles: { fillColor: [250, 250, 250] }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Totals Area
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('RESUMO E CONDIÇÕES', 15, finalY);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Prazo de entrega: ${quote.deliveryDays} dias úteis`, 15, finalY + 8);
  doc.text(`Condição de pagamento: ${quote.paymentMethod}`, 15, finalY + 13);
  
  if (quote.cutouts.cooktop > 0) doc.text(`Cooktop: ${quote.cutouts.cooktop} un`, 15, finalY + 18);
  if (quote.cutouts.sinkUnder > 0 || quote.cutouts.sinkOver > 0) doc.text(`Cubas: ${quote.cutouts.sinkUnder + quote.cutouts.sinkOver} un`, 15, finalY + 23);
  if (quote.cutouts.sinkSculpted) doc.text(`Pia Esculpida inclusa`, 15, finalY + 28);

  // Final Total
  doc.setFontSize(16);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`VALOR TOTAL: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.totalPrice)}`, 140, finalY + 15);

  // Commercial Notes
  if (quote.commercialNotes) {
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    const splitNotes = doc.splitTextToSize(`Obs: ${quote.commercialNotes}`, 180);
    doc.text(splitNotes, 15, finalY + 45);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(200, 200, 200);
  doc.text('D’Coratto Sob Medida - Especialistas em Mármores e Granitos', 105, 285, { align: 'center' });

  doc.save(`Orcamento_${quote.clientName.replace(/\s+/g, '_')}.pdf`);
};
