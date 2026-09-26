import React, {useEffect, useRef, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {AlertTriangle, CalendarDays, CheckCircle2, Clock3, ExternalLink, GripVertical, LockKeyhole, Search, X} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {cn} from '../lib/utils';
import {loadOperationalBoard, loadOperationalDetail, loadOperationalEvents, mutateOperational, type BoardFilter, type OperationalBoard, type OperationalCard, type OperationalDetail} from '../lib/operational';
import {blockTypes, canFinalize, canRegisterInstallation, canScheduleInstallation, canScheduleMeasurement, dateKey, deadlineStatus, dependencyTypes, filterOperationalBoard, priorities, safeDriveUrl, stageLabel, stages, stageTargets, type Stage} from '../lib/operationalDomain';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const displayDate = (value?: string | null) => value ? value.split('-').reverse().join('/') : '';
const displayDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '';
const currentTime = () => new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
const deadlineText = (card: OperationalCard) => card.remaining_days === null ? 'Prazo não iniciado' : `${Math.abs(card.remaining_days)} dias úteis ${card.remaining_days < 0 ? 'em atraso' : 'restantes'}${card.paused ? ' · pausado' : ''}`;
const indicatorLabels = {ongoing: 'Em andamento', late: 'Atrasados', blocked: 'Bloqueados', measurement: 'Medições da semana', installation: 'Instalações da semana'};

export function OperationalPage() {
  const {user, hasPermission} = useAuth();
  const [params, setParams] = useSearchParams();
  const [board, setBoard] = useState<OperationalBoard | null>(null);
  const [filter, setFilter] = useState<BoardFilter>({});
  const [draftSearch, setDraftSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<OperationalDetail | null>(null);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [payload, setPayload] = useState<Record<string, any>>({});
  const [tab, setTab] = useState('summary');
  const [dragged, setDragged] = useState<OperationalCard | null>(null);
  const [olderEvents, setOlderEvents] = useState<OperationalDetail['events']>([]);
  const [moreEvents, setMoreEvents] = useState(true);
  const detailCache = useRef(new Map<string, OperationalDetail>());
  const requestSequence = useRef(0);
  const detailSequence = useRef(0);
  const completeBoard = useRef<{userId: string; includesCompleted: boolean; data: OperationalBoard} | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const canEdit = hasPermission('projeto', 'editar');

  useEffect(() => {const timeout = setTimeout(() => setFilter(current => current.search === draftSearch ? current : ({...current, search: draftSearch, offset: 0})), 300); return () => clearTimeout(timeout);}, [draftSearch]);
  useEffect(() => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError('');
    const cached = completeBoard.current;
    const needsCompleted = filter.completed || filter.stage === 'completed';
    if (cached?.userId === user?.id && (!needsCompleted || cached.includesCompleted)) {
      setBoard(filterOperationalBoard(cached.data, filter)); setLoading(false);
    } else {
      loadOperationalBoard(filter).then(data => {
        if (sequence !== requestSequence.current) return;
        if (!filter.search && !filter.stage && !filter.priority && !filter.situation && !filter.offset && data.total <= 100) completeBoard.current = {userId: user?.id || '', includesCompleted: !!filter.completed, data};
        setBoard(data);
      }).catch(err => {if (sequence === requestSequence.current) setError(err.message);}).finally(() => {if (sequence === requestSequence.current) setLoading(false);});
    }
    return () => {requestSequence.current++;};
  }, [filter, user?.id]);
  useEffect(() => {detailCache.current.clear(); setDetail(null); if (completeBoard.current?.userId !== user?.id) completeBoard.current = null;}, [user?.id]);
  const open = async (id: string) => {
    const sequence = ++detailSequence.current;
    setOpening(true); setError(''); setAction(''); setTab('summary'); setOlderEvents([]); setMoreEvents(true);
    try {
      const cached = detailCache.current.get(id);
      const card = board?.cards.find(item => item.contract_id === id);
      const data = cached && card && cached.card.version === card.version ? cached : await loadOperationalDetail(id);
      if (sequence !== detailSequence.current) return null;
      detailCache.current.set(id, data); setDetail(data);
      return data;
    } catch (err) {if (sequence === detailSequence.current) setError(err instanceof Error ? err.message : 'Erro ao abrir contrato.');}
    finally {if (sequence === detailSequence.current) setOpening(false);}
  };
  useEffect(() => {const id = params.get('contract'); if (id) void open(id);}, [params.get('contract')]);
  const close = () => {if (busy) return; detailSequence.current++; setDetail(null); setAction(''); if (params.has('contract')) setParams({}, {replace: true});};
  useEffect(() => {
    if (!detail) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) close();
      if (event.key === 'Tab') {
        const controls = Array.from<HTMLElement>(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || []).filter(element => element.offsetParent !== null);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
      }
    };
    document.addEventListener('keydown', key); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {document.removeEventListener('keydown', key); document.body.style.overflow = previous;};
  }, [detail, busy]);

  const applyDetail = (data: OperationalDetail) => {
    setOlderEvents([]); setMoreEvents(true);
    detailCache.current.set(data.card.contract_id, data); setDetail(data);
    setBoard(current => {
      if (!current) return current;
      const previous = current.cards.find(card => card.contract_id === data.card.contract_id) || detail?.card;
      const indicators = {...current.indicators};
      if (previous) {
        for (const key of ['ongoing', 'late', 'blocked'] as const) {
          const matches = (card: OperationalCard) => card.stage !== 'completed' && (key === 'ongoing' || (key === 'late' ? (card.remaining_days ?? 0) < 0 : card.blocked || card.dependent_count > 0));
          indicators[key] += Number(matches(data.card)) - Number(matches(previous));
        }
        const now = new Date(); const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const end = new Date(start); end.setDate(start.getDate() + 6);
        for (const key of ['measurement', 'installation'] as const) {
          const matches = (card: OperationalCard) => {const day = card[`${key}_date`]; return !!day && day >= dateKey(start) && day <= dateKey(end);};
          indicators[key] += Number(matches(data.card)) - Number(matches(previous));
        }
      }
      const cached = completeBoard.current;
      if (cached?.userId === user?.id) {
        const exists = cached.data.cards.some(card => card.contract_id === data.card.contract_id);
        cached.data = {...cached.data, indicators, cards: exists ? cached.data.cards.map(card => card.contract_id === data.card.contract_id ? data.card : card) : [...cached.data.cards, data.card]};
        return filterOperationalBoard(cached.data, filter);
      }
      return {...current, indicators, cards: current.cards.map(card => card.contract_id === data.card.contract_id ? data.card : card)};
    });
  };
  const submit = async (card: OperationalCard, kind: string, data: Record<string, unknown>) => {
    setBusy(true); setError(''); setNotice('');
    try {const updated = await mutateOperational(card, kind, data); applyDetail(updated); setAction(''); setPayload({}); setNotice('Alteração salva.');}
    catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
      // Refresh only this contract after a rejected stale version; never reload the board.
      try {applyDetail(await loadOperationalDetail(card.contract_id));} catch {detailCache.current.delete(card.contract_id);}
    } finally {setBusy(false);}
  };
  const begin = (kind: string, data: Record<string, any> = {}) => {setAction(kind); setPayload(data); setError(''); setNotice('');};
  const movementPayload = (target: Stage, data: OperationalDetail) => {
    const schedule = data.schedules.find(item => item.operational_kind === target && item.status !== 'completed');
    return {stage: target, date: schedule?.date_key || '', time: schedule?.event_time || '', event_id: schedule?.id};
  };
  const move = async (card: OperationalCard, target: Stage) => {
    if (busy || card.stage === target) return;
    if (!stageTargets(card.stage).includes(target)) {setError('Avance uma etapa por vez no fluxo operacional.'); return;}
    const opened = await open(card.contract_id);
    if (opened) begin(target === 'aftercare' ? 'aftercare_open' : 'move', movementPayload(target, opened));
  };
  const patch = (key: string, value: unknown) => setPayload(current => ({...current, [key]: value}));
  const selectedPieces: string[] = payload.piece_ids || [];
  const selectPiece = (id: string) => patch('piece_ids', selectedPieces.includes(id) ? selectedPieces.filter(piece => piece !== id) : [...selectedPieces, id]);
  const installationPayload = (pieceIds: string[]) => {
    const schedule = detail?.schedules.find(item => item.operational_kind === 'installation' && item.status !== 'completed');
    return {piece_ids: pieceIds, event_id: schedule?.id || '', date: schedule?.date_key || dateKey(new Date()), time: schedule?.event_time || currentTime()};
  };
  const card = detail?.card;
  const scheduleKind = action === 'schedule' ? payload.kind : action === 'move' && ['measurement', 'installation'].includes(payload.stage) ? payload.stage : '';
  const installationWarning = scheduleKind === 'installation' && !!card && (card.dependent_count > 0 || (!!card.due_date && payload.date > card.due_date));
  const openBlock = detail?.blocks.find(block => !block.ended_at);
  const visibleStages = stages.filter(([id]) => (!filter.stage || filter.stage === id) && (filter.completed || filter.stage === 'completed' || id !== 'completed'));
  const locallyVisible = (item: OperationalCard) => (!filter.stage || item.stage === filter.stage) && (!filter.priority || item.priority === filter.priority) && (filter.completed || filter.stage === 'completed' || item.stage !== 'completed') && (!filter.situation || (filter.situation === 'late' ? (item.remaining_days ?? 0) < 0 : filter.situation === 'blocked' ? item.blocked || item.dependent_count > 0 : filter.situation === 'ongoing' ? item.stage !== 'completed' : true));

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">Operacional</h1><p className="mt-1 text-sm text-slate-500">Do contrato vendido à instalação, com peças, prazos e histórico.</p></div>
      <div className="flex flex-wrap gap-2"><Link to="/projects/legacy" className={buttonClass}>Visão anterior</Link><Link to="/calendar" className={buttonClass}><CalendarDays className="h-4 w-4" />Calendário</Link><Link to="/contracts" className={cn(buttonClass, 'bg-brand-primary')}>Contratos Realizados</Link></div>
    </header>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {notice && !detail && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <section aria-label="Indicadores operacionais" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      {Object.entries(indicatorLabels).map(([key, label]) => <button key={key} onClick={() => setFilter(current => ({...current, situation: current.situation === key ? '' : key, offset: 0}))} className={cn('flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm', filter.situation === key ? 'border-brand-primary ring-1 ring-brand-primary' : 'border-slate-100')}>
        {key === 'blocked' ? <LockKeyhole className="h-5 w-5 text-amber-600" /> : key === 'late' ? <AlertTriangle className="h-5 w-5 text-rose-600" /> : <Clock3 className="h-5 w-5 text-brand-primary" />}
        <div><span className="block text-xs text-slate-500">{label}</span><span className="font-display text-2xl text-slate-900">{board?.indicators[key] ?? '—'}</span></div>
      </button>)}
    </section>
    <section className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-xs text-slate-500">Buscar<div className="relative mt-1"><Search className="absolute left-3 top-3 h-4 w-4" /><input value={draftSearch} maxLength={150} onChange={event => setDraftSearch(event.target.value)} placeholder="Cliente ou contrato" className={cn(inputClass, 'pl-9')} /></div></label>
      <label className="text-xs text-slate-500">Etapa<select className={cn(inputClass, 'mt-1')} value={filter.stage || ''} onChange={event => setFilter(current => ({...current, stage: event.target.value, offset: 0}))}><option value="">Todas</option>{stages.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-xs text-slate-500">Prioridade<select className={cn(inputClass, 'mt-1')} value={filter.priority || ''} onChange={event => setFilter(current => ({...current, priority: event.target.value, offset: 0}))}><option value="">Todas</option>{Object.entries(priorities).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-xs text-slate-500">Situação<select className={cn(inputClass, 'mt-1')} value={filter.situation || ''} onChange={event => setFilter(current => ({...current, situation: event.target.value, offset: 0}))}><option value="">Todas</option>{Object.entries(indicatorLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={!!filter.completed} onChange={event => setFilter(current => ({...current, completed: event.target.checked, offset: 0}))} />Mostrar finalizados</label>
    </section>
    {(loading || opening) && <p role="status" className="text-sm text-slate-500">{opening ? 'Abrindo contrato...' : 'Carregando quadro...'}</p>}
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4" aria-label="Kanban de contratos">
      {visibleStages.map(([id, label]) => {
        const cards = (board?.cards || []).filter(item => item.stage === id && locallyVisible(item)).sort((a, b) => ({urgent: 0, high: 1, normal: 2}[a.priority] - {urgent: 0, high: 1, normal: 2}[b.priority]));
        return <section key={id} onDragOver={event => {if (canEdit) event.preventDefault();}} onDrop={event => {event.preventDefault(); if (dragged) void move(dragged, id); setDragged(null);}} className="w-[min(85vw,280px)] shrink-0 snap-start rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
          <h2 className="mb-3 flex min-h-10 items-center justify-between border-b border-slate-200 pb-3 text-sm font-semibold text-slate-800">{label}<span className="rounded-full bg-white px-2 py-1 text-xs font-normal text-slate-500">{cards.length}</span></h2>
          <div className="space-y-3">{cards.map(item => {
            const status = deadlineStatus(item.remaining_days, board!.settings.attention_days, board!.settings.urgent_days);
            return <button key={item.contract_id} draggable={canEdit && !busy} onDragStart={() => setDragged(item)} onDragEnd={() => setDragged(null)} onClick={() => void open(item.contract_id)} className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-primary">
              <h3 className="flex items-center justify-between text-sm font-semibold text-slate-900">{item.contract_number}<GripVertical className="h-4 w-4 text-slate-300" /></h3><p className="mt-1 truncate text-sm text-slate-700">{item.client_name}</p>
              <p className="mt-1 text-xs text-slate-500">{item.piece_count} peças{item.installed_count > 0 ? ` · ${item.installed_count}/${item.piece_count} instaladas` : ''}</p>
              <p className={cn('mt-3 text-xs', status === 'late' || status === 'urgent' ? 'text-rose-600' : status === 'attention' ? 'text-amber-700' : 'text-slate-500')}>{deadlineText(item)}</p>
              {(item.measurement_date && id === 'measurement' || item.installation_date) && <p className="mt-2 text-xs text-slate-600">{id === 'measurement' ? `Medição ${displayDate(item.measurement_date)} ${item.measurement_time || ''}` : `Instalação ${displayDate(item.installation_date)} ${item.installation_time || ''}`}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className={cn('rounded-full px-2 py-1', item.priority === 'normal' ? 'bg-slate-50 text-slate-600' : 'bg-rose-50 text-rose-700')}>{priorities[item.priority]}</span>{item.blocked && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Bloqueado</span>}{item.dependent_count > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{item.dependent_count} dependentes</span>}</div>
            </button>;
          })}{!cards.length && <p className="p-3 text-sm text-slate-400">Nenhum contrato nesta etapa.</p>}</div>
        </section>;
      })}
    </div>
    {board && <div className="flex items-center justify-between text-sm text-slate-500"><span>{board.total} contratos encontrados · página {Math.floor((filter.offset || 0) / 100) + 1}</span><div className="flex gap-2"><button className={buttonClass} disabled={!filter.offset || loading} onClick={() => setFilter(current => ({...current, offset: Math.max(0, (current.offset || 0) - 100)}))}>Anterior</button><button className={buttonClass} disabled={(filter.offset || 0) + 100 >= board.total || loading} onClick={() => setFilter(current => ({...current, offset: (current.offset || 0) + 100}))}>Próxima</button></div></div>}
    {detail && card && <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/45 p-2 backdrop-blur-sm sm:p-4" onClick={close}>
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="operational-contract-title" onClick={event => event.stopPropagation()} className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl sm:rounded-[32px]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5"><div><p className="text-xs text-brand-primary">Contrato {card.contract_number}</p><h2 id="operational-contract-title" className="mt-1 font-display text-xl font-semibold text-slate-900">{card.client_name}</h2><p className="mt-1 text-sm text-slate-500">{stageLabel(card.stage)} · {card.installed_count}/{card.piece_count} peças instaladas</p></div><button autoFocus aria-label="Fechar painel" className={buttonClass} disabled={busy} onClick={close}><X className="h-5 w-5" /></button></header>
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-100 px-5 py-2" aria-label="Detalhes do contrato">{[['summary', 'Resumo'], ['pieces', `Peças (${card.piece_count})`], ['timeline', 'Timeline'], ['aftercare', 'Pós-Instalação']].map(([id, label]) => <button key={id} className={cn('min-h-11 whitespace-nowrap rounded-xl px-3 text-sm', tab === id ? 'bg-brand-primary/15 text-slate-900' : 'text-slate-500')} onClick={() => {setTab(id); setAction('');}} disabled={busy}>{label}</button>)}</nav>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
          {action && <form className="space-y-3 rounded-2xl border border-brand-primary/30 bg-slate-50 p-4" onSubmit={event => {event.preventDefault(); void submit(card, action, payload);}}>
            <h3 className="font-semibold text-slate-900">{action === 'move' ? `Mover para ${stageLabel(payload.stage)}` : ({schedule: 'Agendamento', block: 'Bloquear contrato', note: 'Observação operacional', dependency: 'Dependência da peça', install_pieces: 'Registrar visita de instalação', correct_installation: 'Corrigir instalação', aftercare_open: 'Abrir Pós-Instalação', aftercare_resolve: 'Resolver ocorrência'} as Record<string, string>)[action]}</h3>
            {scheduleKind && <><div className="grid grid-cols-2 gap-3"><label className="text-sm text-slate-600">Data<input required type="date" value={payload.date || ''} onChange={event => patch('date', event.target.value)} className={inputClass} /></label><label className="text-sm text-slate-600">Horário (opcional)<input type="time" value={payload.time || ''} onChange={event => patch('time', event.target.value)} className={inputClass} /></label></div><label className="block text-sm text-slate-600">Motivo do reagendamento<input maxLength={2000} value={payload.reason || ''} onChange={event => patch('reason', event.target.value)} className={inputClass} /></label></>}
            {installationWarning && <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><p>{card.dependent_count > 0 ? `${card.dependent_count} de ${card.piece_count} peças possuem dependências. ` : ''}{card.due_date && payload.date > card.due_date ? `Instalação após o prazo previsto (${displayDate(card.due_date)}).` : ''}</p><button type="button" className="underline" onClick={() => {setAction(''); setTab('pieces');}}>Visualizar peças</button><label className="flex gap-2"><input required type="checkbox" checked={!!payload.confirm_warning} onChange={event => patch('confirm_warning', event.target.checked)} />Confirmo o agendamento mesmo assim</label></div>}
            {action === 'move' && payload.stage === 'ready' && <>{[['approved', 'Executivo aprovado'], ['measures_checked', 'Medidas e conferências concluídas']].map(([key, label]) => <label key={key} className="flex gap-2 text-sm"><input required type="checkbox" checked={!!payload[key]} onChange={event => patch(key, event.target.checked)} />{label}</label>)}</>}
            {action === 'move' && ['cutting', 'delivery'].includes(payload.stage) && <label className="flex gap-2 text-sm"><input required type="checkbox" checked={!!payload[payload.stage === 'cutting' ? 'production_released' : 'inspection_done']} onChange={event => patch(payload.stage === 'cutting' ? 'production_released' : 'inspection_done', event.target.checked)} />{payload.stage === 'cutting' ? 'Liberado para produção' : 'Conferência para entrega concluída'}</label>}
            {action === 'block' && <><select required className={inputClass} value={payload.reason || ''} onChange={event => patch('reason', event.target.value)}><option value="">Motivo do bloqueio</option>{Object.entries(blockTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><label className="flex gap-2 text-sm"><input type="checkbox" checked={!!payload.pause_sla} onChange={event => patch('pause_sla', event.target.checked)} />Pausar prazo operacional</label></>}
            {action === 'dependency' && <select required className={inputClass} value={payload.kind || ''} onChange={event => patch('kind', event.target.value)}><option value="">Tipo de dependência</option>{Object.entries(dependencyTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}
            {action === 'move' && stages.findIndex(([id]) => id === payload.stage) < stages.findIndex(([id]) => id === card.stage) && <textarea required maxLength={2000} value={payload.reason || ''} onChange={event => patch('reason', event.target.value)} placeholder="Motivo do retorno de etapa" className={inputClass} />}
            {['aftercare_open', 'aftercare_resolve'].includes(action) && <textarea required maxLength={2000} value={payload.reason || ''} onChange={event => patch('reason', event.target.value)} placeholder={action === 'aftercare_open' ? 'Motivo/descrição' : 'Descreva a resolução'} className={inputClass} />}
            {['note', 'block', 'dependency', 'aftercare_open'].includes(action) && <textarea required={action === 'note'} maxLength={2000} value={payload.note || ''} onChange={event => patch('note', event.target.value)} placeholder="Observação operacional" className={inputClass} />}
            {action === 'install_pieces' && <><select className={inputClass} value={payload.event_id || ''} onChange={event => {const schedule = detail.schedules.find(item => item.id === event.target.value); setPayload(current => ({...current, event_id: event.target.value, date: schedule?.date_key || current.date, time: schedule?.event_time || current.time}));}}><option value="">Nova visita sem agendamento prévio</option>{detail.schedules.filter(schedule => schedule.operational_kind === 'installation' && schedule.status !== 'completed').map(schedule => <option key={schedule.id} value={schedule.id}>{displayDate(schedule.date_key)} {schedule.event_time}</option>)}</select><div className="grid grid-cols-2 gap-3"><label className="text-sm text-slate-600">Data<input required disabled={!!payload.event_id} type="date" max={dateKey(new Date())} value={payload.date || ''} onChange={event => patch('date', event.target.value)} className={inputClass} /></label><label className="text-sm text-slate-600">Horário<input disabled={!!payload.event_id} type="time" value={payload.time || ''} onChange={event => patch('time', event.target.value)} className={inputClass} /></label></div><textarea maxLength={2000} value={payload.note || ''} onChange={event => patch('note', event.target.value)} placeholder="Observação da visita (opcional)" className={inputClass} /></>}
            {['install_pieces', 'aftercare_open'].includes(action) && <fieldset className="space-y-2"><legend className="mb-2 text-sm text-slate-600">{action === 'install_pieces' ? 'Peças instaladas nesta visita' : 'Peças relacionadas (opcional)'}</legend>{detail.pieces.filter(piece => action !== 'install_pieces' || !piece.installed).map(piece => {const blocked = action === 'install_pieces' && detail.dependencies.some(dep => dep.piece_id === piece.id && !dep.released_at); return <label key={piece.id} className={cn('flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm', blocked && 'bg-amber-50 text-amber-800')}><input disabled={blocked} type="checkbox" checked={selectedPieces.includes(piece.id)} onChange={() => selectPiece(piece.id)} />{piece.label}{blocked && ' · dependência ativa'}</label>;})}</fieldset>}
            {action === 'correct_installation' && <textarea required maxLength={2000} value={payload.reason || ''} onChange={event => patch('reason', event.target.value)} placeholder="Motivo da correção" className={inputClass} />}
            <div className="flex gap-2"><button disabled={busy} className={cn(buttonClass, 'bg-brand-primary')}>{busy ? 'Salvando...' : 'Confirmar'}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setAction('')}>Cancelar</button></div>
          </form>}
          {tab === 'summary' && <>
            <div className="rounded-2xl border border-slate-100 p-4"><h3 className="font-semibold text-slate-900">Contrato e prazos</h3><p className="mt-2 text-sm text-slate-600">{deadlineText(card)}{card.due_date && ` · limite ${displayDate(card.due_date)}`}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-600">Etapa<select value={card.stage} disabled={busy || !canEdit && !hasPermission('projeto', 'aprovar')} className={inputClass} onChange={event => begin('move', movementPayload(event.target.value as Stage, detail))}>{stages.filter(([id]) => stageTargets(card.stage).includes(id) && (id !== 'completed' || canFinalize(card.stage, card.installed_count, card.piece_count))).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="text-sm text-slate-600">Prioridade<select value={card.priority} disabled={busy || !canEdit} className={inputClass} onChange={event => void submit(card, 'priority', {priority: event.target.value})}>{Object.entries(priorities).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
              {card.stage === 'installation' && <p className={cn('mt-3 text-sm', card.installed_count === card.piece_count ? 'text-emerald-700' : 'text-amber-700')}>{card.installed_count === card.piece_count ? 'Todas as peças instaladas. O contrato pode ser finalizado.' : `${card.piece_count - card.installed_count} peça(s) ainda precisam ser instaladas antes de finalizar.`}</p>}
              {detail.slas.map(sla => <p key={sla.id} className="mt-3 text-sm text-slate-500">{sla.kind === 'executive' ? 'Projeto Executivo' : 'Executivo Pronto até Instalação'}: {displayDate(sla.due_date)} · original {displayDate(sla.original_due)}{sla.closed_at ? ' · encerrado' : ''}</p>)}
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-100 p-4"><h3 className="font-semibold text-slate-900">Agendamentos e visitas</h3>{detail.schedules.map(schedule => <div key={schedule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{schedule.operational_kind === 'measurement' ? 'Medição' : 'Instalação'} · {displayDate(schedule.date_key)} {schedule.event_time || ''}{schedule.status === 'completed' ? ' · realizada' : ''}</span>{canEdit && schedule.status !== 'completed' && (schedule.operational_kind === 'measurement' ? canScheduleMeasurement(card.stage) : canScheduleInstallation(card.stage)) && <button className={buttonClass} disabled={busy} onClick={() => begin('schedule', {kind: schedule.operational_kind, event_id: schedule.id, date: schedule.date_key, time: schedule.event_time || ''})}>Reagendar</button>}</div>)}
              {detail.visits.map(visit => <p key={visit.id} className="text-sm text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4" />{displayDate(detail.schedules.find(schedule => schedule.id === visit.calendar_event_id)?.date_key)} · {visit.piece_count} peças instaladas{visit.corrected_count > 0 && ` · ${visit.corrected_count} corrigida(s)`}</p>)}
              {canEdit && <div className="flex flex-wrap gap-2">{canScheduleMeasurement(card.stage) && <button disabled={busy} className={buttonClass} onClick={() => begin('schedule', {kind: 'measurement'})}>Agendar medição</button>}{canScheduleInstallation(card.stage) && <button disabled={busy} className={buttonClass} onClick={() => begin('schedule', {kind: 'installation'})}>Agendar instalação</button>}{canRegisterInstallation(card.stage) && <button disabled={busy} className={cn(buttonClass, 'bg-brand-primary')} onClick={() => begin('install_pieces', installationPayload([]))}>Nova visita de instalação</button>}</div>}
              <Link className={buttonClass} to="/calendar">Ver no Calendário</Link>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4"><h3 className="font-semibold text-slate-900">Bloqueio operacional</h3>{openBlock ? <><p className="mt-2 text-sm text-amber-700">Aguardando {blockTypes[openBlock.reason as keyof typeof blockTypes] || openBlock.reason} desde {new Date(openBlock.started_at).toLocaleString('pt-BR')}{openBlock.pause_sla && ' · SLA pausado'}</p><p className="mt-2 text-sm text-slate-600">{openBlock.note}</p>{canEdit && <button disabled={busy} className={cn(buttonClass, 'mt-3')} onClick={() => void submit(card, 'unblock', {})}>Desbloquear e retomar</button>}</> : <p className="mt-2 text-sm text-slate-500">Sem bloqueio ativo.</p>}{canEdit && !openBlock && card.stage !== 'completed' && <button disabled={busy} className={cn(buttonClass, 'mt-3')} onClick={() => begin('block')}>Bloquear / aguardando</button>}</div>
            <div className="rounded-2xl border border-slate-100 p-4"><h3 className="font-semibold text-slate-900">Google Drive</h3>{safeDriveUrl(detail.drive_url) ? <a href={safeDriveUrl(detail.drive_url)!} target="_blank" rel="noopener noreferrer" className={cn(buttonClass, 'mt-3')}><ExternalLink className="h-4 w-4" />Abrir pasta no Google Drive</a> : <><p className="mt-2 text-sm text-slate-500">Google Drive não vinculado.</p><Link className={cn(buttonClass, 'mt-3')} to="/clients">Vincular Drive no cadastro do cliente</Link></>}</div>
          </>}
          {tab === 'pieces' && detail.pieces.map(piece => {const activeDependencies = detail.dependencies.filter(dep => dep.piece_id === piece.id && !dep.released_at); return <section key={piece.id} className="space-y-3 rounded-2xl border border-slate-100 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">{piece.label}</h3><p className={cn('mt-1 text-sm', piece.installed ? 'text-emerald-700' : 'text-slate-500')}>{piece.installed ? `✓ Instalada · ${displayDateTime(piece.installed_at)}` : card.stage === 'installation' ? 'Aguardando instalação' : `Etapa: ${stageLabel(piece.stage)}`}</p></div>{canEdit && canRegisterInstallation(card.stage) && (piece.installed ? <button disabled={busy} className={buttonClass} onClick={() => begin('correct_installation', {piece_id: piece.id})}>Corrigir instalação</button> : <button disabled={busy || activeDependencies.length > 0} title={activeDependencies.length ? 'Resolva as dependências antes de instalar' : undefined} className={cn(buttonClass, 'bg-brand-primary')} onClick={() => begin('install_pieces', installationPayload([piece.id]))}>Marcar como instalada</button>)}</div><select className={inputClass} disabled={busy || !canEdit || card.stage === 'completed'} value={piece.stage} onChange={event => void submit(card, 'piece', {piece_id: piece.id, stage: event.target.value})}>{stages.filter(([id]) => !['completed', 'aftercare'].includes(id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>{detail.dependencies.filter(dep => dep.piece_id === piece.id).map(dep => <div key={dep.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p>{dependencyTypes[dep.kind as keyof typeof dependencyTypes] || dep.kind} · {dep.released_at ? 'Liberada' : 'Aguardando'}</p>{dep.note && <p className="mt-1 text-slate-500">{dep.note}</p>}{!dep.released_at && canEdit && <button disabled={busy} className={cn(buttonClass, 'mt-2')} onClick={() => void submit(card, 'dependency_release', {id: dep.id})}>Liberar dependência</button>}</div>)}{canEdit && card.stage !== 'completed' && <button disabled={busy} className={buttonClass} onClick={() => begin('dependency', {piece_id: piece.id})}>Adicionar dependência</button>}</section>;})}
          {tab === 'timeline' && <>{canEdit && <button disabled={busy} className={buttonClass} onClick={() => begin('note')}>Adicionar observação</button>}<ol className="space-y-4 border-l border-slate-200 pl-4">{[...detail.events, ...olderEvents].map(event => <li key={event.id} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString('pt-BR')} · {event.actor_name}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{eventText(event)}</p></li>)}</ol>{detail.events.length === 200 && moreEvents && <button disabled={busy} className={buttonClass} onClick={async () => {
            const last = olderEvents.at(-1) || detail.events.at(-1); if (!last) return;
            setBusy(true); try {const events = await loadOperationalEvents(card.contract_id, last); setOlderEvents(current => [...current, ...events]); setMoreEvents(events.length === 100);} catch (err) {setError(err instanceof Error ? err.message : 'Erro ao carregar histórico.');} finally {setBusy(false);}
          }}>Carregar eventos anteriores</button>}{!detail.events.length && <p className="text-sm text-slate-500">Nenhuma ocorrência registrada.</p>}</>}
          {tab === 'aftercare' && <>{canEdit && ['completed', 'aftercare'].includes(card.stage) && <button disabled={busy} className={buttonClass} onClick={() => begin('aftercare_open', {piece_ids: []})}>Abrir ocorrência</button>}{detail.aftercare.map(item => <section key={item.id} className="space-y-2 rounded-2xl border border-slate-100 p-4"><h3 className="text-sm font-semibold text-slate-900">{item.description}</h3><p className="text-xs text-slate-500">Aberta em {new Date(item.opened_at).toLocaleString('pt-BR')} · {item.piece_ids.length ? `${item.piece_ids.length} peças relacionadas` : 'Ocorrência geral'}</p><p className="whitespace-pre-wrap text-sm text-slate-600">{item.note}</p>{item.resolved_at ? <p className="text-sm text-emerald-700">Resolvida em {new Date(item.resolved_at).toLocaleString('pt-BR')}: {item.resolution}</p> : canEdit && <button disabled={busy} className={buttonClass} onClick={() => begin('aftercare_resolve', {id: item.id})}>Resolver ocorrência</button>}</section>)}{!detail.aftercare.length && <p className="text-sm text-slate-500">Nenhuma ocorrência de pós-instalação.</p>}</>}
        </div>
      </section>
    </div>}
  </div>;
}

function eventText(event: OperationalDetail['events'][number]) {
  const p = event.payload;
  if (event.kind === 'move') return `${stageLabel(p.from)} → ${stageLabel(p.to)}${p.date ? `\nAgendamento: ${displayDate(p.date)} ${p.time || ''}` : ''}${p.reason ? `\nMotivo: ${p.reason}` : ''}${p.confirm_warning ? '\nConfirmado com alerta operacional.' : ''}`;
  if (event.kind === 'note') return p.note;
  if (event.kind === 'priority') return `Prioridade: ${priorities[p.from as keyof typeof priorities]} → ${priorities[p.to as keyof typeof priorities]}`;
  if (event.kind === 'schedule' || p.date) return `${p.kind === 'measurement' || p.stage === 'measurement' ? 'Medição' : 'Instalação'} ${p.previous_date ? `reagendada: ${displayDate(p.previous_date)} → ` : 'agendada: '}${displayDate(p.date)} ${p.time || ''}${p.reason ? `\nMotivo: ${p.reason}` : ''}${p.confirm_warning ? '\nConfirmado com alerta operacional.' : ''}`;
  if (event.kind === 'block') return `Bloqueio: ${blockTypes[p.reason as keyof typeof blockTypes] || p.reason}${p.pause_sla ? ' · prazo pausado' : ''}\n${p.note || ''}`;
  if (event.kind === 'unblock') return `Desbloqueado${p.pause_sla ? ' · prazo retomado' : ''} · ${Math.round(Number(p.duration_seconds) / 3600)} horas de bloqueio`;
  if (event.kind === 'dependency') return `Dependência: ${dependencyTypes[p.kind as keyof typeof dependencyTypes] || p.kind}\n${p.note || ''}`;
  if (event.kind === 'dependency_release') return 'Dependência liberada.';
  if (event.kind === 'piece') return `Etapa individual da peça: ${stageLabel(p.stage)}`;
  if (event.kind === 'visit') return `Visita registrada · ${p.piece_count} peças instaladas.`;
  if (event.kind === 'install_pieces') return `Visita registrada · ${p.piece_count} peças instaladas.${p.note ? `\n${p.note}` : ''}`;
  if (event.kind === 'correct_installation') return `Instalação corrigida. Motivo: ${p.reason}`;
  if (event.kind === 'aftercare_open') return `Pós-Instalação aberta: ${p.reason}\n${p.note || ''}`;
  if (event.kind === 'aftercare_resolve') return `Pós-Instalação resolvida: ${p.reason}${p.to === 'completed' ? '\nContrato finalizado.' : ''}`;
  return event.kind;
}
