import React, { useState, useEffect } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { useAuth } from '../contexts/AuthContext';
import { Save, Plus, Trash2, Building, Phone, Mail, MapPin, Calculator, CreditCard, Scissors, Pencil } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { CondominiumRule, SupplierContact } from '../types';

export const SettingsPage: React.FC = () => {
  const { settings: currentSettings, loading } = useSettings();
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierFeedback, setSupplierFeedback] = useState('');
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [editingCondominium, setEditingCondominium] = useState<CondominiumRule | null>(null);
  const [condoName, setCondoName] = useState('');
  const [condoCity, setCondoCity] = useState('');
  const [condoAddressMode, setCondoAddressMode] = useState<CondominiumRule['addressMode']>('street');
  const [workStartHour, setWorkStartHour] = useState('08:00');
  const [workEndHour, setWorkEndHour] = useState('17:00');
  const [allowedWeekdays, setAllowedWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [blockNationalHolidays, setBlockNationalHolidays] = useState(true);
  const [blockCityHolidays, setBlockCityHolidays] = useState(true);
  const [condoNotes, setCondoNotes] = useState('');
  type MaterialCatalogListField = Exclude<keyof typeof settings.materialCatalog, 'suppliers'>;

  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'condominiums'), orderBy('name', 'asc')), (snapshot) => {
      setCondominiums(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as CondominiumRule)));
    });
    return unsubscribe;
  }, []);

  const buildPersistedSettings = () => {
    const sanitizedPaymentMethods = settings.paymentMethods
      .map((method) => ({name: method.name.trim(), adjustment: Number(method.adjustment) || 0}))
      .filter((method) => method.name);
    const sanitizedSuppliers = settings.materialCatalog.suppliers
      .map((supplier) => ({
        name: supplier.name.trim(),
        whatsapp: supplier.whatsapp?.trim() || '',
        contactName: supplier.contactName?.trim() || '',
        city: supplier.city?.trim() || '',
        notes: supplier.notes?.trim() || '',
      }))
      .filter((supplier) => supplier.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ...settings,
      paymentMethods: sanitizedPaymentMethods.length ? sanitizedPaymentMethods : DEFAULT_SETTINGS.paymentMethods,
      materialCatalog: {
        ...settings.materialCatalog,
        suppliers: sanitizedSuppliers,
      },
    };
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const nextSettings = buildPersistedSettings();
      await setDoc(doc(db, 'settings', 'global'), nextSettings);
      setSettings(nextSettings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addPaymentMethod = () => {
    setSettings({
      ...settings,
      paymentMethods: [...settings.paymentMethods, { name: '', adjustment: 0 }]
    });
  };

  const removePaymentMethod = (index: number) => {
    const newMethods = [...settings.paymentMethods];
    newMethods.splice(index, 1);
    setSettings({ ...settings, paymentMethods: newMethods });
  };

  const addSupplier = async (supplier: SupplierContact) => {
    const normalizedName = supplier.name.trim();
    if (!normalizedName || !isAdmin || supplierSaving) return false;
    const nextSupplier = {
      name: normalizedName,
      whatsapp: supplier.whatsapp?.trim() || '',
      contactName: supplier.contactName?.trim() || '',
      city: supplier.city?.trim() || '',
      notes: supplier.notes?.trim() || '',
    };

    const nextSettings = {
      ...settings,
      materialCatalog: {
        ...settings.materialCatalog,
        suppliers: [
          ...settings.materialCatalog.suppliers.filter((item) => item.name !== normalizedName),
          nextSupplier,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      },
    };

    setSupplierSaving(true);
    setSupplierFeedback('');
    try {
      await setDoc(doc(db, 'settings', 'global'), nextSettings, {merge: true});
      setSettings(nextSettings);
      setSupplierFeedback('Fornecedor salvo com sucesso.');
      setTimeout(() => setSupplierFeedback(''), 3000);
      return true;
    } catch (err) {
      console.error(err);
      setSupplierFeedback('Nao foi possivel salvar o fornecedor.');
      return false;
    } finally {
      setSupplierSaving(false);
    }
  };

  const removeSupplier = async (name: string) => {
    if (!isAdmin || supplierSaving) return;
    const nextSettings = {
      ...settings,
      materialCatalog: {
        ...settings.materialCatalog,
        suppliers: settings.materialCatalog.suppliers.filter((supplier) => supplier.name !== name),
      },
    };

    setSupplierSaving(true);
    setSupplierFeedback('');
    try {
      await setDoc(doc(db, 'settings', 'global'), nextSettings, {merge: true});
      setSettings(nextSettings);
      setSupplierFeedback('Fornecedor removido com sucesso.');
      setTimeout(() => setSupplierFeedback(''), 3000);
    } catch (err) {
      console.error(err);
      setSupplierFeedback('Nao foi possivel remover o fornecedor.');
    } finally {
      setSupplierSaving(false);
    }
  };

  const updateMaterialCatalogList = (
    field: MaterialCatalogListField,
    updater: (current: string[]) => string[],
  ) => {
    setSettings({
      ...settings,
      materialCatalog: {
        ...settings.materialCatalog,
        [field]: updater(settings.materialCatalog[field] || []),
      },
    });
  };

  const addMaterialCatalogValue = (field: MaterialCatalogListField, value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    updateMaterialCatalogList(field, (current) => current.includes(normalized) ? current : [...current, normalized]);
  };

  const removeMaterialCatalogValue = (field: MaterialCatalogListField, value: string) => {
    updateMaterialCatalogList(field, (current) => current.filter((item) => item !== value));
  };

  const resetCondoForm = () => {
    setEditingCondominium(null);
    setCondoName('');
    setCondoCity('');
    setCondoAddressMode('street');
    setWorkStartHour('08:00');
    setWorkEndHour('17:00');
    setAllowedWeekdays([0, 1, 2, 3, 4]);
    setBlockNationalHolidays(true);
    setBlockCityHolidays(true);
    setCondoNotes('');
  };

  const saveCondominium = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: condoName.trim(),
      city: condoCity.trim(),
      addressMode: condoAddressMode || 'street',
      allowedWeekdays,
      workStartHour,
      workEndHour,
      blockNationalHolidays,
      blockCityHolidays,
      notes: condoNotes.trim(),
    };
    if (editingCondominium) {
      await updateDoc(doc(db, 'condominiums', editingCondominium.id), data);
    } else {
      await addDoc(collection(db, 'condominiums'), data);
    }
    resetCondoForm();
  };

  const removeCondominium = async (id: string) => {
    const confirmed = window.confirm('Excluir este condominio?');
    if (!confirmed) return;
    await deleteDoc(doc(db, 'condominiums', id));
    if (editingCondominium?.id === id) resetCondoForm();
  };

  const toggleWeekday = (weekday: number) => {
    setAllowedWeekdays((current) => (
      current.includes(weekday) ?current.filter((item) => item !== weekday) : [...current, weekday].sort((a, b) => a - b)
    ));
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="w-full space-y-6 pb-4">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Configuracoes</h1>
          <p className="text-slate-500 mt-1">Gerencie os dados da empresa e valores padrao do sistema.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !isAdmin}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold transition-all shadow-lg active:scale-95 disabled:opacity-50",
            success ?"bg-green-600 text-white shadow-green-200" : "bg-brand-primary text-white shadow-brand-primary/20"
          )}
        >
          {saving ?(
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-5 h-5" />
              {success ?'Salvo!' : 'Salvar Alteracoes'}
            </>
          )}
        </button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 text-sm">
        {/* Empresa */}
        <section className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
              <Building className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-lg text-slate-800">Dados da Empresa</h2>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium">Nome da Marmoraria</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium">Telefone</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium">E-mail</label>
                <input
                  type="email"
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium">Endereco</label>
              <textarea
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[80px]"
              />
            </div>
          </div>
        </section>

        {/* Padroes Financeiros e Medidas */}
        <section className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm space-y-6 xl:col-span-2">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
              <Calculator className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-lg text-slate-800">Valores e Medidas</h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium">Mao de obra (m linear)</label>
                <input
                  type="number"
                  value={settings.laborRatePerLinearMeter}
                  onChange={(e) => setSettings({ ...settings, laborRatePerLinearMeter: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium">Validade Padrao (dias)</label>
                <input
                  type="number"
                  value={settings.defaultValidity}
                  onChange={(e) => setSettings({ ...settings, defaultValidity: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Altura Frontao</label>
                <input
                  type="number"
                  value={settings.defaultFrontonHeight}
                  onChange={(e) => setSettings({ ...settings, defaultFrontonHeight: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Altura Saia</label>
                <input
                  type="number"
                  value={settings.defaultSkirtHeight}
                  onChange={(e) => setSettings({ ...settings, defaultSkirtHeight: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Altura Virada</label>
                <input
                  type="number"
                  value={settings.defaultTurnHeight}
                  onChange={(e) => setSettings({ ...settings, defaultTurnHeight: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-semibold"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-50 space-y-3">
              <h3 className="font-bold text-slate-700">Valores de Recortes</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Cooktop</span>
                  <input
                    type="number"
                    value={settings.cutoutPrices.cooktop}
                    onChange={(e) => setSettings({ ...settings, cutoutPrices: { ...settings.cutoutPrices, cooktop: Number(e.target.value) } })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Cuba Embutir</span>
                  <input
                    type="number"
                    value={settings.cutoutPrices.sinkUnder}
                    onChange={(e) => setSettings({ ...settings, cutoutPrices: { ...settings.cutoutPrices, sinkUnder: Number(e.target.value) } })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Cuba Sobrepor</span>
                  <input
                    type="number"
                    value={settings.cutoutPrices.sinkOver}
                    onChange={(e) => setSettings({ ...settings, cutoutPrices: { ...settings.cutoutPrices, sinkOver: Number(e.target.value) } })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Furacao Torneira</span>
                  <input
                    type="number"
                    value={settings.cutoutPrices.faucetHole || 0}
                    onChange={(e) => setSettings({ ...settings, cutoutPrices: { ...settings.cutoutPrices, faucetHole: Number(e.target.value) } })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Lixeira Embutir</span>
                  <input
                    type="number"
                    value={settings.cutoutPrices.trashBinCutout || 0}
                    onChange={(e) => setSettings({ ...settings, cutoutPrices: { ...settings.cutoutPrices, trashBinCutout: Number(e.target.value) } })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Torre de Tomada</span>
                  <input
                    type="number"
                    value={settings.cutoutPrices.popUpTowerCutout || 0}
                    onChange={(e) => setSettings({ ...settings, cutoutPrices: { ...settings.cutoutPrices, popUpTowerCutout: Number(e.target.value) } })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Rebaixo Americano</span>
                  <input
                    type="number"
                    value={settings.cutoutPrices.wetAreaAmericanRecess || 0}
                    onChange={(e) => setSettings({ ...settings, cutoutPrices: { ...settings.cutoutPrices, wetAreaAmericanRecess: Number(e.target.value) } })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase">Rebaixo Italiano</span>
                  <input
                    type="number"
                    value={settings.cutoutPrices.wetAreaItalianRecess || 0}
                    onChange={(e) => setSettings({ ...settings, cutoutPrices: { ...settings.cutoutPrices, wetAreaItalianRecess: Number(e.target.value) } })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:bg-white transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mao de obra Pia Esculpida */}
        <section className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
              <Scissors className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-lg text-slate-800">Mao de Obra Pia Esculpida</h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-xs">Pia Simples (R$)</label>
                <input
                  type="number"
                  value={settings.sculptedSinkRates?.simple || 0}
                  onChange={(e) => setSettings({ ...settings, sculptedSinkRates: { ...settings.sculptedSinkRates, simple: Number(e.target.value) } })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-xs">Com Rampa (R$)</label>
                <input
                  type="number"
                  value={settings.sculptedSinkRates?.ramp || 0}
                  onChange={(e) => setSettings({ ...settings, sculptedSinkRates: { ...settings.sculptedSinkRates, ramp: Number(e.target.value) } })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-xs">Valvula Oculta (R$)</label>
                <input
                  type="number"
                  value={settings.sculptedSinkRates?.hiddenValve || 0}
                  onChange={(e) => setSettings({ ...settings, sculptedSinkRates: { ...settings.sculptedSinkRates, hiddenValve: Number(e.target.value) } })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium text-xs">Cuba Extra (R$)</label>
                <input
                  type="number"
                  value={settings.sculptedSinkRates?.extraSink || 0}
                  onChange={(e) => setSettings({ ...settings, sculptedSinkRates: { ...settings.sculptedSinkRates, extraSink: Number(e.target.value) } })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium text-xs">Risco/Perda (%)</label>
              <input
                type="number"
                value={settings.sculptedSinkRates?.riskPercentage || 0}
                onChange={(e) => setSettings({ ...settings, sculptedSinkRates: { ...settings.sculptedSinkRates, riskPercentage: Number(e.target.value) } })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
              />
            </div>
          </div>
        </section>

        {/* Formas de Pagamento */}
        <section className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm space-y-6 xl:col-span-2">
          <div className="flex items-center justify-between pb-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                <CreditCard className="w-5 h-5" />
              </div>
              <h2 className="font-display font-bold text-lg text-slate-800">Formas de Pagamento</h2>
            </div>
            <button
              onClick={addPaymentMethod}
              className="flex items-center gap-2 text-brand-primary font-bold hover:underline"
            >
              <Plus className="w-5 h-5" />
              Adicionar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {settings.paymentMethods.map((method, idx) => (
              <div key={idx} className="flex gap-4 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Descricao</label>
                  <input
                    type="text"
                    value={method.name}
                    onChange={(e) => {
                      const newMethods = [...settings.paymentMethods];
                      newMethods[idx].name = e.target.value;
                      setSettings({ ...settings, paymentMethods: newMethods });
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all"
                  />
                </div>
                <div className="w-32 space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Ajuste (%)</label>
                  <input
                    type="number"
                    value={method.adjustment}
                    onChange={(e) => {
                      const newMethods = [...settings.paymentMethods];
                      newMethods[idx].adjustment = Number(e.target.value);
                      setSettings({ ...settings, paymentMethods: newMethods });
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-mono"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Remover forma de pagamento"
                  title="Remover forma de pagamento"
                  onClick={() => removePaymentMethod(idx)}
                  className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm space-y-6 xl:col-span-3">
          <div className="flex items-center justify-between pb-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-slate-800">Catalogo de chapas</h2>
                <p className="text-sm text-slate-400">Essas opcoes aparecem na compra e na adicao de chapas no estoque.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[
              ['materialCategories', 'Categoria', 'Ex: Granito'],
              ['materialLines', 'Linha do material', 'Ex: Premium'],
              ['materialTypes', 'Tipo do material', 'Ex: Chapa'],
              ['naturalThicknesses', 'Espessuras naturais', 'Ex: 2cm'],
              ['slabThicknesses', 'Espessuras de laminas', 'Ex: 12mm'],
              ['textures', 'Texturas', 'Ex: Escovado'],
            ].map(([field, label, placeholder]) => (
              <MaterialCatalogField
                key={field}
                label={label}
                placeholder={placeholder}
                values={settings.materialCatalog[field as MaterialCatalogListField] as string[]}
                onAdd={(value) => addMaterialCatalogValue(field as MaterialCatalogListField, value)}
                onRemove={(value) => removeMaterialCatalogValue(field as MaterialCatalogListField, value)}
              />
            ))}
          </div>

          <SupplierCatalogField
            suppliers={settings.materialCatalog.suppliers}
            onAdd={addSupplier}
            onRemove={removeSupplier}
            saving={supplierSaving}
            feedback={supplierFeedback}
          />
        </section>

        <section className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm space-y-6 xl:col-span-3">
          <div className="flex items-center justify-between pb-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                <Building className="w-5 h-5" />
              </div>
              <h2 className="font-display font-bold text-lg text-slate-800">Condominios e regras</h2>
            </div>
          </div>

          <form onSubmit={saveCondominium} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Nome do condominio</label>
              <input value={condoName} onChange={(e) => setCondoName(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Cidade</label>
              <input value={condoCity} onChange={(e) => setCondoCity(e.target.value)} required placeholder="Ex: Aruja" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Tipo de endereco do condominio</label>
              <select
                value={condoAddressMode || 'street'}
                onChange={(e) => setCondoAddressMode(e.target.value as CondominiumRule['addressMode'])}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <option value="street">Rua e numero</option>
                <option value="lot">Quadra e lote</option>
              </select>
              <p className="text-xs text-slate-400">Essa escolha define quais campos aparecem ao vincular o condominio no cadastro do cliente.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Inicio do trabalho</label>
              <input type="time" value={workStartHour} onChange={(e) => setWorkStartHour(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Fim do trabalho</label>
              <input type="time" value={workEndHour} onChange={(e) => setWorkEndHour(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-slate-500 font-medium text-sm">Dias permitidos</label>
              <div className="flex flex-wrap gap-2">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeekday(index)}
                    className={cn('px-3 py-2 rounded-xl text-xs font-bold', allowedWeekdays.includes(index) ?'bg-brand-primary text-white' : 'bg-slate-100 text-slate-500')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input type="checkbox" checked={blockNationalHolidays} onChange={(e) => setBlockNationalHolidays(e.target.checked)} className="h-4 w-4 accent-brand-primary" />
              Bloquear feriados nacionais
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input type="checkbox" checked={blockCityHolidays} onChange={(e) => setBlockCityHolidays(e.target.checked)} className="h-4 w-4 accent-brand-primary" />
              Bloquear feriados da cidade
            </label>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Observacoes</label>
              <textarea value={condoNotes} onChange={(e) => setCondoNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 min-h-[80px]" />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <button type="submit" className="bg-brand-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                {editingCondominium ?'Atualizar condominio' : 'Cadastrar condominio'}
              </button>
              {editingCondominium && (
                <button type="button" onClick={resetCondoForm} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold">
                  Cancelar edicao
                </button>
              )}
            </div>
          </form>

          <div className="space-y-2 pt-4 border-t border-slate-50">
            {condominiums.map((condo) => (
              <div key={condo.id} className="rounded-2xl bg-slate-50 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">{condo.name}</div>
                  <div className="text-xs text-slate-500">
                    {condo.city} · {(condo.addressMode || 'street') === 'lot' ? 'Quadra e lote' : 'Rua e numero'} · {condo.workStartHour}-{condo.workEndHour} · Dias: {condo.allowedWeekdays.map((item) => ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'][item]).join(', ')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCondominium(condo);
                      setCondoName(condo.name);
                      setCondoCity(condo.city);
                      setCondoAddressMode(condo.addressMode || 'street');
                      setWorkStartHour(condo.workStartHour);
                      setWorkEndHour(condo.workEndHour);
                      setAllowedWeekdays(condo.allowedWeekdays || [0, 1, 2, 3, 4]);
                      setBlockNationalHolidays(Boolean(condo.blockNationalHolidays));
                      setBlockCityHolidays(Boolean(condo.blockCityHolidays));
                      setCondoNotes(condo.notes || '');
                    }}
                    className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600"
                  >
                    Editar
                  </button>
                  <button type="button" onClick={() => removeCondominium(condo.id)} className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-bold">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {condominiums.length === 0 && (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">Nenhum condominio cadastrado.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const MaterialCatalogField: React.FC<{
  label: string;
  placeholder: string;
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}> = ({label, placeholder, values, onAdd, onRemove}) => {
  const [draft, setDraft] = useState('');

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
      <div>
        <div className="font-bold text-slate-800">{label}</div>
        <div className="text-xs text-slate-400">Adicione, remova e reorganize conforme o uso da marmoraria.</div>
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20"
        />
        <button
          type="button"
          onClick={() => {
            onAdd(draft);
            setDraft('');
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onRemove(value)}
            className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            {value}
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ))}
        {values.length === 0 && (
          <div className="text-sm font-semibold text-slate-400">Nenhuma opcao cadastrada.</div>
        )}
      </div>
    </div>
  );
};

const SupplierCatalogField: React.FC<{
  suppliers: SupplierContact[];
  onAdd: (supplier: SupplierContact) => Promise<boolean>;
  onRemove: (name: string) => Promise<void>;
  saving: boolean;
  feedback: string;
}> = ({suppliers, onAdd, onRemove, saving, feedback}) => {
  const [draft, setDraft] = useState<SupplierContact>({
    name: '',
    whatsapp: '',
    contactName: '',
    city: '',
    notes: '',
  });
  const [editingSupplierName, setEditingSupplierName] = useState('');

  const handleAdd = async () => {
    const saved = await onAdd(draft);
    if (!saved) return;
    setDraft({name: '', whatsapp: '', contactName: '', city: '', notes: ''});
    setEditingSupplierName('');
  };

  const startEditing = (supplier: SupplierContact) => {
    setDraft({
      name: supplier.name || '',
      whatsapp: supplier.whatsapp || '',
      contactName: supplier.contactName || '',
      city: supplier.city || '',
      notes: supplier.notes || '',
    });
    setEditingSupplierName(supplier.name);
  };

  const cancelEditing = () => {
    setDraft({name: '', whatsapp: '', contactName: '', city: '', notes: ''});
    setEditingSupplierName('');
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-4 xl:col-span-2">
      <div>
        <div className="font-bold text-slate-800">Fornecedores</div>
        <div className="text-xs text-slate-400">Cadastre o nome e o WhatsApp para enviar o pedido direto do estoque.</div>
        {feedback && (
          <div className={cn(
            "mt-2 text-xs font-semibold",
            feedback.includes('sucesso') ? "text-green-600" : "text-red-600",
          )}>
            {feedback}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <input
          value={draft.name}
          onChange={(e) => setDraft({...draft, name: e.target.value})}
          placeholder="Nome do fornecedor"
          className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20"
        />
        <input
          value={draft.whatsapp}
          onChange={(e) => setDraft({...draft, whatsapp: e.target.value})}
          placeholder="WhatsApp com DDD"
          className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20"
        />
        <input
          value={draft.contactName}
          onChange={(e) => setDraft({...draft, contactName: e.target.value})}
          placeholder="Nome do contato"
          className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20"
        />
        <input
          value={draft.city}
          onChange={(e) => setDraft({...draft, city: e.target.value})}
          placeholder="Cidade"
          className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20"
        />
      </div>

      <textarea
        value={draft.notes}
        onChange={(e) => setDraft({...draft, notes: e.target.value})}
        placeholder="Observações do fornecedor"
        className="w-full min-h-[72px] bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20"
      />

      <button
        type="button"
        onClick={handleAdd}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        {saving ? 'Salvando fornecedor...' : editingSupplierName ? 'Salvar fornecedor' : 'Adicionar fornecedor'}
      </button>
      {editingSupplierName && (
        <button
          type="button"
          onClick={cancelEditing}
          disabled={saving}
          className="ml-2 inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancelar edição
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {suppliers.map((supplier) => (
          <div key={supplier.name} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-slate-800">{supplier.name}</div>
                {supplier.whatsapp && <div className="text-xs text-slate-500 mt-1">WhatsApp: {supplier.whatsapp}</div>}
                {supplier.contactName && <div className="text-xs text-slate-500">Contato: {supplier.contactName}</div>}
                {supplier.city && <div className="text-xs text-slate-500">Cidade: {supplier.city}</div>}
                {supplier.notes && <div className="text-xs text-slate-400 mt-2">{supplier.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEditing(supplier)}
                  disabled={saving}
                  className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary transition-all hover:bg-brand-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Editar fornecedor"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(supplier.name)}
                  disabled={saving}
                  className="rounded-xl bg-red-50 p-2 text-red-600 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Excluir fornecedor"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="text-sm font-semibold text-slate-400">Nenhum fornecedor cadastrado.</div>
        )}
      </div>
    </div>
  );
};


