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

export function repairText(value: unknown) {
  return String(value ?? '')
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
    .replace(/ÃŠ/g, 'Ê')
    .replace(/Ã”/g, 'Ô')
    .replace(/Ãƒ/g, 'Ã')
    .replace(/Ã±/g, 'ñ')
    .replace(/Â·/g, '·')
    .replace(/Âº/g, 'º')
    .replace(/Âª/g, 'ª')
    .replace(/Â²/g, '²')
    .replace(/Â /g, ' ')
    .replace(/Â/g, '')
    .replace(/M\?/g, 'M²')
    .replace(/M\?XIMO/g, 'MÁXIMO')
    .replace(/Medi\?es/g, 'Medições')
    .replace(/Medi\?ão/g, 'Medição')
    .replace(/Endere\?o/g, 'Endereço')
    .replace(/Superf�cie/g, 'Superfície')
    .replace(/M\?rmore/g, 'Mármore')
    .replace(/L\?mina/g, 'Lâmina')
    .replace(/\?rea/g, 'Área')
    .replace(/\?udio/g, 'Áudio')
    .replace(/\?ltimo/g, 'Último')
    .replace(/\?ltima/g, 'Última')
    .replace(/\?nico/g, 'Único')
    .replace(/Produ\?\?o/g, 'Produção')
    .replace(/Produ\?ão/g, 'Produção')
    .replace(/Or\?amento/g, 'Orçamento')
    .replace(/Descri\?\?o/g, 'Descrição')
    .replace(/Observa\?\?es/g, 'Observações')
    .replace(/instala\?\?o/g, 'instalação')
    .replace(/avalia\?\?es/g, 'avaliações')
    .replace(/Guarni\?\?o/g, 'Guarnição')
    .replace(/Confer\?ncia/g, 'Conferência')
    .replace(/p\?a/g, 'pé')
    .replace(/Pe\?a/g, 'Peça')
    .replace(/pe\?a/g, 'peça')
    .replace(/N\?o/g, 'Não')
    .replace(/h\?/g, 'há')
    .replace(/op\?\?es/g, 'opções')
    .replace(/Front\?o/g, 'Frontão')
    .replace(/Usu\?rio/g, 'Usuário')
    .replace(/Respons\?vel/g, 'Responsável')
    .replace(/Dispon\?vel/g, 'Disponível')
    .replace(/Indispon\?vel/g, 'Indisponível')
    .replace(/M?nimo/g, 'Mínimo')
    .replace(/V?lvula/g, 'Válvula')
    .replace(/Pre\?o/g, 'Preço')
    .replace(/fun\?\?o/g, 'função')
    .replace(/Hist\?rico/g, 'Histórico')
    .replace(/P\?gina/g, 'Página')
    .replace(/Relat\?rio/g, 'Relatório')
    .replace(/Per\?odo/g, 'Período')
    .replace(/Emiss\?o/g, 'Emissão')
    .replace(/GEST\?O/g, 'GESTÃO')
    .replace(/cr\?ticos/g, 'críticos')
    .replace(/Situa\?\?o/g, 'Situação')
    .replace(/Funcion\?rio/g, 'Funcionário')
    .replace(/Fun\?\?o/g, 'Função')
    .replace(/M\?dia/g, 'Média')
    .replace(/Movimenta\?\?o/g, 'Movimentação')
    .replace(/Sem respons\?vel/g, 'Sem responsável')
    .replace(/\s+\?/g, ' ·');
}
