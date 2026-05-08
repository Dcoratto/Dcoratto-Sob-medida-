import React, { useState, useEffect } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { useAuth } from '../contexts/AuthContext';
import { Save, Plus, Trash2, Building, Phone, Mail, MapPin, Calculator, CreditCard, Scissors } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { CondominiumRule } from '../types';

export const SettingsPage: React.FC = () => {
  const { settings: currentSettings, loading } = useSettings();
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [editingCondominium, setEditingCondominium] = useState<CondominiumRule | null>(null);
  const [condoName, setCondoName] = useState('');
  const [condoCity, setCondoCity] = useState('');
  const [workStartHour, setWorkStartHour] = useState('08:00');
  const [workEndHour, setWorkEndHour] = useState('17:00');
  const [allowedWeekdays, setAllowedWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [blockNationalHolidays, setBlockNationalHolidays] = useState(true);
  const [blockCityHolidays, setBlockCityHolidays] = useState(true);
  const [condoNotes, setCondoNotes] = useState('');

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

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
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

  const resetCondoForm = () => {
    setEditingCondominium(null);
    setCondoName('');
    setCondoCity('');
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
    const confirmed = window.confirm('Excluir este condomínio?');
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
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Configurações</h1>
          <p className="text-slate-500 mt-1">Gerencie os dados da empresa e valores padrão do sistema.</p>
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
              {success ?'Salvo!' : 'Salvar Alterações'}
            </>
          )}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
        {/* Empresa */}
        <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
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
              <label className="text-slate-500 font-medium">Endereço</label>
              <textarea
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium min-h-[80px]"
              />
            </div>
          </div>
        </section>

        {/* Padrões Financeiros e Medidas */}
        <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
              <Calculator className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-lg text-slate-800">Valores e Medidas</h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium">Mão de obra (m linear)</label>
                <input
                  type="number"
                  value={settings.laborRatePerLinearMeter}
                  onChange={(e) => setSettings({ ...settings, laborRatePerLinearMeter: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-500 font-medium">Validade Padrão (dias)</label>
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
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Altura Frontão</label>
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
                  <span className="text-[10px] text-slate-400 uppercase">Furação Torneira</span>
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

        {/* Mão de obra Pia Esculpida */}
        <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
              <Scissors className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-lg text-slate-800">Mão de Obra Pia Esculpida</h2>
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
                <label className="text-slate-500 font-medium text-xs">Válvula Oculta (R$)</label>
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
        <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6 md:col-span-2">
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
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Descrição</label>
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

        <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6 md:col-span-2">
          <div className="flex items-center justify-between pb-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
                <Building className="w-5 h-5" />
              </div>
              <h2 className="font-display font-bold text-lg text-slate-800">Condomínios e regras</h2>
            </div>
          </div>

          <form onSubmit={saveCondominium} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Nome do condomínio</label>
              <input value={condoName} onChange={(e) => setCondoName(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Cidade</label>
              <input value={condoCity} onChange={(e) => setCondoCity(e.target.value)} required placeholder="Ex: Arujá" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-500 font-medium text-sm">Início do trabalho</label>
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
              <label className="text-slate-500 font-medium text-sm">Observações</label>
              <textarea value={condoNotes} onChange={(e) => setCondoNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary/20 min-h-[80px]" />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <button type="submit" className="bg-brand-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                {editingCondominium ?'Atualizar condomínio' : 'Cadastrar condomínio'}
              </button>
              {editingCondominium && (
                <button type="button" onClick={resetCondoForm} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold">
                  Cancelar edição
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
                    {condo.city} · {condo.workStartHour}-{condo.workEndHour} · Dias: {condo.allowedWeekdays.map((item) => ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'][item]).join(', ')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCondominium(condo);
                      setCondoName(condo.name);
                      setCondoCity(condo.city);
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
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">Nenhum condomínio cadastrado.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
