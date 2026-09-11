/**
 * Lightweight, type-safe i18n. Pages declare a local dictionary
 * ({ en: {...}, hi: {...} }) and call useT(dict). English is the fallback.
 */
import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

export type Lang = 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu' | 'kn';

export interface LangMeta {
  code: Lang;
  name: string;
  native: string;
  /** 'all' = whole app, 'citizen' = citizen portal only (operations screens fall back to English) */
  scope: 'all' | 'citizen';
}

export const LANGS: LangMeta[] = [
  { code: 'en', name: 'English', native: 'English', scope: 'all' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', scope: 'all' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', scope: 'citizen' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', scope: 'citizen' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', scope: 'citizen' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', scope: 'citizen' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', scope: 'citizen' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', scope: 'citizen' },
];

export type Dict<K extends string = string> = { en: Record<K, string> } & Partial<Record<Exclude<Lang, 'en'>, Partial<Record<K, string>>>>;

export type Vars = Record<string, string | number>;

export function translate<K extends string>(dict: Dict<K>, lang: Lang, key: K, vars?: Vars): string {
  const table = (dict[lang] as Partial<Record<K, string>> | undefined) ?? undefined;
  let s = table?.[key] ?? dict.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}

export function useLang(): Lang {
  return useAppStore((s) => s.language);
}

export function useT<K extends string>(dict: Dict<K>) {
  const lang = useAppStore((s) => s.language);
  return useCallback((key: K, vars?: Vars) => translate(dict, lang, key, vars), [dict, lang]);
}

/** Pick a language-specific value from a {en, hi, ...} object with English fallback. */
export function pick(obj: Partial<Record<Lang, string>> & { en: string }, lang: Lang): string {
  return obj[lang] ?? obj.en;
}

/** Locale for Intl formatting. */
export function localeOf(lang: Lang): string {
  return { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN', gu: 'gu-IN', kn: 'kn-IN' }[lang];
}

export function formatNumber(n: number, lang: Lang, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeOf(lang), opts).format(n);
}

/** Indian rupee formatting in lakh / crore for readability. */
export function formatRupees(n: number, lang: Lang = 'en'): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${formatNumber(abs / 1e7, lang, { maximumFractionDigits: 2 })} Cr`;
  if (abs >= 1e5) return `${sign}₹${formatNumber(abs / 1e5, lang, { maximumFractionDigits: 1 })} L`;
  return `${sign}₹${formatNumber(Math.round(abs), lang)}`;
}
