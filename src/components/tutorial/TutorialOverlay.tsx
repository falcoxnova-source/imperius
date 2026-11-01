/**
 * TutorialOverlay - Guia visual paso a paso para jugadores nuevos.
 *
 * Oscurece la pantalla dejando "iluminado" (y clicable) solo el elemento del paso
 * actual, y muestra una tarjeta con la instruccion. Avanza solo cuando el jugador
 * realiza la accion. Se muestra una unica vez por cuenta.
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, ChevronRight, MousePointerClick } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { useTutorialStore } from '../../store/tutorialStore';
import { useI18n } from '../../lib/i18n';
import { TUTORIAL_STEPS } from './tutorialSteps';

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOT_PADDING = 8;
const CARD_WIDTH = 340;

const LABELS = {
  es: {
    start: 'Empezar',
    next: 'Siguiente',
    finish: 'Finalizar',
    skip: 'Saltar tutorial',
    step: 'Paso',
    of: 'de',
    action: 'Completa la accion para continuar',
  },
  en: {
    start: 'Start',
    next: 'Next',
    finish: 'Finish',
    skip: 'Skip tutorial',
    step: 'Step',
    of: 'of',
    action: 'Complete the action to continue',
  },
} as const;

function sameRect(a: SpotRect | null, b: SpotRect | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * Nivel que tenia el edificio al empezar el paso. Guardado en localStorage para
 * que el objetivo no cambie si el jugador recarga la pagina.
 */
const baselineKey = (userId: string) => `falcox-tutorial-base-${userId}`;

function readBaselines(userId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(baselineKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBaselines(userId: string, values: Record<string, number>) {
  try {
    localStorage.setItem(baselineKey(userId), JSON.stringify(values));
  } catch {
    // almacenamiento no disponible
  }
}

interface TutorialOverlayProps {
  onOpenSidebar: () => void;
}

export function TutorialOverlay({ onOpenSidebar }: TutorialOverlayProps) {
  const { language } = useI18n();
  const { profile } = useAuthStore();
  const buildings = useGameStore((s) => s.buildings);
  const buildingTypes = useGameStore((s) => s.buildingTypes);
  const buildingQueue = useGameStore((s) => s.buildingQueue);
  const { status, step, load, next, finish } = useTutorialStore();
  const location = useLocation();
  const [rect, setRect] = useState<SpotRect | null>(null);
  const [baselines, setBaselines] = useState<Record<string, number>>({});

  const current = TUTORIAL_STEPS[step];
  const labels = LABELS[language];
  const isRunning = status === 'running' && !!current;

  useEffect(() => {
    if (profile) load(profile);
  }, [profile, load]);

  useEffect(() => {
    if (profile) setBaselines(readBaselines(profile.id));
  }, [profile?.id]);

  /** Nivel actual del edificio contando lo que ya esta en cola */
  const levelOf = useCallback(
    (code: string) => {
      const type = buildingTypes.find((b) => b.code === code);
      if (!type) return 0;
      const built = buildings.find((b) => b.building_type_id === type.id)?.level ?? 0;
      const queued = buildingQueue
        .filter((q) => q.building_type_id === type.id)
        .map((q) => q.target_level);
      return Math.max(built, ...queued, 0);
    },
    [buildings, buildingTypes, buildingQueue]
  );

  // Guardamos el nivel de partida del paso para exigir siempre una mejora real
  useEffect(() => {
    if (!isRunning || !profile) return;
    const advance = current.advance;
    if (advance.type !== 'building') return;
    if (baselines[current.id] !== undefined) return;
    // Esperamos a que los datos del planeta esten cargados
    if (buildingTypes.length === 0 || buildings.length === 0) return;
    const updated = { ...baselines, [current.id]: levelOf(advance.code) };
    setBaselines(updated);
    saveBaselines(profile.id, updated);
  }, [isRunning, current, profile, buildings, buildingTypes, levelOf, baselines]);

  /** Nivel que hay que alcanzar en el paso actual */
  const requiredLevel =
    current?.advance.type === 'building'
      ? Math.max(current.advance.level, (baselines[current.id] ?? 0) + 1)
      : 0;

  // Avance automatico cuando el jugador cumple el objetivo del paso
  useEffect(() => {
    if (!isRunning) return;
    const advance = current.advance;
    if (advance.type === 'route' && location.pathname === advance.path) {
      next();
    } else if (advance.type === 'building') {
      // Sin nivel de partida todavia no sabemos que exigir
      if (baselines[current.id] === undefined) return;
      if (levelOf(advance.code) >= requiredLevel) next();
    }
  }, [isRunning, current, location.pathname, levelOf, next, baselines, requiredLevel]);

  // En movil abrimos el menu lateral para que el objetivo sea visible
  useEffect(() => {
    if (!isRunning || !current.requiresSidebar) return;
    if (window.innerWidth < 1024) onOpenSidebar();
  }, [isRunning, current, onOpenSidebar]);

  // Seguimiento de la posicion del elemento resaltado
  useEffect(() => {
    if (!isRunning || !current.target) {
      setRect(null);
      return;
    }
    const selector = current.target;
    const measure = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const nextRect: SpotRect = {
        top: r.top - SPOT_PADDING,
        left: r.left - SPOT_PADDING,
        width: r.width + SPOT_PADDING * 2,
        height: r.height + SPOT_PADDING * 2,
      };
      setRect((prev) => (sameRect(prev, nextRect) ? prev : nextRect));
    };
    measure();
    const interval = setInterval(measure, 200);
    return () => clearInterval(interval);
  }, [isRunning, current]);

  // Llevamos el objetivo a la vista al cambiar de paso
  useEffect(() => {
    if (!isRunning || !current.target) return;
    const selector = current.target;
    const timer = setTimeout(() => {
      document.querySelector(selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 350);
    return () => clearTimeout(timer);
  }, [isRunning, current]);

  if (!isRunning) return null;

  const isFirst = step === 0;
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const isManual = current.advance.type === 'manual';
  const progress = ((step + 1) / TUTORIAL_STEPS.length) * 100;

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : CARD_WIDTH;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  const cardWidth = Math.min(CARD_WIDTH, viewportWidth - 24);

  let cardStyle: CSSProperties;
  if (rect) {
    const left = Math.max(
      12,
      Math.min(rect.left + rect.width / 2 - cardWidth / 2, viewportWidth - cardWidth - 12)
    );
    const spaceBelow = viewportHeight - (rect.top + rect.height);
    cardStyle =
      spaceBelow >= 200
        ? { top: rect.top + rect.height + 12, left, width: cardWidth }
        : { bottom: viewportHeight - rect.top + 12, left, width: cardWidth };
  } else {
    cardStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: cardWidth,
    };
  }

  const card = (
    <div
      className="fixed z-[10000] card-glass rounded-xl border border-cyber-blue/40 shadow-[0_0_30px_rgba(0,200,255,0.25)] p-4"
      style={cardStyle}
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-cyber-blue flex-shrink-0" />
        <h3 className="font-orbitron text-sm text-white leading-tight">
          {current.title[language]}
        </h3>
      </div>

      <p className="text-xs text-gray-300 leading-relaxed mb-3">
        {current.text[language].replace('{level}', String(requiredLevel))}
      </p>

      {!isManual && (
        <div className="flex items-center gap-2 mb-3 text-[11px] text-cyber-blue">
          <MousePointerClick className="w-3.5 h-3.5 animate-pulse flex-shrink-0" />
          <span>{labels.action}</span>
        </div>
      )}

      <div className="h-1 rounded-full bg-space-700 overflow-hidden mb-2">
        <div
          className="h-full bg-cyber-blue transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-500">
          {labels.step} {step + 1} {labels.of} {TUTORIAL_STEPS.length}
        </span>
        <div className="flex items-center gap-2">
          {!isLast && (
            <button
              onClick={finish}
              className="text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
            >
              {labels.skip}
            </button>
          )}
          {isManual && (
            <button
              onClick={isLast ? finish : next}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-cyber-blue hover:bg-cyber-blue/80 text-white text-xs font-semibold transition-colors"
            >
              {isLast ? labels.finish : isFirst ? labels.start : labels.next}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (!rect) {
    return (
      <>
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-[2px]" />
        {card}
      </>
    );
  }

  return (
    <>
      {/* Cuatro paneles que dejan un "hueco" clicable sobre el elemento destacado */}
      <div className="fixed left-0 right-0 top-0 z-[9998] bg-black/70" style={{ height: Math.max(0, rect.top) }} />
      <div className="fixed left-0 right-0 bottom-0 z-[9998] bg-black/70" style={{ top: rect.top + rect.height }} />
      <div className="fixed left-0 z-[9998] bg-black/70" style={{ top: rect.top, height: rect.height, width: Math.max(0, rect.left) }} />
      <div className="fixed right-0 z-[9998] bg-black/70" style={{ top: rect.top, height: rect.height, left: rect.left + rect.width }} />
      <div
        className="fixed z-[9999] pointer-events-none rounded-lg border-2 border-cyber-blue animate-pulse-glow"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />
      {card}
    </>
  );
}
