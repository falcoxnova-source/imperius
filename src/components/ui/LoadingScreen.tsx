import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export function LoadingScreen() {
  const [showRetry, setShowRetry] = useState(false);
  let t: any;
  try {
    const i18n = useI18n();
    t = i18n.t;
  } catch {
    t = null;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowRetry(true);
    }, 15000);

    return () => clearTimeout(timer);
  }, []);

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 bg-space-900 flex flex-col items-center justify-center z-50">
      <div className="relative">
        <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-[80px] animate-pulse scale-150" />
        <img
          src="/Imagenes/Visuales/main_city.webp"
          alt="Imperium"
          className="w-48 h-48 sm:w-56 sm:h-56 object-cover rounded-full bg-stone-950 ring-4 ring-amber-500/60 relative z-10 shadow-[0_0_35px_rgba(245,158,11,0.45)] animate-float"
          draggable={false}
        />
      </div>
      <div className="flex items-center gap-2 mt-6">
        <div className="w-3 h-3 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-3 h-3 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-3 h-3 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <p className="text-gray-400 mt-4 font-rajdhani">{t?.common?.loading || 'Cargando...'}</p>

      {showRetry && (
        <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in">
          <p className="text-gray-500 text-sm">{t?.app?.serverStarting || 'La carga esta tardando mas de lo esperado'}</p>
          <button
            onClick={handleReload}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t?.app?.retry || 'Recargar pagina'}
          </button>
        </div>
      )}
    </div>
  );
}
