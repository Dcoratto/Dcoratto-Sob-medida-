import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatNumber(value: number, decimals = 2) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function parseCurrencyInput(value: string) {
  const text = String(value || '').trim();
  if (!text) return 0;

  const cleaned = text.replace(/[^\d,.-]/g, '');
  const hasComma = cleaned.includes(',');

  if (hasComma) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const dotParts = cleaned.split('.');
  if (dotParts.length === 2 && dotParts[1].length <= 2) {
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(cleaned.replace(/\./g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrencyInput(value: string | number) {
  return formatCurrency(parseCurrencyInput(String(value || '0')));
}

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ÃƒÂ¡/g, 'á'],
  [/ÃƒÂ¢/g, 'â'],
  [/ÃƒÂ£/g, 'ã'],
  [/ÃƒÂ§/g, 'ç'],
  [/ÃƒÂ©/g, 'é'],
  [/ÃƒÂª/g, 'ê'],
  [/ÃƒÂ­/g, 'í'],
  [/ÃƒÂ³/g, 'ó'],
  [/ÃƒÂ´/g, 'ô'],
  [/ÃƒÂµ/g, 'õ'],
  [/ÃƒÂº/g, 'ú'],
  [/ÃƒÂ/g, 'Á'],
  [/Ãƒâ€°/g, 'É'],
  [/Ãƒâ€œ/g, 'Ó'],
  [/Ãƒâ€/g, 'Ô'],
  [/ÃƒÅ¡/g, 'Ú'],
  [/Ãƒâ€¡/g, 'Ç'],
  [/ÃƒÅ /g, 'Ê'],
  [/Ã§/g, 'ç'],
  [/Ã¡/g, 'á'],
  [/Ã¢/g, 'â'],
  [/Ã£/g, 'ã'],
  [/Ã©/g, 'é'],
  [/Ãª/g, 'ê'],
  [/Ã­/g, 'í'],
  [/Ã³/g, 'ó'],
  [/Ã´/g, 'ô'],
  [/Ãµ/g, 'õ'],
  [/Ãº/g, 'ú'],
  [/Ã/g, 'Á'],
  [/Ã€/g, 'À'],
  [/Ã‡/g, 'Ç'],
  [/Ã‰/g, 'É'],
  [/ÃŠ/g, 'Ê'],
  [/Ã“/g, 'Ó'],
  [/Ã”/g, 'Ô'],
  [/Ãš/g, 'Ú'],
  [/Ã /g, 'à'],
  [/Ã±/g, 'ñ'],
  [/Â²/g, '²'],
  [/Â°/g, '°'],
  [/Â·/g, '·'],
  [/Âº/g, 'º'],
  [/Âª/g, 'ª'],
  [/Â/g, ''],
];

const LOST_CHAR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/A��es/g, 'Ações'],
  [/a��o/g, 'ação'],
  [/a��es/g, 'ações'],
  [/Administra��o/g, 'Administração'],
  [/Altera��es/g, 'Alterações'],
  [/Assinar cronograma/g, 'Assinar cronograma'],
  [/� vista/g, 'À vista'],
  [/Calend�rio/g, 'Calendário'],
  [/Cart�o/g, 'Cartão'],
  [/Cat�logo/g, 'Catálogo'],
  [/Cliente n�o informado/g, 'Cliente não informado'],
  [/Cliente\/or�amento/g, 'Cliente / orçamento'],
  [/compra pendente para or�amento/gi, 'compra pendente para orçamento'],
  [/Condom�nio/g, 'Condomínio'],
  [/Confer�ncia/g, 'Conferência'],
  [/Configura��es/g, 'Configurações'],
  [/confirma��o/g, 'confirmação'],
  [/Conex�o/g, 'Conexão'],
  [/Controle interno de qualidade, produ��o e entrega\./g, 'Controle interno de qualidade, produção e entrega.'],
  [/cr�ticas/g, 'críticas'],
  [/cr�tico/g, 'crítico'],
  [/D�bito/g, 'Débito'],
  [/Descri��o/g, 'Descrição'],
  [/Di�metro/g, 'Diâmetro'],
  [/Dispon�vel/g, 'Disponível'],
  [/edi��o/g, 'edição'],
  [/endere�o/g, 'endereço'],
  [/Endere�o/g, 'Endereço'],
  [/Entrega de compra ·/g, 'Entrega de compra ·'],
  [/Espa�o/g, 'Espaço'],
  [/especifica��es/g, 'especificações'],
  [/Especifica��es/g, 'Especificações'],
  [/Esta a��o/g, 'Esta ação'],
  [/est�/g, 'está'],
  [/est�o/g, 'estão'],
  [/Exclus�o/g, 'Exclusão'],
  [/funcion�rio/g, 'funcionário'],
  [/Funcion�rio/g, 'Funcionário'],
  [/Funcion�rios/g, 'Funcionários'],
  [/Fun��o/g, 'Função'],
  [/fun��o/g, 'função'],
  [/Gerencie usu�rios, permiss�es e funcion�rios da produ��o\./g, 'Gerencie usuários, permissões e funcionários da produção.'],
  [/Hist�rico/g, 'Histórico'],
  [/Informa��es/g, 'Informações'],
  [/Instala��o/g, 'Instalação'],
  [/inv�lido/g, 'inválido'],
  [/L�mina/g, 'Lâmina'],
  [/Localiza��o/g, 'Localização'],
  [/Marmoraria/g, 'Marmoraria'],
  [/Medi��es/g, 'Medições'],
  [/Medi��o/g, 'Medição'],
  [/M�s/g, 'Mês'],
  [/M�dia/g, 'Média'],
  [/M�nimo/g, 'Mínimo'],
  [/M�rmore/g, 'Mármore'],
  [/N�o/g, 'Não'],
  [/n�o/g, 'não'],
  [/n�mero/g, 'número'],
  [/Observa��es/g, 'Observações'],
  [/Ol�/g, 'Olá'],
  [/op��es/g, 'opções'],
  [/Or�amento/g, 'Orçamento'],
  [/or�amento/g, 'orçamento'],
  [/P�tio/g, 'Pátio'],
  [/P�gina/g, 'Página'],
  [/pe�a/g, 'peça'],
  [/Pe�a/g, 'Peça'],
  [/per�odo/g, 'período'],
  [/Per�odo/g, 'Período'],
  [/permiss�o/g, 'permissão'],
  [/poss�vel/g, 'possível'],
  [/Pre�o/g, 'Preço'],
  [/pre�o/g, 'preço'],
  [/produ��o/g, 'produção'],
  [/Produ��o/g, 'Produção'],
  [/Produ��o Finalizada/g, 'Produção Finalizada'],
  [/qualidade, produ��o, prazos, materiais e equipe\./g, 'qualidade, produção, prazos, materiais e equipe.'],
  [/Relat�rio/g, 'Relatório'],
  [/Relat�rios/g, 'Relatórios'],
  [/respons�vel/g, 'responsável'],
  [/Respons�vel/g, 'Responsável'],
  [/s�o/g, 'são'],
  [/Salvar Altera��es/g, 'Salvar Alterações'],
  [/Se��o/g, 'Seção'],
  [/Sem ambiente �/g, 'Sem ambiente ·'],
  [/Sem endere�o cadastrado/g, 'Sem endereço cadastrado'],
  [/Sem permiss�o/g, 'Sem permissão'],
  [/Sem respons�vel/g, 'Sem responsável'],
  [/situa��o/g, 'situação'],
  [/Superf�cie/g, 'Superfície'],
  [/sujeito � confirma��o de medidas no local\./g, 'sujeito à confirmação de medidas no local.'],
  [/Telefone e endere�o/g, 'Telefone e endereço'],
  [/tem permiss�o/g, 'tem permissão'],
  [/Ultimos/g, 'Últimos'],
  [/�ltimo/g, 'último'],
  [/�ltimos/g, 'últimos'],
  [/Usu�rio/g, 'Usuário'],
  [/Usu�rios/g, 'Usuários'],
  [/v�lido/g, 'válido'],
  [/Vis�o/g, 'Visão'],
  [/Voc�/g, 'Você'],
  [/(\d+(?:[.,]\d+)?)\s*M�/g, '$1 m²'],
  [/M�/g, 'm²'],
  [/m�/g, 'm²'],
  [/ � /g, ' · '],
  [/�s/g, 'às'],
];

const applyRepairRules = (text: string) => {
  let next = text;
  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of LOST_CHAR_REPLACEMENTS) {
    next = next.replace(pattern, replacement as never);
  }
  return next;
};

export function repairText(value: unknown) {
  return applyRepairRules(String(value ?? ''));
}

export function repairTextDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return repairText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => repairTextDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, repairTextDeep(entry)]),
    ) as T;
  }
  return value;
}
