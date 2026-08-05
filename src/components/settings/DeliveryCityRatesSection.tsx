import React, {useEffect, useMemo, useState} from 'react';
import {addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, selectFields, updateDoc} from '../../lib/firestore';
import {db} from '../../lib/firestore';
import {DeliveryRegionRate} from '../../types';
import {buildCityRateDeliveryDetails, normalizeDeliveryCity, normalizeDeliveryDistrict} from '../../lib/deliveryCityRates';
import {CurrencyInput} from '../inputs/NumericInput';
import {cn} from '../../lib/utils';
import {Building2, MapPin, Pencil, Plus, Search, Trash2, Truck} from 'lucide-react';

type Props = {
  isAdmin: boolean;
};

const emptyForm = {
  district: '',
  city: '',
  deliveryFee: 0,
  active: true,
};

export const DeliveryCityRatesSection: React.FC<Props> = ({isAdmin}) => {
  const [rates, setRates] = useState<DeliveryRegionRate[]>([]);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(query(
      collection(db, 'deliveryRegionRates'),
      selectFields('district', 'districtNormalized', 'city', 'cityNormalized', 'deliveryFee', 'active', 'createdAt', 'updatedAt'),
      orderBy('city', 'asc'),
      orderBy('district', 'asc'),
    ), (snapshot) => {
      setRates(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as DeliveryRegionRate)));
    });

    return unsubscribe;
  }, []);

  const cityOptions = useMemo(() => (
    Array.from(new Set(rates.map((rate) => rate.city).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', {sensitivity: 'base'}),
    )
  ), [rates]);

  const filteredRates = useMemo(() => {
    const normalizedSearch = normalizeDeliveryDistrict(search) || normalizeDeliveryCity(search);
    const normalizedCityFilter = normalizeDeliveryCity(cityFilter);

    return rates.filter((rate) => {
      const matchesSearch = !normalizedSearch
        || normalizeDeliveryDistrict(rate.district).includes(normalizedSearch)
        || normalizeDeliveryCity(rate.city).includes(normalizedSearch);
      const matchesCity = !normalizedCityFilter || normalizeDeliveryCity(rate.city) === normalizedCityFilter;
      return matchesSearch && matchesCity;
    });
  }, [cityFilter, rates, search]);

  const resetForm = () => {
    setEditingRateId(null);
    setForm(emptyForm);
  };

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 3000);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || saving) return;

    const district = String(form.district || '').trim().slice(0, 120);
    const city = String(form.city || '').trim().slice(0, 120);
    const districtNormalized = normalizeDeliveryDistrict(district);
    const cityNormalized = normalizeDeliveryCity(city);
    const deliveryFee = Math.max(0, Number(form.deliveryFee || 0));

    if (district.length < 2) {
      window.alert('Informe um bairro válido.');
      return;
    }
    if (city.length < 2) {
      window.alert('Informe uma cidade válida.');
      return;
    }
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      window.alert('Informe uma taxa de entrega válida.');
      return;
    }

    const duplicateRate = rates.find((rate) =>
      rate.id !== editingRateId
      && normalizeDeliveryDistrict(rate.district) === districtNormalized
      && normalizeDeliveryCity(rate.city) === cityNormalized,
    );
    if (duplicateRate) {
      window.alert('Este bairro já possui cadastro para esta cidade. Edite o registro existente.');
      setEditingRateId(duplicateRate.id);
      setForm({
        district: duplicateRate.district,
        city: duplicateRate.city,
        deliveryFee: Number(duplicateRate.deliveryFee || 0),
        active: duplicateRate.active !== false,
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        district,
        districtNormalized,
        city,
        cityNormalized,
        deliveryFee,
        active: Boolean(form.active),
      };

      if (editingRateId) {
        await updateDoc(doc(db, 'deliveryRegionRates', editingRateId), payload);
        showFeedback('Taxa de entrega atualizada.');
      } else {
        await addDoc(collection(db, 'deliveryRegionRates'), payload);
        showFeedback('Bairro e cidade adicionados com sucesso.');
      }

      resetForm();
    } catch (error) {
      console.error('Erro ao salvar taxa de entrega por bairro/cidade:', error);
      window.alert('Não foi possível salvar a taxa de entrega agora.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (rate: DeliveryRegionRate) => {
    setEditingRateId(rate.id);
    setForm({
      district: rate.district,
      city: rate.city,
      deliveryFee: Number(rate.deliveryFee || 0),
      active: rate.active !== false,
    });
  };

  const handleToggle = async (rate: DeliveryRegionRate) => {
    if (!isAdmin || saving) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'deliveryRegionRates', rate.id), {
        active: rate.active === false,
      });
      showFeedback(rate.active === false ? 'Taxa ativada.' : 'Taxa desativada.');
    } catch (error) {
      console.error('Erro ao alterar status da taxa de entrega:', error);
      window.alert('Não foi possível alterar o status agora.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rate: DeliveryRegionRate) => {
    if (!isAdmin || saving) return;
    const confirmed = window.confirm(`Excluir a taxa de entrega de ${rate.district} - ${rate.city}?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, 'deliveryRegionRates', rate.id));
      if (editingRateId === rate.id) resetForm();
      showFeedback('Taxa removida.');
    } catch (error) {
      console.error('Erro ao excluir taxa de entrega:', error);
      window.alert('Não foi possível excluir a taxa agora.');
    } finally {
      setSaving(false);
    }
  };

  const previewDetails = buildCityRateDeliveryDetails({
    district: form.district,
    city: form.city,
    fee: form.deliveryFee,
    mode: form.active ? 'region_rate' : 'disabled',
  });

  return (
    <section className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm space-y-6 xl:col-span-3">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-800">Configuração de Taxas de Entrega</h2>
            <p className="mt-1 text-xs text-slate-500">Cadastro por bairro e cidade usado automaticamente no orçamento.</p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Adicionar bairro/cidade
          </button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-800">
              {editingRateId ? 'Editar taxa' : 'Nova taxa'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Cada combinação de bairro e cidade possui um único cadastro.
            </p>
          </div>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-500">Bairro</span>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                maxLength={120}
                disabled={!isAdmin}
                value={form.district}
                onChange={(event) => setForm((current) => ({...current, district: event.target.value}))}
                placeholder="Ex: Vila Oliveira"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
              />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-500">Cidade</span>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                maxLength={120}
                disabled={!isAdmin}
                value={form.city}
                onChange={(event) => setForm((current) => ({...current, city: event.target.value}))}
                placeholder="Ex: Mogi das Cruzes"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
              />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-500">Valor da taxa</span>
            <CurrencyInput
              value={form.deliveryFee}
              disabled={!isAdmin}
              onValueChange={(value) => setForm((current) => ({...current, deliveryFee: Math.max(0, value)}))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
            />
          </label>

          <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <span className="text-sm font-medium text-slate-600">Status</span>
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => setForm((current) => ({...current, active: !current.active}))}
              className={cn(
                'inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold transition-all',
                form.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500',
              )}
            >
              {form.active ? 'Ativo' : 'Inativo'}
            </button>
          </label>

          <div className="rounded-2xl border border-slate-100 bg-white p-3 text-xs text-slate-500">
            <div className="font-semibold text-slate-700">Prévia aplicada</div>
            <div className="mt-2">Bairro: <strong>{previewDetails.district || '-'}</strong></div>
            <div>Cidade: <strong>{previewDetails.city || '-'}</strong></div>
            <div>Valor: <strong>R$ {Number(previewDetails.fee || 0).toFixed(2).replace('.', ',')}</strong></div>
          </div>

          {feedback && (
            <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              {feedback}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!isAdmin || saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {editingRateId ? 'Salvar taxa' : 'Adicionar taxa'}
            </button>
            {editingRateId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-white"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar bairro ou cidade"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
              />
            </div>
            <select
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
            >
              <option value="">Todas as cidades</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3">
            {filteredRates.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center text-sm font-medium text-slate-500">
                Nenhuma taxa de entrega cadastrada para estes filtros.
              </div>
            ) : filteredRates.map((rate) => (
              <div key={rate.id} className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-base font-semibold text-slate-900">{rate.district}</div>
                    <div className="mt-1 text-sm text-slate-500">{rate.city}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Taxa de entrega: <strong className="text-slate-700">R$ {Number(rate.deliveryFee || 0).toFixed(2).replace('.', ',')}</strong>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      'inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide',
                      rate.active === false ? 'bg-slate-200 text-slate-600' : 'bg-green-50 text-green-700',
                    )}>
                      {rate.active === false ? 'Inativo' : 'Ativo'}
                    </span>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEdit(rate)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:text-brand-primary"
                          title={`Editar ${rate.district} - ${rate.city}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(rate)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-all hover:text-brand-primary"
                        >
                          {rate.active === false ? 'Ativar' : 'Desativar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rate)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-white text-red-500 transition-all hover:bg-red-50"
                          title={`Excluir ${rate.district} - ${rate.city}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
