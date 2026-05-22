import React, {useEffect, useMemo, useState} from 'react';
import {addDoc, collection, deleteDoc, doc, onSnapshot, Timestamp, updateDoc} from '../lib/firestore';
import {AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Copy, ExternalLink, MapPin, Phone, Plus, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {Client, CondominiumRule, Quote} from '../types';
import {cn} from '../lib/utils';
import {getHolidayInfo} from '../lib/holidays';
import {useAuth} from '../contexts/AuthContext';

type EventType = 'medicao' | 'entrega' | 'manual' | 'pedido';

interface CalendarEvent {
  id: string;
  sourceId?: string;
  quoteId?: string;
  clientId?: string;
  clientName?: string;
  city?: string;
  date: Date;
  type: EventType;
  status?: string;
  condominiumId?: string;
  title?: string;
  description?: string;
  eventTime?: string;
  createdByName?: string;
  supplier?: string;
  materialName?: string;
  purchaseGroupId?: string;
}

interface ManualCalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: any;
  dateKey?: string;
  clientId?: string;
  clientName?: string;
  city?: string;
  eventTime?: string;
  createdByUid?: string;
  createdByName?: string;
  sourceType?: string;
  status?: string;
  supplier?: string;
  materialName?: string;
  purchaseGroupId?: string;
}

const altoTieteCities = ['São Paulo', 'Arujá', 'Mogi das Cruzes', 'Suzano', 'Poá', 'Itaquaquecetuba', 'Ferraz de Vasconcelos', 'Guarulhos', 'Biritiba Mirim', 'Salesópolis', 'Santa Isabel'];

const fixCorruptedText = (value: unknown) =>
  String(value || '')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã¢/g, 'â')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã´/g, 'ô')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã/g, 'Á')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‡/g, 'Ç')
    .replace(/Ã­/g, 'í')
    .replace(/Ã±/g, 'ñ')
    .replace(/Â·/g, '·')
    .replace(/Âº/g, 'º')
    .replace(/Âª/g, 'ª')
    .replace(/Â²/g, '²')
    .replace(/Â /g, ' ')
    .replace(/Â/g, '');

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const toInputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseDateKey = (value?: string) => {
  if (!value || !value.includes('-')) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const parseInputDate = (value: string) => {
  if (!value) return null;
  if (value.includes('-')) {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }
  if (value.includes('/')) {
    const [day, month, year] = value.split('/').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }
  return null;
};

const startOfMonthGrid = (date: Date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const weekday = (first.getDay() + 6) % 7;
  const output = new Date(first);
  output.setDate(first.getDate() - weekday);
  return output;
};

const eventLabel = (type: EventType) => type === 'entrega' ? 'Entrega' : type === 'medicao' ? 'Medição' : type === 'pedido' ? 'Pedido' : 'Evento';
const eventTimeLabel = (date: Date, eventTime?: string) => eventTime || date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
const calendarEventTitle = (event: CalendarEvent) => {
  if (event.type === 'manual' || event.type === 'pedido') return [fixCorruptedText(event.title || 'Evento'), fixCorruptedText(event.clientName)].filter(Boolean).join(' · ');
  return `${eventLabel(event.type)} · ${fixCorruptedText(event.clientName || event.title || 'Cliente')}`;
};
const countdownLabel = (daysLeft: number) => {
  if (daysLeft < 0) return 'Evento já ocorreu';
  if (daysLeft === 0) return 'Hoje';
  if (daysLeft === 1) return 'Falta 1 dia';
  return `Faltam ${daysLeft} dias`;
};
const clientFullAddress = (client: Client | null) => {
  if (!client) return 'Não informado';

  const locationBits = [
    fixCorruptedText(client.address),
    fixCorruptedText(client.neighborhood),
    fixCorruptedText(client.city),
    client.zipCode ? `CEP ${client.zipCode}` : '',
  ].filter(Boolean);

  const condominiumBits = [
    fixCorruptedText(client.condominiumName),
    client.tower ? `Torre ${fixCorruptedText(client.tower)}` : '',
    client.apartmentNumber ? `Apto ${fixCorruptedText(client.apartmentNumber)}` : '',
    client.block ? `Bloco ${fixCorruptedText(client.block)}` : '',
    client.lot ? `Lote ${fixCorruptedText(client.lot)}` : '',
  ].filter(Boolean);

  return [...locationBits, ...condominiumBits].join(' · ') || 'Não informado';
};

const clientAddressTypeLabel = (type?: Client['addressType']) =>
  type === 'apartamento' ? 'Apartamento' : type === 'condominio' ? 'Condomínio' : type === 'casa' ? 'Casa' : 'Não informado';
const createCalendarFeedToken = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
};

export const CalendarPage: React.FC = () => {
  const {user, profile, appUid} = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [manualEvents, setManualEvents] = useState<ManualCalendarEvent[]>([]);
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventDate, setNewEventDate] = useState(toInputDate(new Date()));
  const [newEventTime, setNewEventTime] = useState('09:00');
  const [newEventClientId, setNewEventClientId] = useState('');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [isPreparingSubscription, setIsPreparingSubscription] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');
  const [subscriptionToken, setSubscriptionToken] = useState(profile?.calendarFeedToken || '');
  const [createError, setCreateError] = useState('');
  const monthLabel = baseDate.toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});

  useEffect(() => {
    if (!selectedEvent && !showCreateModal && !showSubscribeModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedEvent, showCreateModal, showSubscribeModal]);

  const getCreateEventErrorMessage = (error: unknown) => {
    const code = String((error as {code?: string} | undefined)?.code || '');
    const message = String((error as {message?: string} | undefined)?.message || '');
    switch (code) {
      case 'permission-denied':
        return 'Sem permissão para salvar evento. Faça login novamente e confirme se o seu acesso está liberado.';
      case 'unauthenticated':
        return 'Sessão expirada. Entre novamente para salvar o evento.';
      case 'unavailable':
        return 'Sem conexão com o servidor no momento. Tente novamente em instantes.';
      default:
        return message ? `Não foi possível salvar o evento. ${message}` : 'Não foi possível salvar o evento. Tente novamente.';
    }
  };

  useEffect(() => {
    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (s) => setQuotes(s.docs.map((d) => ({id: d.id, ...d.data()} as Quote))));
    const unsubClients = onSnapshot(collection(db, 'clients'), (s) => setClients(s.docs.map((d) => ({id: d.id, ...d.data()} as Client))));
    const unsubCondominiums = onSnapshot(collection(db, 'condominiums'), (s) => setCondominiums(s.docs.map((d) => ({id: d.id, ...d.data()} as CondominiumRule))));
    const unsubManualEvents = onSnapshot(
      collection(db, 'calendarEvents'),
      (s) => setManualEvents(s.docs.map((d) => ({id: d.id, ...d.data()} as ManualCalendarEvent))),
      (error) => console.error('Erro ao carregar eventos manuais', error),
    );

    return () => {
      unsubQuotes();
      unsubClients();
      unsubCondominiums();
      unsubManualEvents();
    };
  }, []);

  useEffect(() => {
    if (profile?.calendarFeedToken) {
      setSubscriptionToken(profile.calendarFeedToken);
    }
  }, [profile?.calendarFeedToken]);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const daysLeftFromToday = (date: Date) => Math.ceil((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - today.getTime()) / 86400000);

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];

    quotes.forEach((quote) => {
      const client = clients.find((c) => c.id === quote.clientId);
      const measurementDate = toDate(quote.measurementDate);
      const deliveryDate = toDate(quote.deliveryDate);

      if (measurementDate) {
        list.push({
          id: `${quote.id}-medicao`,
          quoteId: quote.id,
          clientId: quote.clientId,
          clientName: quote.clientName,
          city: client?.city,
          date: measurementDate,
          type: 'medicao',
          status: quote.status,
          condominiumId: client?.condominiumId,
        });
      }

      if (deliveryDate) {
        list.push({
          id: `${quote.id}-entrega`,
          quoteId: quote.id,
          clientId: quote.clientId,
          clientName: quote.clientName,
          city: client?.city,
          date: deliveryDate,
          type: 'entrega',
          status: quote.status,
          condominiumId: client?.condominiumId,
        });
      }
    });

    manualEvents.forEach((manualEvent) => {
      const date = parseDateKey(manualEvent.dateKey) || toDate(manualEvent.date);
      if (!date) return;
      const isPurchaseDelivery = manualEvent.sourceType === 'purchase-delivery';
      list.push({
        id: `manual-${manualEvent.id}`,
        sourceId: manualEvent.id,
        date,
        type: isPurchaseDelivery ? 'pedido' : 'manual',
        title: manualEvent.title,
        description: manualEvent.description,
        clientId: manualEvent.clientId,
        clientName: manualEvent.clientName,
        city: manualEvent.city,
        status: manualEvent.status || (isPurchaseDelivery ? 'Pedido de compra' : 'Evento manual'),
        eventTime: manualEvent.eventTime,
        createdByName: manualEvent.createdByName,
        supplier: manualEvent.supplier,
        materialName: manualEvent.materialName,
        purchaseGroupId: manualEvent.purchaseGroupId,
      });
    });

    return list;
  }, [clients, manualEvents, quotes]);

  const upcomingEvents = useMemo(() => {
    return events
      .map((event) => ({event, daysLeft: daysLeftFromToday(event.date)}))
      .filter((i) => i.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 12);
  }, [events]);

  const deadlineAlerts = useMemo(() => {
    return upcomingEvents
      .filter(({daysLeft}) => daysLeft <= 7)
      .map((item) => ({...item, level: (item.daysLeft <= 2 ? 'maximo' : 'alerta') as 'maximo' | 'alerta'}));
  }, [upcomingEvents]);

  const days = useMemo(() => {
    const start = startOfMonthGrid(baseDate);
    return Array.from({length: 42}, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [baseDate]);

  const eventByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const key = keyOf(event.date);
      map.set(key, [...(map.get(key) || []), event]);
    });
    return map;
  }, [events]);

  const restrictions = useMemo(() => {
    return events
      .filter((event) => event.type !== 'manual')
      .map((event) => {
        const condominium = condominiums.find((item) => item.id === event.condominiumId);
        if (!condominium) return null;
        const holiday = getHolidayInfo(event.date, condominium.city);
        const weekday = (event.date.getDay() + 6) % 7;
        const dayBlocked = !condominium.allowedWeekdays.includes(weekday);
        const holidayBlocked = (holiday.national && condominium.blockNationalHolidays) || (holiday.city && condominium.blockCityHolidays);
        if (!dayBlocked && !holidayBlocked) return null;
        const reason = dayBlocked
          ? `dia não permitido (${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][weekday]})`
          : `feriado bloqueado (${holiday.national || holiday.city})`;
        return {event, condominium, reason};
      })
      .filter(Boolean) as Array<{event: CalendarEvent; condominium: CondominiumRule; reason: string}>;
  }, [condominiums, events]);

  const mobileMonthDays = useMemo(() => {
    return days
      .filter((day) => day.getMonth() === baseDate.getMonth())
      .map((day) => {
        const dateKey = keyOf(day);
        const nationalHoliday = getHolidayInfo(day).national;
        const cityHolidays = altoTieteCities
          .map((city) => ({city, name: getHolidayInfo(day, city).city}))
          .filter((item) => item.name);
        const dayEvents = eventByDay.get(dateKey) || [];

        return {
          day,
          dateKey,
          isToday: dateKey === keyOf(today),
          nationalHoliday,
          cityHolidays,
          dayEvents,
        };
      })
      .filter((item) => item.dayEvents.length || item.nationalHoliday || item.cityHolidays.length);
  }, [altoTieteCities, baseDate, days, eventByDay, today]);

  const selectedClient = selectedEvent?.clientId ? clients.find((item) => item.id === selectedEvent.clientId) : null;
  const selectedEventDaysLeft = selectedEvent ?daysLeftFromToday(selectedEvent.date) : null;
  const subscriptionHttpsUrl = useMemo(() => {
    if (!appUid || !subscriptionToken || typeof window === 'undefined') return '';
    return `${window.location.origin}/calendar/${encodeURIComponent(appUid)}/${encodeURIComponent(subscriptionToken)}.ics`;
  }, [appUid, subscriptionToken]);
  const subscriptionWebcalUrl = useMemo(() => {
    if (!subscriptionHttpsUrl) return '';
    return subscriptionHttpsUrl.replace(/^https?/, 'webcal');
  }, [subscriptionHttpsUrl]);
  const googleCalendarSubscribeUrl = useMemo(() => {
    if (!subscriptionHttpsUrl) return '';
    return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(subscriptionHttpsUrl)}`;
  }, [subscriptionHttpsUrl]);

  const getCondominiumBlockReason = (client: Client | undefined, date: Date) => {
    const condominium = client?.condominiumId ?condominiums.find((item) => item.id === client.condominiumId) : null;
    if (!condominium) return '';
    const holiday = getHolidayInfo(date, condominium.city);
    const weekday = (date.getDay() + 6) % 7;
    const dayBlocked = !condominium.allowedWeekdays.includes(weekday);
    const holidayBlocked = (holiday.national && condominium.blockNationalHolidays) || (holiday.city && condominium.blockCityHolidays);
    if (dayBlocked) return `${fixCorruptedText(condominium.name)}: dia não permitido (${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][weekday]}).`;
    if (holidayBlocked) return `${condominium.name}: ${holiday.national || holiday.city} em ${condominium.city}.`;
    return '';
  };

  const resetForm = () => {
    setNewEventTitle('');
    setNewEventDescription('');
    setNewEventClientId('');
    setNewEventTime('09:00');
    setNewEventDate(toInputDate(new Date()));
    setCreateError('');
    setEditingEventId(null);
  };

  const openCreateModal = (date?: Date) => {
    resetForm();
    setNewEventDate(toInputDate(date || new Date()));
    setShowCreateModal(true);
  };

  const handleOpenSubscribeModal = async () => {
    if (!appUid) {
      setSubscribeError('Faça login novamente para gerar o link de assinatura.');
      setShowSubscribeModal(true);
      return;
    }

    setSubscribeError('');
    setIsPreparingSubscription(true);

    try {
      let token = subscriptionToken || profile?.calendarFeedToken || '';
      if (!token) {
        token = createCalendarFeedToken();
        await updateDoc(doc(db, 'profiles', appUid), {calendarFeedToken: token});
      }
      setSubscriptionToken(token);
      setShowSubscribeModal(true);
    } catch (error) {
      console.error('Erro ao preparar assinatura do calendário', error);
      setSubscribeError('Não foi possível preparar o link de assinatura agora. Tente novamente.');
      setShowSubscribeModal(true);
    } finally {
      setIsPreparingSubscription(false);
    }
  };

  const handleCopySubscriptionLink = async () => {
    if (!subscriptionHttpsUrl) return;
    try {
      await navigator.clipboard.writeText(subscriptionHttpsUrl);
    } catch (error) {
      console.error('Erro ao copiar link do calendário', error);
      setSubscribeError('Não foi possível copiar o link automaticamente. Copie manualmente abaixo.');
    }
  };

  const openEditModal = () => {
    if (!selectedEvent || selectedEvent.type !== 'manual' || !selectedEvent.sourceId) return;
    const raw = manualEvents.find((item) => item.id === selectedEvent.sourceId);
    if (!raw) return;
    const date = parseDateKey(raw.dateKey) || toDate(raw.date) || new Date();
    setEditingEventId(raw.id);
    setNewEventTitle(raw.title || '');
    setNewEventDescription(raw.description || '');
    setNewEventDate(toInputDate(date));
    setNewEventTime(raw.eventTime || '09:00');
    setNewEventClientId(raw.clientId || '');
    setCreateError('');
    setSelectedEvent(null);
    setShowCreateModal(true);
  };

  const handleCreateOrEditEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError('');

    const selectedBaseDate = parseInputDate(newEventDate);
    if (!selectedBaseDate) {
      setCreateError('Data inválida. Selecione uma data válida.');
      return;
    }

    const [hours, minutes] = (newEventTime || '09:00').split(':').map(Number);
    const selectedDate = new Date(selectedBaseDate);
    selectedDate.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);

    const client = clients.find((item) => item.id === newEventClientId);
    const title = newEventTitle.trim() || (client ? `Evento - ${client.name}` : 'Evento manual');
    const blockedReason = getCondominiumBlockReason(client, selectedDate);
    if (blockedReason) {
      setCreateError(`Não é possível agendar nessa data. ${blockedReason}`);
      return;
    }

    const payload = {
      title,
      description: newEventDescription.trim(),
      date: Timestamp.fromDate(selectedDate),
      dateKey: keyOf(selectedDate),
      eventTime: `${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}`,
      clientId: client?.id || '',
      clientName: client?.name || '',
      city: client?.city || '',
      updatedAt: Timestamp.now(),
    };

    setIsSavingEvent(true);
    try {
      if (editingEventId) {
        await updateDoc(doc(db, 'calendarEvents', editingEventId), payload);
      } else {
        await addDoc(collection(db, 'calendarEvents'), {
          ...payload,
          createdAt: Timestamp.now(),
          createdByUid: appUid || '',
          createdByName: fixCorruptedText(profile?.name || user?.user_metadata?.name || user?.email || 'Usuário'),
        });
      }
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error('Erro ao salvar evento', error);
      setCreateError(getCreateEventErrorMessage(error));
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent || selectedEvent.type !== 'manual' || !selectedEvent.sourceId) return;
    setIsDeletingEvent(true);
    try {
      await deleteDoc(doc(db, 'calendarEvents', selectedEvent.sourceId));
      setSelectedEvent(null);
    } finally {
      setIsDeletingEvent(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Calendário operacional</h1>
          <p className="text-slate-500 mt-1">Medições, entregas, eventos manuais e feriados municipais.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={handleOpenSubscribeModal}
            disabled={isPreparingSubscription}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-sm font-bold text-brand-primary hover:bg-brand-primary/10 disabled:opacity-70 sm:w-auto"
          >
            <CalendarPlus className="w-4 h-4" />
            {isPreparingSubscription ? 'Preparando assinatura...' : 'Assinar cronograma'}
          </button>
          <button type="button" onClick={() => openCreateModal()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:w-auto">
            <Plus className="w-4 h-4" />Adicionar evento
          </button>
          <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 sm:flex sm:items-center">
            <button type="button" onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1))} className="rounded-xl border border-slate-200 bg-white p-2">
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            </button>
            <div className="min-w-0 text-center text-sm font-bold text-slate-700 capitalize">{monthLabel}</div>
            <button type="button" onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1))} className="rounded-xl border border-slate-200 bg-white p-2">
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
      </header>

      {deadlineAlerts.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-rose-800 font-bold"><AlertTriangle className="w-5 h-5" />Alertas de prazo</div>
          <div className="mt-3 space-y-2">
            {deadlineAlerts.slice(0, 8).map(({event, daysLeft, level}) => (
              <button
                key={`${event.id}-deadline`}
                type="button"
                onClick={() => setSelectedEvent(event)}
                className={cn('block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-white/70', level === 'maximo' ? 'text-rose-900' : 'text-amber-800')}
              >
                {level === 'maximo' ? 'ALERTA MÁXIMO' : 'ALERTA DE PRAZO'}: {fixCorruptedText(event.clientName || event.title)} em {event.date.toLocaleDateString('pt-BR')} às {eventTimeLabel(event.date, event.eventTime)} ({daysLeft === 0 ? 'hoje' : `faltam ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`})
              </button>
            ))}
          </div>
        </section>
      )}

      {restrictions.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800 font-bold"><AlertTriangle className="w-5 h-5" />Restrições de condomínio</div>
          <div className="mt-3 space-y-2">
            {restrictions.slice(0, 8).map(({event, condominium, reason}) => (
              <button
                key={`${event.id}-${reason}`}
                type="button"
                onClick={() => setSelectedEvent(event)}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-900 hover:bg-white/70"
              >
                {eventLabel(event.type)} de {event.clientName} em {event.date.toLocaleDateString('pt-BR')} no {condominium.name}: {reason}.
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm sm:rounded-[32px]">
        <div className="border-b border-slate-100 px-4 py-4 sm:hidden">
          <div className="text-sm font-bold text-slate-900">Agenda do mês</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-400">{monthLabel}</div>
        </div>

        <div className="space-y-3 p-4 sm:hidden">
          {mobileMonthDays.length ? (
            mobileMonthDays.map(({day, dateKey, isToday, nationalHoliday, cityHolidays, dayEvents}) => (
              <div key={`mobile-${dateKey}`} className={cn('rounded-2xl border border-slate-100 bg-slate-50/70 p-4', isToday && 'border-brand-primary/30 bg-brand-primary/5')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={cn('text-sm font-bold capitalize', isToday ? 'text-brand-primary' : 'text-slate-900')}>
                      {day.toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: '2-digit'})}
                      {isToday ? ' · Hoje' : ''}
                    </div>
                    {(nationalHoliday || cityHolidays.length > 0) && (
                      <div className="mt-2 space-y-1">
                        {nationalHoliday && <div className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700">{nationalHoliday}</div>}
                        {cityHolidays.slice(0, 2).map((holiday) => (
                          <div key={`${dateKey}-${holiday.city}`} className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                            {holiday.city}: {holiday.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => openCreateModal(day)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {dayEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                      className="w-full rounded-xl bg-white px-3 py-3 text-left shadow-sm ring-1 ring-slate-100 hover:bg-slate-50"
                    >
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{eventLabel(ev.type)}</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{calendarEventTitle(ev)}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{eventTimeLabel(ev.date, ev.eventTime)}</div>
                      <div className="mt-1 text-xs font-bold text-brand-primary/80">{countdownLabel(daysLeftFromToday(ev.date))}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-400">
              Nenhum evento ou feriado relevante neste mês.
            </div>
          )}
        </div>

        <div className="hidden sm:grid sm:grid-cols-7 border-b border-slate-100 text-center text-xs font-bold uppercase tracking-widest text-slate-400">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => <div key={label} className="py-3">{label}</div>)}</div>
        <div className="hidden sm:grid sm:grid-cols-7">
          {days.map((day) => {
            const key = keyOf(day);
            const isCurrentMonth = day.getMonth() === baseDate.getMonth();
            const isToday = keyOf(day) === keyOf(today);
            const nationalHoliday = getHolidayInfo(day).national;
            const cityHolidays = altoTieteCities.map((city) => ({city, name: getHolidayInfo(day, city).city})).filter((item) => item.name);
            const dayEvents = eventByDay.get(key) || [];

            return (
              <div key={key} className={cn('min-h-[132px] border-r border-b border-slate-100 p-2', !isCurrentMonth && 'bg-slate-50/70', isToday && 'bg-brand-primary/5 ring-1 ring-brand-primary/30')}>
                <div className="flex items-start justify-between gap-2">
                  <div className={cn('text-xs font-bold', isToday ? 'text-brand-primary' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400')}>{day.getDate()}{isToday ? ' · Hoje' : ''}</div>
                  <button type="button" onClick={() => openCreateModal(day)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Adicionar evento">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {nationalHoliday && <div className="mt-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{nationalHoliday}</div>}
                {cityHolidays.slice(0, 2).map((holiday) => <div key={`${key}-${holiday.city}`} className="mt-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{holiday.city}: {holiday.name}</div>)}

                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <button key={ev.id} type="button" onClick={() => setSelectedEvent(ev)} className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold bg-slate-50 text-slate-600 hover:bg-slate-100">
                      {calendarEventTitle(ev)}
                      <div className="text-[10px] font-semibold opacity-80">{eventTimeLabel(ev.date, ev.eventTime)}</div>
                      <div className="text-[10px] font-bold text-brand-primary/80">{countdownLabel(daysLeftFromToday(ev.date))}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={() => setSelectedEvent(null)}><div className="h-[88svh] w-full overflow-y-auto rounded-t-[32px] border border-slate-100 bg-white p-5 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{eventLabel(selectedEvent.type)}</div>
                <h3 className="mt-1 text-xl font-display font-bold text-slate-900">{calendarEventTitle(selectedEvent)}</h3>
                <div className="mt-1 text-sm font-semibold text-slate-500">{selectedEvent.date.toLocaleDateString('pt-BR')} · {eventTimeLabel(selectedEvent.date, selectedEvent.eventTime)} · {fixCorruptedText(selectedEvent.status || 'Sem status')}</div>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="mt-5 space-y-3">
              {selectedEventDaysLeft !== null && (
                <div className={cn(
                  'rounded-2xl px-4 py-3 text-sm font-bold',
                  selectedEventDaysLeft <= 2 ?'bg-rose-50 text-rose-800' : selectedEventDaysLeft <= 7 ?'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-700',
                )}>
                  Contagem regressiva: {countdownLabel(selectedEventDaysLeft)}
                </div>
              )}

              {(selectedEvent.type === 'manual' || selectedEvent.type === 'pedido') && (
                <>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{fixCorruptedText(selectedEvent.description?.trim() || 'Sem descrição.')}</div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">Criado por: <span className="text-slate-700">{fixCorruptedText(selectedEvent.createdByName || 'Não informado')}</span></div>
                </>
              )}

              {selectedEvent.type === 'pedido' && (
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Detalhes do pedido</div>
                  <div className="mt-1 space-y-1 text-sm font-semibold text-slate-800">
                    <div>Fornecedor: {fixCorruptedText(selectedEvent.supplier || 'Não informado')}</div>
                    <div>Material: {fixCorruptedText(selectedEvent.materialName || selectedEvent.title || 'Não informado')}</div>
                  </div>
                </div>
              )}

              {selectedClient && (
                <>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Cliente vinculado</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{fixCorruptedText(selectedClient.name)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><Phone className="w-4 h-4" />Contato</div>
                    <div className="mt-1 space-y-1 text-sm font-semibold text-slate-800">
                      <div>Telefone: {fixCorruptedText(selectedClient.phone || 'Não informado')}</div>
                      <div>E-mail: {fixCorruptedText(selectedClient.email || 'Não informado')}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><MapPin className="w-4 h-4" />Endereço completo</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{clientFullAddress(selectedClient)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Detalhes do cadastro</div>
                    <div className="mt-1 space-y-1 text-sm font-semibold text-slate-800">
                      <div>Tipo: {clientAddressTypeLabel(selectedClient.addressType)}</div>
                      <div>CPF: {fixCorruptedText(selectedClient.cpf || 'Não informado')}</div>
                      <div>RG: {fixCorruptedText(selectedClient.rg || 'Não informado')}</div>
                      <div>Nascimento: {fixCorruptedText(selectedClient.birthDate || 'Não informado')}</div>
                    </div>
                  </div>
                  {selectedClient.notes?.trim() && (
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Observações do cliente</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800 whitespace-pre-wrap">{fixCorruptedText(selectedClient.notes)}</div>
                    </div>
                  )}
                </>
              )}

              {selectedEvent.type === 'manual' && (
                <>
                  <button type="button" onClick={openEditModal} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Editar evento</button>
                  <button type="button" onClick={handleDeleteEvent} disabled={isDeletingEvent} className="w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-70">{isDeletingEvent ? 'Excluindo...' : 'Excluir evento'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={() => { setShowCreateModal(false); resetForm(); }}><div className="h-[88svh] w-full overflow-y-auto rounded-t-[32px] border border-slate-100 bg-white p-5 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{editingEventId ? 'Editar evento' : 'Novo evento'}</div>
                <h3 className="mt-1 text-xl font-display font-bold text-slate-900">{editingEventId ? 'Atualizar no calendário' : 'Adicionar no calendário'}</h3>
              </div>
              <button type="button" onClick={() => { setShowCreateModal(false); resetForm(); }} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleCreateOrEditEvent}>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Cliente vinculado (opcional)</label>
                <select value={newEventClientId} onChange={(event) => setNewEventClientId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-primary">
                  <option value="">Sem cliente vinculado</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Título</label>
                <input value={newEventTitle} onChange={(event) => setNewEventTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-primary" placeholder="Ex: visita técnica" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Data</label>
                  <input type="date" value={newEventDate} onChange={(event) => setNewEventDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-primary" required />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Horário</label>
                  <input type="time" value={newEventTime} onChange={(event) => setNewEventTime(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-primary" required />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Descrição (opcional)</label>
                <textarea value={newEventDescription} onChange={(event) => setNewEventDescription(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-primary" placeholder="Detalhes do que será feito" />
              </div>

              {createError && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{createError}</div>}

              <button type="submit" disabled={isSavingEvent} className="w-full rounded-xl bg-brand-primary px-3 py-2 text-sm font-bold text-white hover:brightness-105 disabled:opacity-70">
                {isSavingEvent ? 'Salvando...' : editingEventId ? 'Salvar alterações' : 'Salvar evento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showSubscribeModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={() => setShowSubscribeModal(false)}><div className="h-[88svh] w-full overflow-y-auto rounded-t-[32px] border border-slate-100 bg-white p-5 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Assinar cronograma</div>
                <h3 className="mt-1 text-xl font-display font-bold text-slate-900">Sincronizar com iPhone e Android</h3>
                <p className="mt-2 text-sm text-slate-500">Depois de assinar uma vez, o calendário do aparelho passa a acompanhar seu cronograma por link.</p>
              </div>
              <button type="button" onClick={() => setShowSubscribeModal(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="mt-5 space-y-3">
              <a
                href={subscriptionWebcalUrl || '#'}
                className={cn(
                  'flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left',
                  subscriptionWebcalUrl ?'hover:bg-slate-50' : 'pointer-events-none opacity-50',
                )}
              >
                <div>
                  <div className="text-sm font-bold text-slate-900">Assinar no iPhone</div>
                  <div className="text-xs text-slate-500">Abre o app Calendário com o link de assinatura.</div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400" />
              </a>

              <a
                href={googleCalendarSubscribeUrl || '#'}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left',
                  googleCalendarSubscribeUrl ?'hover:bg-slate-50' : 'pointer-events-none opacity-50',
                )}
              >
                <div>
                  <div className="text-sm font-bold text-slate-900">Abrir no Google Calendar</div>
                  <div className="text-xs text-slate-500">No Android, o Google pode exigir adicionar o link pelo navegador antes de sincronizar no app.</div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400" />
              </a>

              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Link de assinatura</div>
                <div className="mt-2 break-all text-sm font-semibold text-slate-700">{subscriptionHttpsUrl || 'Link indisponível no momento.'}</div>
                <button
                  type="button"
                  onClick={handleCopySubscriptionLink}
                  disabled={!subscriptionHttpsUrl}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  <Copy className="w-4 h-4" />
                  Copiar link
                </button>
              </div>

              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
                Mantenha esse link privado. Quem tiver acesso a ele consegue visualizar o cronograma sincronizado.
              </div>

              <div className="rounded-2xl bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">
                Observação sobre Android: o app Google Calendar nem sempre aceita uma nova assinatura direto no celular. Se ele não adicionar sozinho, abra o Google Calendar no navegador ou use o link copiado para concluir a assinatura.
              </div>

              {subscribeError && (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{subscribeError}</div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

