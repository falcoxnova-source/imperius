import { useState, useEffect, type ReactNode } from 'react';
import { I18nContext, type Language, getStoredLanguage, setStoredLanguage } from './index';
import { en } from './en';
import { es } from './es';
import type { Translations } from './types';

const translations: Record<Language, Translations> = { en, es };

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setStoredLanguage(lang);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = translations[language];

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}
