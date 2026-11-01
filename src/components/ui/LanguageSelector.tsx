import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useI18n, type Language } from '../../lib/i18n';

const languages: { code: Language; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: 'US' },
  { code: 'es', name: 'Espanol', flag: 'ES' },
];

interface LanguageSelectorProps {
  variant?: 'dropdown' | 'buttons';
  showLabel?: boolean;
}

export function LanguageSelector({ variant = 'dropdown', showLabel = true }: LanguageSelectorProps) {
  const { language, setLanguage } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLanguage = languages.find(l => l.code === language) || languages[0];

  if (variant === 'buttons') {
    return (
      <div className="flex items-center gap-2">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`px-3 py-2 rounded-lg font-semibold transition-all ${
              language === lang.code
                ? 'bg-cyber-blue text-white'
                : 'bg-space-700 text-gray-400 hover:bg-space-600'
            }`}
          >
            {lang.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-space-700 hover:bg-space-600 rounded-lg transition-colors"
      >
        <Globe className="w-4 h-4 text-cyber-blue" />
        {showLabel && (
          <span className="text-gray-300 text-sm">{currentLanguage.name}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-40 bg-space-800 border border-space-600 rounded-lg shadow-xl overflow-hidden z-50">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                language === lang.code
                  ? 'bg-cyber-blue/20 text-cyber-blue'
                  : 'text-gray-300 hover:bg-space-700'
              }`}
            >
              <span className="text-sm font-medium">{lang.name}</span>
              {language === lang.code && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
