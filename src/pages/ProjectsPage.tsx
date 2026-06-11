import React, {useEffect, useMemo, useState} from 'react';
import {collection, onSnapshot, orderBy, query, selectFields} from '../lib/firestore';
import {useNavigate} from 'react-router-dom';
import {ClipboardCheck, Mail, MapPin, Phone, Search, User, X} from 'lucide-react';
import {db} from '../lib/firestore';
import {Client, Employee, ProductionStep, Quote, QuotePiece} from '../types';
import {cn, formatArea, formatCentimeters, formatCurrency} from '../lib/utils';
import {getClientDisplayStatus, normalizeQuoteStatus, quoteStatusColor, shouldAppearInProjects} from '../lib/quoteStatus';
import {ClientNavigationButtons} from '../components/ClientNavigationButtons';

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const fallbackText = 'Não informado';

type ProjectRow = {
  id: string;
  clientId: string;
  clientName: string;
  environment: string;
  totalArea: number;
  totalPrice: number;
  status: string;
  legacy: boolean;
  quote?: Quote;
  client?: Client;
  employeeAssignments?: Quote['employeeAssignments'];
};

const productionColumns: Array<{key: ProductionStep; label: string; statuses: string[]}> = [
  {key: 'medicao', label: 'Medição', statuses: ['Medição']},
  {key: 'corte', label: 'Corte', statuses: ['Projeto', 'Projeto Aprovado', 'Corte']},
  {key: 'acabamento', label: 'Acabamento', statuses: ['Acabamento', 'Montagem']},
  {key: 'instalacao', label: 'Instalação', statuses: ['Produção Finalizada', 'Conferência Final', 'Entrega']},
  {key: 'entrega', label: 'Entrega', statuses: ['Finalizado']},
];

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [clientModalProject, setClientModalProject] = useState<ProjectRow | null>(null);
  const [trackingModalProject, setTrackingModalProject] = useState<ProjectRow | null>(null);

  useEffect(() => {
    const unsubQuotes = onSnapshot(query(
      collection(db, 'quotes'),
      selectFields('clientId', 'clientName', 'environment', 'totalArea', 'totalPrice', 'status', 'pieces', 'employeeAssignments', 'createdAt'),
      orderBy('createdAt', 'desc'),
    ), (snapshot) => {
      setQuotes(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Quote)));
      setLoading(false);
    });
    const unsubClients = onSnapshot(query(
      collection(db, 'clients'),
      selectFields('name', 'phone', 'email', 'address', 'streetAddress', 'city', 'zipCode', 'neighborhood', 'addressType', 'condominiumName', 'block', 'lot', 'tower', 'apartmentNumber', 'notes', 'manualQuoteStatus', 'manualStage', 'legacyProjectMode', 'legacyManualQuote'),
    ), (snapshot) => {
      setClients(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Client)));
    });
    const unsubEmployees = onSnapshot(query(collection(db, 'employees'), selectFields('name')), (snapshot) => {
      setEmployees(snapshot.docs.map((item) => ({id: item.id, ...item.data()} as Employee)));
    });

    return () => {
      unsubQuotes();
      unsubClients();
      unsubEmployees();
    };
  }, []);

  const latestQuoteByClient = useMemo(() => {
    const map = new Map<string, Quote>();
    quotes.forEach((quote) => {
      const current = map.get(quote.clientId);
      const currentTime = current?.createdAt?.toDate?.()?.getTime?.() || 0;
      const nextTime = quote?.createdAt?.toDate?.()?.getTime?.() || 0;
      if (!current || nextTime >= currentTime) map.set(quote.clientId, quote);
    });
    return map;
  }, [quotes]);

  const projects = useMemo(() => {
    const clientById = new Map(clients.map((client) => [client.id, client]));
    const quoteRows: ProjectRow[] = quotes
      .filter((quote) => shouldAppearInProjects(quote.status))
      .map((quote) => ({
        id: quote.id,
        clientId: quote.clientId,
        clientName: quote.clientName,
        environment: quote.environment || 'Sem ambiente',
        totalArea: quote.totalArea || 0,
        totalPrice: quote.totalPrice || 0,
        status: quote.status,
        legacy: false,
        quote,
        client: clientById.get(quote.clientId),
        employeeAssignments: quote.employeeAssignments || [],
      }));

    const legacyRows: ProjectRow[] = clients
      .filter((client) => !latestQuoteByClient.has(client.id))
      .map((client) => ({
        id: `legacy-${client.id}`,
        clientId: client.id,
        clientName: client.name,
        environment: client.legacyProjectMode === 'orcamento_existente' ? 'Orçamento existente' : 'Projeto antigo',
        totalArea: 0,
        totalPrice: client.legacyManualQuote?.totalPrice || 0,
        status: getClientDisplayStatus(client),
        legacy: true,
        client,
      }))
      .filter((item) => shouldAppearInProjects(item.status));

    return [...quoteRows, ...legacyRows]
      .filter((item) => normalize(`${item.clientName} ${item.environment} ${item.status}`).includes(normalize(search)));
  }, [clients, latestQuoteByClient, quotes, search]);

  const kanbanColumns = useMemo(() => productionColumns.map((column) => ({
    ...column,
    items: projects.filter((project) => !project.legacy && column.statuses.includes(project.status)),
  })), [projects]);

  const employeeNameById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee.name])), [employees]);

  const trackingPieces = useMemo(() => {
    if (!trackingModalProject) return [];
    if (trackingModalProject.legacy) {
      return (trackingModalProject.client?.legacyManualQuote?.pieces || []).map((piece) => ({
        id: piece.id,
        name: piece.name,
        status: normalizeQuoteStatus(piece.status || trackingModalProject.status),
        area: 0,
        notes: (piece.items || []).join(', '),
        value: piece.value || 0,
        dimensions: '',
      }));
    }

    return (trackingModalProject.quote?.pieces || []).map((piece: QuotePiece) => ({
      id: piece.id,
      name: piece.name,
      status: normalizeQuoteStatus(piece.pieceStatus || trackingModalProject.quote?.status || trackingModalProject.status),
      area: piece.totalArea || piece.manualArea || piece.area || 0,
      notes: piece.notes || '',
      value: piece.manualPrice || 0,
      dimensions: piece.unit === 'cm'
        ? `${formatCentimeters(piece.length || 0)} x ${formatCentimeters(piece.width || 0)}`
        : `${piece.length || 0}m x ${piece.width || 0}m`,
    }));
  }, [trackingModalProject]);

  const getClientAddressDetails = (client?: Client) => {
    if (!client) {
      return [{label: 'Endereço', value: 'Cliente não encontrado no cadastro.'}];
    }

    const addressTypeLabel = client.addressType === 'apartamento'
      ? 'Apartamento'
      : client.addressType === 'condominio'
        ? 'Condomínio'
        : 'Casa';

    return [
      {label: 'Tipo de endereço', value: addressTypeLabel},
      {label: 'Endereço', value: client.streetAddress || client.address || fallbackText},
      {label: 'Bairro', value: client.neighborhood || fallbackText},
      {label: 'Cidade', value: client.city || fallbackText},
      {label: 'CEP', value: client.zipCode || fallbackText},
      {label: 'Condomínio', value: client.condominiumName || fallbackText},
      {label: 'Quadra / Bloco', value: client.block || fallbackText},
      {label: 'Lote', value: client.lot || fallbackText},
      {label: 'Torre', value: client.tower || fallbackText},
      {label: 'Apartamento', value: client.apartmentNumber || fallbackText},
    ];
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Projetos</h1>
        <p className="mt-1 text-slate-500">Acompanhamento sincronizado com os status dos cards dos clientes.</p>
      </header>

      <section className="overflow-hidden rounded-[32px] border border-slate-100 bg-white p-2 shadow-sm">
        <div className="border-b border-slate-50 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar projeto por cliente, ambiente ou status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-12 pr-4 outline-none transition-all focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Cliente / Projeto</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Área</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Valor</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Carregando projetos...</td></tr>
              ) : projects.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Nenhum projeto encontrado.</td></tr>
              ) : (
                projects.map((project) => (
                  <tr key={project.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setClientModalProject(project)}
                        className="font-semibold text-slate-900 underline-offset-4 hover:text-brand-primary hover:underline"
                      >
                        {project.clientName}
                      </button>
                      <div className="text-xs font-medium text-brand-primary">{project.environment}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">
                      {project.legacy ? 'Projeto legado' : formatArea(project.totalArea)}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      {project.totalPrice > 0 ? formatCurrency(project.totalPrice) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase',
                        quoteStatusColor(project.status),
                      )}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setTrackingModalProject(project)}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-widest text-white"
                      >
                        <ClipboardCheck className="h-4 w-4" />
                        Acompanhar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="font-display text-xl font-bold text-slate-900">Painel de produção</h2>
          <p className="text-sm text-slate-400">Kanban por etapa para acompanhar rapidamente quem está em cada fase.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {kanbanColumns.map((column) => (
            <div key={column.key} className="rounded-[28px] border border-slate-100 bg-slate-50/70 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{column.label}</div>
                  <div className="text-2xl font-display font-bold text-slate-900">{column.items.length}</div>
                </div>
              </div>

              <div className="space-y-3">
                {column.items.map((project) => {
                  const assigned = (project.employeeAssignments || [])
                    .filter((item) => item.step === column.key)
                    .map((item) => item.employeeName || employeeNameById.get(item.employeeId) || 'Equipe')
                    .filter(Boolean);

                  return (
                    <button
                      key={`${column.key}-${project.id}`}
                      type="button"
                      onClick={() => navigate(`/quotes/edit/${project.id}`)}
                      className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left transition-all hover:shadow-sm"
                    >
                      <div className="font-bold text-slate-900">{project.clientName}</div>
                      <div className="mt-1 text-sm text-slate-500">{project.environment}</div>
                      <div className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400">{project.status}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        {assigned.length ? `Responsável: ${assigned.join(', ')}` : 'Sem responsável definido'}
                      </div>
                      <div className="mt-2 text-xs font-semibold text-brand-primary">{formatArea(project.totalArea)}</div>
                    </button>
                  );
                })}
                {column.items.length === 0 && (
                  <div className="rounded-2xl bg-white px-4 py-5 text-sm font-semibold text-slate-400">
                    Nenhum projeto nesta etapa.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {clientModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Dados do cliente</p>
                <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">{clientModalProject.clientName}</h2>
                <p className="mt-1 text-sm text-slate-500">{clientModalProject.environment}</p>
              </div>
              <button type="button" onClick={() => setClientModalProject(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <InfoRow icon={User} label="Nome" value={clientModalProject.client?.name || clientModalProject.clientName} />
              <InfoRow icon={Phone} label="Telefone" value={clientModalProject.client?.phone || fallbackText} />
              <InfoRow icon={Mail} label="E-mail" value={clientModalProject.client?.email || fallbackText} />
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
                  <div className="w-full">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Endereço</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {getClientAddressDetails(clientModalProject.client).map((item) => (
                        <div key={item.label} className="rounded-xl bg-white/80 px-3 py-2">
                          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{item.label}</div>
                          <div className="mt-1 font-semibold text-slate-800">{item.value}</div>
                        </div>
                      ))}
                    </div>
                    <ClientNavigationButtons client={clientModalProject.client} className="mt-3" />
                  </div>
                </div>
              </div>
              {clientModalProject.client?.notes && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Observações</div>
                  <div className="mt-1 text-slate-700">{clientModalProject.client.notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {trackingModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">Acompanhamento do projeto</p>
                <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">{trackingModalProject.clientName}</h2>
                <p className="mt-1 text-sm text-slate-500">{trackingModalProject.environment}</p>
              </div>
              <button type="button" onClick={() => setTrackingModalProject(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {trackingPieces.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">
                  Nenhuma peça cadastrada neste projeto.
                </div>
              ) : trackingPieces.map((piece) => (
                <div key={piece.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{piece.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {[piece.dimensions, piece.area ? formatArea(piece.area) : '', piece.notes].filter(Boolean).join(' · ') || 'Sem detalhes adicionais'}
                      </div>
                    </div>
                    <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase', quoteStatusColor(piece.status))}>
                      {piece.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoRow = ({icon: Icon, label, value}: {icon: React.ComponentType<{className?: string}>; label: string; value: string}) => (
  <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 font-semibold text-slate-800">{value}</div>
    </div>
  </div>
);
