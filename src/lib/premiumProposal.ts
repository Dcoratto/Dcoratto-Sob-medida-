import {format} from 'date-fns';
import {ptBR} from 'date-fns/locale';
import {getPieceMajorMinorSides} from './pieceDimensions';
import {formatCentimeters} from './utils';
import {
  Material,
  PremiumPresentationMaterial,
  PremiumPresentationOverrides,
  PremiumPresentationSnapshot,
  Quote,
  QuotePiece,
  Settings,
} from '../types';

export type {PremiumPresentationOverrides, PremiumPresentationSnapshot} from '../types';

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const safeText = (value?: string) => value?.trim() || '';

const resolveMaterialName = (piece: QuotePiece, fallbackMaterial?: Material | null) =>
  safeText(piece.materialLine || piece.materialType || fallbackMaterial?.name || piece.materialId || 'Material');

const resolveMaterialCategory = (piece: QuotePiece, fallbackMaterial?: Material | null) =>
  safeText([fallbackMaterial?.category, fallbackMaterial?.provider, piece.texture].filter(Boolean).join(' · '));

export const formatPieceDimensions = (piece: QuotePiece) => {
  const dimensions = getPieceMajorMinorSides(piece);
  if (!dimensions.major) return 'Medidas não informadas';
  return `${formatCentimeters(dimensions.major)} x ${formatCentimeters(dimensions.minor)}`;
};

export const resolvePieceImageUrl = (piece: QuotePiece, overrideUrl?: string, fallbackMaterial?: Material | null) =>
  safeText(overrideUrl || piece.proposalImageUrl || piece.previewUrl || fallbackMaterial?.imageUrl || '');

export const buildPremiumPresentationSnapshot = ({
  quote,
  settings,
  materials,
  imageOverrides = {},
  publishedAt = new Date(),
}: {
  quote: Quote;
  settings: Settings;
  materials: Material[];
  imageOverrides?: PremiumPresentationOverrides;
  publishedAt?: Date;
}): PremiumPresentationSnapshot => {
  const selectedMaterial = materials.find((material) => material.id === quote.materialId) || null;
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const groupByMaterial = new Map<string, PremiumPresentationMaterial>();
  const pieces = (quote.pieces || []).map((piece) => {
    const fallbackMaterial = materialById.get(piece.materialId) || selectedMaterial;
    const pieceImageUrl = resolvePieceImageUrl(piece, imageOverrides[piece.id], fallbackMaterial);
    const materialImageUrl = safeText(fallbackMaterial?.imageUrl || '');
    const materialName = resolveMaterialName(piece, fallbackMaterial);
    const materialCategory = resolveMaterialCategory(piece, fallbackMaterial);

    const groupKey = piece.materialId || selectedMaterial?.id || piece.id;
    if (!groupByMaterial.has(groupKey)) {
      groupByMaterial.set(groupKey, {
        key: groupKey,
        name: materialName,
        category: materialCategory || 'Material selecionado',
        imageUrl: materialImageUrl || pieceImageUrl || undefined,
        pieces: [],
      });
    }

    const group = groupByMaterial.get(groupKey);
    if (group) {
      group.pieces.push(piece.name);
      if (!group.imageUrl && (materialImageUrl || pieceImageUrl)) {
        group.imageUrl = materialImageUrl || pieceImageUrl || undefined;
      }
    }

    return {
      id: piece.id,
      name: piece.name,
      dimensions: formatPieceDimensions(piece),
      area: Number(piece.totalArea || piece.manualArea || piece.area || 0),
      materialName,
      materialCategory,
      materialImageUrl: materialImageUrl || undefined,
      pieceImageUrl: pieceImageUrl || undefined,
      notes: safeText(piece.notes) || undefined,
    };
  });

  const validityDate = toDate(quote.validityDate);
  const deliveryDate = toDate(quote.deliveryDate);
  const generatedAt = publishedAt.toISOString();

  return {
    version: 1,
    quoteId: quote.id,
    companyName: safeText(settings.companyName) || 'D Coratto Sob Medida',
    companyLogoUrl: safeText(settings.logoUrl) || undefined,
    companyPhone: safeText(settings.phone) || undefined,
    companyEmail: safeText(settings.email) || undefined,
    companyAddress: safeText(settings.address) || undefined,
    clientName: safeText(quote.clientName) || 'Cliente',
    clientPhone: safeText(quote.phone) || undefined,
    clientAddress: safeText(quote.address) || undefined,
    environment: safeText(quote.environment) || undefined,
    responsible: safeText(quote.responsibleUserName || quote.responsible) || undefined,
    validityDate: validityDate ? format(validityDate, 'dd/MM/yyyy', {locale: ptBR}) : undefined,
    deliveryDays: quote.deliveryDays || 0,
    deliveryDate: deliveryDate ? format(deliveryDate, 'dd/MM/yyyy', {locale: ptBR}) : undefined,
    paymentMethod: safeText(quote.paymentMethod) || undefined,
    commercialNotes: safeText(quote.commercialNotes) || undefined,
    totalPrice: Number(quote.totalPrice || 0),
    generatedAt,
    publishedAt: generatedAt,
    pieces,
    materials: Array.from(groupByMaterial.values()),
  };
};
