import React, {useEffect, useMemo, useState} from 'react';
import {collection, onSnapshot} from 'firebase/firestore';
import {AlertTriangle, ChevronLeft, ChevronRight, MapPin, Phone, X} from 'lucide-react';
import {db} from '../lib/firebase';
import {Client, CondominiumRule, Quote} from '../types';
import {cn} from '../lib/utils';
import {getHolidayInfo} from '../lib/holidays';

type EventType = 'medicao' | 'entrega';

interface CalendarEvent {
  id: string;
  quoteId: string;
  clientId: string;
  clientName: string;
  city?: string;
  date: Date;
  type: EventType;
  status: string;
  condominiumId?: string;
  condominiumName?: string;
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

export const CalendarPage: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [condominiums, setCondominiums] = useState<CondominiumRule[]>([]);
  const [baseDate, setBaseDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snapshot) => setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote))));
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => setClients(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Client))));
    const unsubCondominiums = onSnapshot(collection(db, 'condominiums'), (snapshot) => setCondominiums(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as CondominiumRule))));
    return () => {
      unsubQuotes();
      unsubClients();
      unsubCondominiums();
    };
  }, []);

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];
    quotes.forEach((quote) => {
      const client = clients.find((item) => item.id === quote.clientId);
      const medicao = toDate(quote.measurementDate);
      const entrega = toDate(quote.deliveryDate);

      if (medicao) {
        list.push({
          id: `${quote.id}-medicao`,
          quoteId: quote.id,
          clientId: quote.clientId,
          clientName: quote.clientName,
          city: client?.city,
          date: medicao,
          type: 'medicao',
          status: quote.status,
          condominiumId: client?.condominiumId,
          condominiumName: client?.condominiumName,
        });
      }

      if (entrega) {
        list.push({
          id: `${quote.id}-entrega`,
          quoteId: quote.id,
          clientId: quote.clientId,
          clientName: quote.clientName,
          city: client?.city,
          date: entrega,
          type: 'entrega',
          status: quote.status,
          condominiumId: client?.condominiumId,
          condominiumName: client?.condominiumName,
        });
      }
    });
    return list;
  }, [clients, quotes]);

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
      const current = map.get(key) || [];
      current.push(event);
      map.set(key, current);
    });
    return map;
  }, [events]);

  const restrictions = useMemo(() => {
    return events
      .map((event) => {
        const condominium = condominiums.find((item) => item.id === event.condominiumId);
        if (!condominium) return null;
        const holiday = getHolidayInfo(event.date, event.city);
        const weekday = (event.date.getDay() + 6) % 7;
        const dayBlocked = !condominium.allowedWeekdays.includes(weekday);
        const holidayBlocked = (holiday.national && condominium.blockNationalHolidays) || (holiday.city && condominium.blockCityHolidays);
        if (!dayBlocked && !holidayBlocked) return null;
        const reason = dayBlocked
          ? `dia nao permitido (${['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'][weekday]})`
          : `feriado bloqueado (${holiday.national || holiday.city})`;
        return {event, condominium, reason};
      })
      .filter(Boolean) as Array<{event: CalendarEvent; condominium: CondominiumRule; reason: string}>;
  }, [condominiums, events]);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const upcomingEvents = useMemo(() => {
    const diffDays = (date: Date) => {
      const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const base = today.getTime();
      return Math.ceil((target - base) / (1000 * 60 * 60 * 24));
    };

    return events
      .map((event) => ({event, daysLeft: diffDays(event.date)}))
      .filter((item) => item.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 12);
  }, [events, today]);

  const selectedClient = selectedEvent ? clients.find((item) => item.id === selectedEvent.clientId) : null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Calendario operacional</h1>
          <p className="text-slate-500 mt-1">Medicoes e entregas ligadas aos orcamentos e projetos.</p>
        </div>
        <div className="flex items-center gap-2">
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
            Alertas de restricao (condominio/feriado)
          </div>
          <div className="mt-3 space-y-2">
            {restrictions.slice(0, 8).map(({event, condominium, reason}) => (
              <div key={`${event.id}-${reason}`} className="text-sm text-amber-900">
                {event.type === 'entrega' ? 'Entrega' : 'Medicao'} de {event.clientName} em {event.date.toLocaleDateString('pt-BR')} no {condominium.name}: {reason}.
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
              Nenhuma medicao ou entrega futura cadastrada.
            </div>
          )}
          {upcomingEvents.map(({event, daysLeft}) => (
            <button
              key={`${event.id}-countdown`}
              type="button"
              onClick={() => setSelectedEvent(event)}
              className="rounded-xl bg-slate-50 px-3 py-2 text-left hover:bg-slate-100 transition-all"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {event.type === 'entrega' ? 'Entrega' : 'Medicao'} · {event.clientName}
              </div>
              <div className="mt-1 text-sm font-bold text-slate-800">
                {daysLeft === 0 ? 'E hoje' : `Daqui a ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`}
              </div>
              <div className="text-xs text-slate-500">{event.date.toLocaleDateString('pt-BR')}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((label) => (
            <div key={label} className="py-3">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = keyOf(day);
            const isCurrentMonth = day.getMonth() === baseDate.getMonth();
            const isToday = keyOf(day) === keyOf(today);
            const holiday = getHolidayInfo(day);
            const dayEvents = eventByDay.get(key) || [];
            return (
              <div
                key={key}
                className={cn(
                  'min-h-[120px] border-r border-b border-slate-100 p-2',
                  !isCurrentMonth && 'bg-slate-50/70',
                  isToday && 'bg-brand-primary/5 ring-1 ring-brand-primary/30',
                )}
              >
                <div className={cn('text-xs font-bold', isToday ? 'text-brand-primary' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400')}>
                  {day.getDate()}{isToday ? ' · Hoje' : ''}
                </div>
                {holiday.national && <div className="mt-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{holiday.national}</div>}
                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className={cn(
                        'w-full text-left rounded px-1.5 py-1 text-[10px] font-semibold leading-tight hover:brightness-95 transition-all',
                        event.type === 'entrega' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700',
                      )}
                    >
                      {event.type === 'entrega' ? 'Entrega' : 'Medicao'} · {event.clientName}
                    </button>
                  ))}
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
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {selectedEvent.type === 'entrega' ? 'Entrega' : 'Medicao'}
                </div>
                <h3 className="mt-1 text-xl font-display font-bold text-slate-900">{selectedEvent.clientName}</h3>
                <div className="mt-1 text-sm font-semibold text-slate-500">
                  {selectedEvent.date.toLocaleDateString('pt-BR')} · {selectedEvent.status}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                  <Phone className="w-4 h-4" />
                  Telefone
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{selectedClient?.phone || 'Nao informado'}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                  <MapPin className="w-4 h-4" />
                  Endereco
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{selectedClient?.address || 'Nao informado'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
