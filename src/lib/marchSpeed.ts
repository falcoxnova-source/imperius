// Velocidad de marcha (solo presentacion). La velocidad real de la BD se usa
// sin cambios en todos los calculos; aqui solo se escala para mostrarla como
// millas romanas por dia. El factor es unico para todas las tropas, asi que las
// comparaciones entre tropas siguen siendo exactas.
const MARCH_DIVISOR = 500;

export function marchMiles(speed: number): number {
  return (Number(speed) || 0) / MARCH_DIVISOR;
}

export function formatMarch(speed: number, lang: string = 'es'): string {
  const miles = marchMiles(speed);
  const unit = lang === 'en' ? 'mi/day' : 'millas/día';
  if (miles <= 0) return '—';
  if (miles < 0.1) return `<0,1 ${unit}`;
  if (miles < 10) return `${miles.toLocaleString('es-ES', { maximumFractionDigits: 1 })} ${unit}`;
  if (miles >= 1_000_000) return `${(miles / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}M ${unit}`;
  if (miles >= 10_000) return `${Math.round(miles / 1000).toLocaleString('es-ES')}K ${unit}`;
  return `${Math.round(miles).toLocaleString('es-ES')} ${unit}`;
}

export function marchPace(speed: number, lang: string = 'es'): { icon: string; label: string; color: string } {
  const miles = marchMiles(speed);
  const en = lang === 'en';
  if (miles <= 0) return { icon: '🏛️', label: en ? 'Stationary' : 'Inmóvil', color: 'text-stone-400' };
  if (miles < 1) return { icon: '🐢', label: en ? 'Siege' : 'Asedio', color: 'text-stone-300' };
  if (miles < 9) return { icon: '🐂', label: en ? 'Slow' : 'Lenta', color: 'text-amber-300' };
  if (miles < 22) return { icon: '🚶', label: en ? 'On foot' : 'A pie', color: 'text-emerald-300' };
  if (miles < 50) return { icon: '🐎', label: en ? 'Mounted' : 'A caballo', color: 'text-sky-300' };
  return { icon: '🦅', label: en ? 'Swift' : 'Veloz', color: 'text-violet-300' };
}
