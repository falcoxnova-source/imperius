import { supabase } from './supabase';

// [IDLE10] Cierre de sesion automatico tras 10 minutos sin actividad del usuario.
// Necesario porque supabase-js refresca el token solo cada ~8.5 min, lo que
// mantendria viva la sesion en GoTrue aunque el jugador no toque nada.
const IDLE_LIMIT_MS = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;
const STORAGE_KEY = 'xnova_last_activity';

const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'wheel',
  'touchstart',
  'touchmove',
  'scroll',
] as const;

let started = false;
let loggingOut = false;

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  } catch {
    return Date.now();
  }
}

function writeLastActivity(ts: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    /* almacenamiento no disponible */
  }
}

async function forceLogout() {
  if (loggingOut) return;
  loggingOut = true;
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignorar: igual redirigimos */
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignorar */
  }
  if (window.location.pathname !== '/login') {
    window.location.href = '/login?expired=1';
  }
}

export function startIdleLogout(): () => void {
  if (typeof window === 'undefined' || started) return () => {};
  started = true;
  loggingOut = false;

  // Throttle: solo escribimos en localStorage una vez cada 5s.
  let lastWrite = 0;
  const markActivity = () => {
    const now = Date.now();
    if (now - lastWrite < 5000) return;
    lastWrite = now;
    writeLastActivity(now);
  };

  writeLastActivity(Date.now());

  ACTIVITY_EVENTS.forEach(evt =>
    window.addEventListener(evt, markActivity, { passive: true })
  );

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Al volver a la pestana comprobamos de inmediato, sin renovar el contador.
      void check();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const check = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    if (Date.now() - readLastActivity() > IDLE_LIMIT_MS) {
      await forceLogout();
    }
  };

  const timer = window.setInterval(() => {
    void check();
  }, CHECK_INTERVAL_MS);

  return () => {
    started = false;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, markActivity));
  };
}
