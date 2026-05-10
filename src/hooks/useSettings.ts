import {useEffect, useState} from 'react';
import {doc, onSnapshot} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {Settings} from '../types';

export const DEFAULT_SETTINGS: Settings = {
  companyName: "D'Coratto Sob Medida",
  phone: '(00) 00000-0000',
  email: 'contato@dcoratto.com.br',
  address: 'Endereço da Marmoraria',
  defaultValidity: 15,
  defaultNotes: 'Orçamento sujeito a confirmação de medidas no local.',
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
  paymentMethods: [
    {name: 'À vista (Dinheiro/Pix)', adjustment: -5},
    {name: 'Cartão de Débito', adjustment: 0},
    {name: 'Cartão de Crédito 1x', adjustment: 3},
    {name: 'Parcelado 10x', adjustment: 15},
  ],
  sculptedSinkRates: {
    simple: 800,
    ramp: 1200,
    hiddenValve: 1500,
    extraSink: 400,
    riskPercentage: 10,
  },
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
          cutoutPrices: {
            ...DEFAULT_SETTINGS.cutoutPrices,
            ...(data.cutoutPrices || {}),
          },
          paymentMethods: data.paymentMethods?.length ? data.paymentMethods : DEFAULT_SETTINGS.paymentMethods,
          sculptedSinkRates: {
            ...DEFAULT_SETTINGS.sculptedSinkRates,
            ...(data.sculptedSinkRates || {}),
          },
        } as Settings);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return {settings, loading};
};
