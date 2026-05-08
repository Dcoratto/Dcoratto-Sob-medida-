import React, {useEffect, useMemo, useState} from 'react';
import {addDoc, collection, onSnapshot, Timestamp} from 'firebase/firestore';
import {AlertTriangle, ChevronLeft, ChevronRight, MapPin, Phone, Plus, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {Client, CondominiumRule, Quote} from '../types';
import {cn} from '../lib/utils';
import {getHolidayInfo} from '../lib/holidays';

type EventType = 'medicao' | 'entrega' | 'manual';

interface CalendarEvent {
  id: string;
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
}

interface ManualCalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: any;
}

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfMonthGrid = (date: Date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const weekday = (first.getDay() + 6) % 7;
  const output = new Date(first);
  output.setDate(first.getDate() - weekday);
  return output;
};

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const eventLabel = (type: EventType) => type === 'entrega' ? 'Entrega' : type === 'medicao' ? 'Medição' : 'Evento';

export const CalendarPage: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [manualEvents, setManualEvents] = useState<ManualCalendarEvent[]>([]);
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventDate, setNewEventDate] = useState(toInputDate(new Date()));
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  useEffect(() => {
    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snapshot) => setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote))));
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => setClients(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Client))));
    const unsubCondominiums = onSnapshot(collection(db, 'condominiums'), (snapshot) => setCondominiums(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as CondominiumRule))));
    const unsubManualEvents = onSnapshot(collection(db, 'calendarEvents'), (snapshot) => setManualEvents(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as ManualCalendarEvent))));
    return () => {
      unsubQuotes();
      unsubClients();
      unsubCondominiums();
      unsubManualEvents();
    };
  }, []);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const daysLeftFromToday = (date: Date) => {
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return Math.ceil((target - today.getTime()) / 86400000);
  };

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];
    quotes.forEach((quote) => {
      const client = clients.find((item) => item.id === quote.clientId);
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
      const date = toDate(manualEvent.date);
      if (!date) return;
      list.push({
        id: `manual-${manualEvent.id}`,
        date,
        type: 'manual',
        title: manualEvent.title,
        description: manualEvent.description,
        status: 'Evento manual',
      });
    });

    return list;
  }, [clients, manualEvents, quotes]);

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
        const holiday = getHolidayInfo(event.date, event.city);
        const weekday = (event.date.getDay() + 6) % 7;
        const dayBlocked = !condominium.allowedWeekdays.includes(weekday);
        const holidayBlocked = (holiday.national && condominium.blockNationalHolidays) || (holiday.city && condominium.blockCityHolidays);
        if (!dayBlocked && !holidayBlocked) return null;
        const reason = dayBlocked
          ? `dia não permitido (${['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'][weekday]})`
          : `feriado bloqueado (${holiday.national || holiday.city})`;
        return {event, condominium, reason};
      })
      .filter(Boolean) as Array<{event: CalendarEvent; condominium: CondominiumRule; reason: string}>;
  }, [condominiums, events]);

  const upcomingEvents = useMemo(() => {
    return events
      .map((event) => ({event, daysLeft: daysLeftFromToday(event.date)}))
      .filter((item) => item.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 12);
  }, [events, today]);

  const deadlineAlerts = useMemo(() => {
    return upcomingEvents
      .filter(({daysLeft}) => daysLeft <= 7)
      .map((item) => ({
        ...item,
        level: (item.daysLeft <= 2 ? 'maximo' : 'aviso') as 'maximo' | 'aviso',
      }));
  }, [upcomingEvents]);

  const selectedClient = selectedEvent?.clientId ? clients.find((item) => item.id === selectedEvent.clientId) : null;

  const openCreateModal = (date?: Date) => {
    setNewEventDate(toInputDate(date || new Date()));
    setNewEventTitle('');
    setNewEventDescription('');
    setShowCreateModal(true);
  };

  const handleCreateEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newEventTitle.trim() || !newEventDate) return;
    const [year, month, day] = newEventDate.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, day);

    setIsSavingEvent(true);
    try {
      await addDoc(collection(db, 'calendarEvents'), {
        title: newEventTitle.trim(),
        description: newEventDescription.trim(),
        date: Timestamp.fromDate(selectedDate),
        createdAt: Timestamp.now(),
      });
      setShowCreateModal(false);
    } finally {
      setIsSavingEvent(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Calendário operacional</h1>
          <p className="text-slate-500 mt-1">Medições, entregas e eventos manuais.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => openCreateModal()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <Plus className="w-4 h-4" />
            Adicionar evento
          </button>
          <button type="button" onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1))} className="rounded-xl border border-slate-200 bg-white p-2">
            <ChevronLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div className="min-w-[180px] text-center text-sm font-bold text-slate-700 capitalize">
            {baseDate.toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'})}
          </div>
          <button type="button" onClick={() => setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1))} className="rounded-xl border border-slate-200 bg-white p-2">
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </header>

      {restrictions.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800 font-bold">
            <AlertTriangle className="w-5 h-5" />
            Alertas de restrição
          </div>
          <div className="mt-3 space-y-2">
            {restrictions.slice(0, 8).map(({event, condominium, reason}) => (
              <div key={`${event.id}-${reason}`} className="text-sm text-amber-900">
                {eventLabel(event.type)} de {event.clientName} em {event.date.toLocaleDateString('pt-BR')} no {condominium.name}: {reason}.
              </div>
            ))}
          </div>
        </section>
      )}

      {deadlineAlerts.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-rose-800 font-bold">
            <AlertTriangle className="w-5 h-5" />
            Alertas de prazo
          </div>
          <div className="mt-3 space-y-2">
            {deadlineAlerts.slice(0, 8).map(({event, daysLeft, level}) => (
              <div key={`${event.id}-deadline`} className={cn('text-sm font-semibold', level === 'maximo' ? 'text-rose-900' : 'text-amber-800')}>
                {level === 'maximo' ? 'ALERTA MÁXIMO' : 'Aviso'}: {event.clientName || event.title} em {event.date.toLocaleDateString('pt-BR')} ({daysLeft === 0 ? 'hoje' : `faltam ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`})
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-slate-800 font-bold">Contagem regressiva</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {upcomingEvents.length === 0 && (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
              Nenhum evento futuro cadastrado.
            </div>
          )}
          {upcomingEvents.map(({event, daysLeft}) => (
            <button key={`${event.id}-countdown`} type="button" onClick={() => setSelectedEvent(event)} className={cn('rounded-xl px-3 py-2 text-left transition-all', daysLeft <= 2 ? 'bg-rose-50 hover:bg-rose-100' : daysLeft <= 7 ? 'bg-amber-50 hover:bg-amber-100' : 'bg-slate-50 hover:bg-slate-100')}>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{eventLabel(event.type)} · {event.clientName || event.title}</div>
              {daysLeft <= 2 && <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-rose-700">Alerta máximo</div>}
              {daysLeft > 2 && daysLeft <= 7 && <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-amber-700">Aviso de prazo</div>}
              <div className="mt-1 text-sm font-bold text-slate-800">{daysLeft === 0 ? 'É hoje' : `Daqui a ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`}</div>
              <div className="text-xs text-slate-500">{event.date.toLocaleDateString('pt-BR')}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((label) => <div key={label} className="py-3">{label}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = keyOf(day);
            const isCurrentMonth = day.getMonth() === baseDate.getMonth();
            const isToday = keyOf(day) === keyOf(today);
            const holiday = getHolidayInfo(day);
            const dayEvents = eventByDay.get(key) || [];
            return (
              <div key={key} className={cn('min-h-[120px] border-r border-b border-slate-100 p-2', !isCurrentMonth && 'bg-slate-50/70', isToday && 'bg-brand-primary/5 ring-1 ring-brand-primary/30')}>
                <div className="flex items-start justify-between gap-2">
                  <div className={cn('text-xs font-bold', isToday ? 'text-brand-primary' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400')}>
                    {day.getDate()}{isToday ? ' · Hoje' : ''}
                  </div>
                  <button type="button" onClick={() => openCreateModal(day)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Adicionar evento">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {holiday.national && <div className="mt-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{holiday.national}</div>}
                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => {
                    const daysLeft = daysLeftFromToday(event.date);
                    return (
                      <button key={event.id} type="button" onClick={() => setSelectedEvent(event)} className={cn('w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold transition-all', daysLeft >= 0 && daysLeft <= 2 ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : daysLeft >= 0 && daysLeft <= 7 ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100')}>
                        {eventLabel(event.type)} · {event.clientName || event.title}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && <div className="text-[10px] font-bold text-slate-400">+{dayEvents.length - 3} mais</div>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-100 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{eventLabel(selectedEvent.type)}</div>
                <h3 className="mt-1 text-xl font-display font-bold text-slate-900">{selectedEvent.clientName || selectedEvent.title}</h3>
                <div className="mt-1 text-sm font-semibold text-slate-500">{selectedEvent.date.toLocaleDateString('pt-BR')} · {selectedEvent.status || 'Sem status'}</div>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedEvent.type === 'manual' ? (
              <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{selectedEvent.description?.trim() || 'Sem descrição.'}</div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><Phone className="w-4 h-4" />Telefone</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{selectedClient?.phone || 'Não informado'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><MapPin className="w-4 h-4" />Endereço</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{selectedClient?.address || 'Não informado'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-100 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Novo evento</div>
                <h3 className="mt-1 text-xl font-display font-bold text-slate-900">Adicionar no calendário</h3>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleCreateEvent}>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Título</label>
                <input value={newEventTitle} onChange={(event) => setNewEventTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-primary" placeholder="Ex: visita técnica" required />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Data</label>
                <input type="date" value={newEventDate} onChange={(event) => setNewEventDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-primary" required />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Descrição (opcional)</label>
                <textarea value={newEventDescription} onChange={(event) => setNewEventDescription(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-primary" placeholder="Detalhes do que será feito" />
              </div>

              <button type="submit" disabled={isSavingEvent} className="w-full rounded-xl bg-brand-primary px-3 py-2 text-sm font-bold text-white hover:brightness-105 disabled:opacity-70">
                {isSavingEvent ? 'Salvando...' : 'Salvar evento'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
