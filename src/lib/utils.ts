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
