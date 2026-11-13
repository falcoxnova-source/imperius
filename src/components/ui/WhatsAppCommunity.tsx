import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export const WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/GU9awkTSFXSLDWBMQW8XHo';

const STORAGE_KEY = 'xnova_wa_community_hidden';

/** Icono oficial de WhatsApp (SVG inline, sin dependencias extra). */
export function WhatsAppIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.944c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.93 11.93 0 0 0 5.71 1.454h.006c6.585 0 11.946-5.359 11.949-11.945 0-3.19-1.24-6.19-3.495-8.444" />
    </svg>
  );
}

/**
 * Burbuja flotante para unirse a la comunidad de WhatsApp.
 * Usa position:fixed, por lo que NO ocupa espacio en el flujo de la pagina
 * y no desplaza hacia abajo la informacion del planeta.
 *
 * Se coloca JUSTO ENCIMA del boton flotante del asistente IA
 * (AIAssistant usa: bottom-20 sm:bottom-4 right-4, 56px de alto).
 *
 * Es permanente: el jugador puede ocultarla, pero vuelve a aparecer
 * en la siguiente sesion (solo se recuerda mientras dure la pestana).
 */
export function WhatsAppFloatingButton() {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let hidden = false;
    try {
      hidden = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      hidden = false;
    }
    if (hidden) {
      setVisible(false);
      return;
    }

    const t1 = setTimeout(() => setExpanded(true), 1500);
    const t2 = setTimeout(() => setExpanded(false), 8000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const dismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignorar */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed right-5 bottom-36 sm:bottom-20 z-50 transition-all duration-500"
      style={{ pointerEvents: 'none' }}
    >
      <div className="relative flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
        {/* Texto que aparece y se recoge solo */}
        <a
          href={WHATSAPP_COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`hidden sm:flex items-center whitespace-nowrap overflow-hidden rounded-full bg-slate-900/90 backdrop-blur border border-green-500/40 text-green-200 text-xs font-medium shadow-lg shadow-green-900/30 transition-all duration-500 ${
            expanded ? 'max-w-[240px] px-4 py-2 opacity-100' : 'max-w-0 px-0 py-2 opacity-0'
          }`}
        >
          Únete a la comunidad de WhatsApp
        </a>

        <a
          href={WHATSAPP_COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          aria-label="Únete a la comunidad de WhatsApp de Imperium"
          title="Únete a la comunidad de WhatsApp"
          className="relative flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-600/40 hover:scale-110 active:scale-95 transition-transform duration-200"
        >
          <span className="absolute inset-0 rounded-full bg-green-400/40 animate-ping" style={{ animationDuration: '2.5s' }} />
          <WhatsAppIcon className="w-6 h-6 relative z-10" />
        </a>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Ocultar invitación de WhatsApp"
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-800 border border-white/20 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
