import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { useAuth } from '../contexts/AuthContext';
import { Save, Plus, Trash2, Building, Phone, Mail, MapPin, Calculator, CreditCard, Scissors } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export const SettingsPage: React.FC = () => {
  const { settings: currentSettings, loading } = useSettings();
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

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
            success ? "bg-green-600 text-white shadow-green-200" : "bg-brand-primary text-white shadow-brand-primary/20"
          )}
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-5 h-5" />
              {success ? 'Salvo!' : 'Salvar Alterações'}
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
      </div>
    </div>
  );
};
