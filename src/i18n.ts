import { useEffect, useState } from 'react';

export type Lang = 'en' | 'id';

const STORAGE_KEY = 'perfectshot.lang';

function readInitialLang(): Lang {
  try {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'id') return 'id';
    }
  } catch {
    // ignore storage errors
  }
  return 'en';
}

let currentLang: Lang = readInitialLang();
const listeners = new Set<() => void>();

function syncDocumentLang(lang: Lang): void {
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  } catch {
    // ignore DOM errors
  }
}

syncDocumentLang(currentLang);

export function setLang(lang: Lang): void {
  if (currentLang === lang) return;
  currentLang = lang;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
  } catch {
    // ignore storage errors
  }
  syncDocumentLang(lang);
  listeners.forEach((fn) => fn());
}

export function tx(en: string, id: string): string {
  return currentLang === 'id' ? id : en;
}

export function langLocale(): string {
  return currentLang === 'id' ? 'id-ID' : 'en-US';
}

export function useLang(): Lang {
  const [lang, setState] = useState<Lang>(currentLang);
  useEffect(() => {
    const onChange = () => setState(currentLang);
    listeners.add(onChange);
    setState(currentLang);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return lang;
}
