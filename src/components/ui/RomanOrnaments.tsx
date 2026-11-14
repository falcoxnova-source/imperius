import { useState, useId } from 'react';

/** Corona de laurel dorada (SVG) para enmarcar insignias y titulos. */
export function Laurel({ className = '', stretch = false }: { className?: string; stretch?: boolean }) {
  const gid = useId().replace(/:/g, '');
  const angles = [72, 52, 32, 12, -8, -28, -48];
  const cx = 50;
  const cy = 54;
  const r = 38;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'}>
      <defs>
        <linearGradient id={`lg${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6e2a8" />
          <stop offset="55%" stopColor="#d6aa55" />
          <stop offset="100%" stopColor="#8a6328" />
        </linearGradient>
      </defs>
      <path d={`M ${cx - 6} ${cy + r - 2} Q ${cx - r - 6} ${cy + 10} ${cx - r + 8} ${cy - r + 8}`} fill="none" stroke={`url(#lg${gid})`} strokeWidth="1.6" />
      <path d={`M ${cx + 6} ${cy + r - 2} Q ${cx + r + 6} ${cy + 10} ${cx + r - 8} ${cy - r + 8}`} fill="none" stroke={`url(#lg${gid})`} strokeWidth="1.6" />
      {angles.map((a) => {
        const rad = (a * Math.PI) / 180;
        const x = r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        return (
          <g key={a}>
            <ellipse cx={cx + x} cy={y} rx="3.6" ry="8.5" fill={`url(#lg${gid})`} transform={`rotate(${a + 25} ${cx + x} ${y})`} />
            <ellipse cx={cx - x} cy={y} rx="3.6" ry="8.5" fill={`url(#lg${gid})`} transform={`rotate(${-(a + 25)} ${cx - x} ${y})`} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Imagen con respaldo: prueba cada ruta en orden y usa la primera que cargue.
 * Permite dejar rutas "futuras" (imagenes que aun no se subieron) sin romper la UI.
 */
export function FallbackImg({ srcs, alt = '', className = '' }: { srcs: string[]; alt?: string; className?: string }) {
  const list = srcs.filter(Boolean);
  const [idx, setIdx] = useState(0);
  if (idx >= list.length) return null;
  let src = list[idx];
  try {
    src = encodeURI(decodeURI(src));
  } catch {
    // ruta ya valida
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setIdx((i) => i + 1)}
      draggable={false}
    />
  );
}

/**
 * Estandarte SPQR del menu lateral.
 * Estandarte SPQR del menu lateral (imagen con fondo transparente; si falla, se dibuja con CSS).
 */
export const SPQR_BANNER_IMG = '/Imagenes/Nueva%20UI/ui_estandarte_spqr.webp';

export function SpqrBanner({ className = '' }: { className?: string }) {
  const [imgOk, setImgOk] = useState(true);
  if (imgOk) {
    return (
      <img
        src={SPQR_BANNER_IMG}
        alt="SPQR"
        className={`object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.7)] ${className}`}
        onError={() => setImgOk(false)}
        draggable={false}
      />
    );
  }
  return (
    <div className={`relative w-[112px] h-[128px] ${className}`}>
      {/* Barra superior */}
      <div className="absolute -left-2 -right-2 top-0 h-2 rounded-full bg-[linear-gradient(180deg,#f6e2a8,#a07a3a)] shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
      <div className="absolute -left-3 top-[-2px] w-3 h-3 rounded-full bg-[radial-gradient(circle,#f6e2a8,#8a6328)]" />
      <div className="absolute -right-3 top-[-2px] w-3 h-3 rounded-full bg-[radial-gradient(circle,#f6e2a8,#8a6328)]" />
      {/* Paño con filete dorado */}
      <div
        className="absolute left-0 right-0 top-1.5 bottom-0 bg-[linear-gradient(180deg,#e2b865,#8a6328)]"
        style={{ clipPath: 'polygon(0 0,100% 0,100% 80%,50% 100%,0 80%)' }}
      />
      <div
        className="absolute left-[3px] right-[3px] top-[9px] bottom-[5px] bg-[linear-gradient(180deg,#9b1c1c,#5a0d0d)] flex flex-col items-center pt-2"
        style={{ clipPath: 'polygon(0 0,100% 0,100% 80%,50% 100%,0 80%)' }}
      >
        <div className="relative w-14 h-14 flex items-center justify-center">
          <Laurel className="absolute inset-0 w-full h-full" />
          <span className="font-cinzel text-[18px] font-black text-[#f3dfae] drop-shadow-[0_1px_0_#000]">⚜</span>
        </div>
        <span className="font-cinzel text-[17px] font-black tracking-[0.12em] text-[#f3dfae] drop-shadow-[0_1px_0_#000] -mt-0.5">SPQR</span>
      </div>
    </div>
  );
}
