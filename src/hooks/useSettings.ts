import {useEffect, useState} from 'react';
import {doc, onSnapshot} from '../lib/firestore';
import {db} from '../lib/firestore';
import {repairText} from '../lib/utils';
import {Settings, SupplierContact} from '../types';

const normalizeSupplier = (supplier: string | SupplierContact): SupplierContact =>
  typeof supplier === 'string'
    ? {id: repairText(supplier), name: repairText(supplier)}
    : {
      id: repairText(supplier.id || supplier.name || ''),
      name: repairText(supplier.name || ''),
      whatsapp: repairText(supplier.whatsapp || ''),
      contactName: repairText(supplier.contactName || ''),
      city: repairText(supplier.city || ''),
      notes: repairText(supplier.notes || ''),
    };

const sanitizeList = (values: string[] | undefined, fallback: string[]) => {
  const sanitized = (values || []).map((item) => repairText(item).trim()).filter(Boolean);
  return sanitized.length ? Array.from(new Set(sanitized)) : fallback;
};

const DEFAULT_PAYMENT_METHODS = [
  {name: 'À vista (Dinheiro/Pix)', adjustment: -5},
  {name: 'Cartão de Débito', adjustment: 0},
  {name: 'CRÉDITO 1X', adjustment: 2.5},
  {name: 'CRÉDITO 2X', adjustment: 3.75},
  {name: 'CRÉDITO 3X', adjustment: 5},
  {name: 'CRÉDITO 4X', adjustment: 6.3},
  {name: 'CRÉDITO 5X', adjustment: 7.6},
  {name: 'CRÉDITO 6X', adjustment: 8.9},
  {name: 'CRÉDITO 7X', adjustment: 10.2},
  {name: 'CRÉDITO 8X', adjustment: 11.5},
  {name: 'CRÉDITO 9X', adjustment: 12.9},
  {name: 'CRÉDITO 10X', adjustment: 14.2},
  {name: 'CRÉDITO 11X', adjustment: 15.6},
  {name: 'CRÉDITO 12X', adjustment: 17},
];

const LEGACY_PAYMENT_METHODS = [
  {name: 'À vista (Dinheiro/Pix)', adjustment: -5},
  {name: 'Cartão de Débito', adjustment: 0},
  {name: 'Cartão de Crédito 1x', adjustment: 3},
  {name: 'Parcelado 10x', adjustment: 15},
];

const normalizePaymentMethods = (methods: {name: string; adjustment: number}[] | undefined) =>
  (methods || [])
    .map((method) => ({
      name: repairText(method.name || '').trim(),
      adjustment: Number(method.adjustment) || 0,
    }))
    .filter((method) => method.name);

const samePaymentMethods = (first: {name: string; adjustment: number}[], second: {name: string; adjustment: number}[]) =>
  first.length === second.length
  && first.every((method, index) => (
    method.name === second[index]?.name
    && Number(method.adjustment) === Number(second[index]?.adjustment)
  ));

export const DEFAULT_SETTINGS: Settings = {
  companyName: "D'Coratto Sob Medida",
  phone: '(00) 00000-0000',
  email: 'contato@dcoratto.com.br',
  address: 'Endereço da marmoraria',
  defaultValidity: 15,
  defaultNotes: 'Orçamento sujeito à confirmação de medidas no local.',
  laborRatePerLinearMeter: 120,
  defaultFrontonHeight: 10,
  defaultSkirtHeight: 4,
  defaultTurnHeight: 2,
  cutoutPrices: {
    cooktop: 150,
    sinkUnder: 100,
    sinkOver: 80,
    faucetHole: 30,
    trashBinCutout: 60,
    popUpTowerCutout: 45,
    wetAreaAmericanRecess: 120,
    wetAreaItalianRecess: 160,
    sinkSculpted: false,
    sinkSculptedPrice: 800,
  },
  paymentMethods: DEFAULT_PAYMENT_METHODS,
  sculptedSinkRates: {
    simple: 800,
    ramp: 1200,
    hiddenValve: 1500,
    extraSink: 400,
    riskPercentage: 10,
  },
  materialCatalog: {
    materialCategories: ['Granito', 'Mármore', 'Quartzito', 'Quartzo', 'Lâmina Ultracompacta', 'Porcelanato', 'Superfície Sinterizada'],
    materialLines: ['Nacional', 'Importado', 'Premium', 'Super Premium'],
    materialTypes: ['Chapa', 'Lâmina'],
    naturalThicknesses: ['2cm'],
    slabThicknesses: ['6mm', '12mm'],
    textures: ['Polido', 'Escovado', 'Acetinado', 'Flameado', 'Fosco', 'Levigado'],
    suppliers: [],
  },
  patioLayout: {},
  patioSize: {width: 100, height: 100},
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<Settings>;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...data,
          companyName: repairText(data.companyName || DEFAULT_SETTINGS.companyName),
          phone: repairText(data.phone || DEFAULT_SETTINGS.phone),
          email: repairText(data.email || DEFAULT_SETTINGS.email),
          address: repairText(data.address || DEFAULT_SETTINGS.address),
          defaultNotes: repairText(data.defaultNotes || DEFAULT_SETTINGS.defaultNotes),
          cutoutPrices: {
            ...DEFAULT_SETTINGS.cutoutPrices,
            ...(data.cutoutPrices || {}),
          },
          paymentMethods: (() => {
            const sanitizedPaymentMethods = normalizePaymentMethods(data.paymentMethods);
            return !sanitizedPaymentMethods.length || samePaymentMethods(sanitizedPaymentMethods, LEGACY_PAYMENT_METHODS)
              ? DEFAULT_SETTINGS.paymentMethods
              : sanitizedPaymentMethods;
          })(),
          sculptedSinkRates: {
            ...DEFAULT_SETTINGS.sculptedSinkRates,
            ...(data.sculptedSinkRates || {}),
          },
          materialCatalog: {
            ...DEFAULT_SETTINGS.materialCatalog,
            ...(data.materialCatalog || {}),
            materialCategories: sanitizeList(data.materialCatalog?.materialCategories, DEFAULT_SETTINGS.materialCatalog.materialCategories),
            materialLines: sanitizeList(data.materialCatalog?.materialLines, DEFAULT_SETTINGS.materialCatalog.materialLines),
            materialTypes: sanitizeList(data.materialCatalog?.materialTypes, DEFAULT_SETTINGS.materialCatalog.materialTypes),
            naturalThicknesses: sanitizeList(data.materialCatalog?.naturalThicknesses, DEFAULT_SETTINGS.materialCatalog.naturalThicknesses),
            slabThicknesses: sanitizeList(data.materialCatalog?.slabThicknesses, DEFAULT_SETTINGS.materialCatalog.slabThicknesses),
            textures: sanitizeList(data.materialCatalog?.textures, DEFAULT_SETTINGS.materialCatalog.textures),
            suppliers: (data.materialCatalog?.suppliers || DEFAULT_SETTINGS.materialCatalog.suppliers).map(normalizeSupplier).filter((supplier) => supplier.name),
          },
          patioLayout: data.patioLayout || DEFAULT_SETTINGS.patioLayout,
          patioSize: {
            ...DEFAULT_SETTINGS.patioSize,
            ...(data.patioSize || {}),
          },
        } as Settings);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return {settings, loading};
};

