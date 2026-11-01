import { useCallback, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Flag, Lock, Swords } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { useOccupationStore } from '../../store/occupationStore';
import { useI18n } from '../../lib/i18n';
import { OccupiedPlanetView, occViewSegment, isOccNeutralRoute } from '../game/OccupiedPlanetView';

export const OCCUPATION_CHANGED_EVENT = 'occupation-changed';

const LOCKED_ROUTES = ['buildings', 'resources', 'research', 'shipyard', 'defense', 'fleet'];

export function OccupationLock({ children }: { children: React.ReactNode }) {
  const { profile } = useAuthStore();
  const { currentPlanet, planets, selectPlanet } = useGameStore();
  const { asOwner: occupied, load: loadOccupations, reset, activeOccupationId, exit: exitOccupation } = useOccupationStore();
  const { language } = useI18n();
  const location = useLocation();
  const switchingRef = useRef(false);
  const es = language === 'es';

  const load = useCallback(async () => {
    if (!profile?.id) {
      reset();
      return;
    }
    await loadOccupations();
    // [OCUPA3] Mantener sincronizado el planeta ocupado seleccionado
    const st = useOccupationStore.getState();
    if (st.activeOccupationId) st.refreshActive();
  }, [profile?.id, loadOccupations, reset]);

  useEffect(() => {
    load();
  }, [load, currentPlanet?.id]);

  useEffect(() => {
    window.addEventListener(OCCUPATION_CHANGED_EVENT, load);
    const interval = setInterval(load, 60000);
    return () => {
      window.removeEventListener(OCCUPATION_CHANGED_EVENT, load);
      clearInterval(interval);
    };
  }, [load]);

  const occ = currentPlanet ? occupied.find((o) => o.planet_id === currentPlanet.id) : undefined;

  // [OCUPA2] El dueño no puede "entrar" a su colonia ocupada: se le lleva a un planeta libre
  useEffect(() => {
    if (!occ || switchingRef.current) return;
    const occupiedIds = new Set(occupied.map((o) => o.planet_id));
    const target = planets.find((p) => p.is_main_planet && !occupiedIds.has(p.id))
      || planets.find((p) => !occupiedIds.has(p.id));
    if (!target) return;
    switchingRef.current = true;
    selectPlanet(target.id).finally(() => {
      switchingRef.current = false;
    });
  }, [occ, occupied, planets, selectPlanet]);

  // [OCUPA3] Modo planeta ocupado (ocupante): se sale al ir a secciones que dependen del planeta propio
  const occSegment = occViewSegment(location.pathname);
  useEffect(() => {
    if (activeOccupationId && occSegment === null && !isOccNeutralRoute(location.pathname)) {
      exitOccupation();
    }
  }, [activeOccupationId, occSegment, location.pathname, exitOccupation]);

  if (activeOccupationId && occSegment !== null) {
    return <OccupiedPlanetView segment={occSegment} />;
  }

  if (!occ) return <>{children}</>;

  const segment = location.pathname.replace(/\/+$/, '').split('/').pop() || '';
  const lockPage = LOCKED_ROUTES.includes(segment);
  const coords = `[${occ.galaxy}:${occ.solar_system}:${occ.position}]`;

  const banner = (
    <div className="rounded-lg border border-red-500/40 bg-gradient-to-r from-red-950/70 via-rose-900/40 to-red-950/70 backdrop-blur-sm px-4 py-3">
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Flag className="w-6 h-6 text-red-400 flex-shrink-0" />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-bold text-red-200">
            {es
              ? `Colonia ocupada por ${occ.occupier_name || 'otro jugador'} ${coords}`
              : `Colony occupied by ${occ.occupier_name || 'another player'} ${coords}`}
          </p>
          <p className="text-xs text-red-100/80">
            {es
              ? 'Tus colas de construcción y barraca están congeladas y el ocupante se queda con la producción. Recupérala atacando la guarnición desde otro planeta (en solitario o con un SAC creado por ti).'
              : 'Your building and shipyard queues are frozen and the occupier takes the production. Recover it by attacking the garrison from another planet (solo or with an ACS you create).'}
          </p>
        </div>
        <Link
          to="/game/occupations"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 hover:bg-red-500 text-white flex-shrink-0"
        >
          <Swords className="w-4 h-4" /> {es ? 'Recuperar' : 'Recover'}
        </Link>
      </div>
    </div>
  );

  if (!lockPage) {
    return (
      <>
        {banner}
        {children}
      </>
    );
  }

  return (
    <>
      {banner}
      <div className="rounded-xl border border-red-500/30 bg-space-800/70 p-8 text-center space-y-3">
        <Lock className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-lg font-bold text-red-200">{es ? 'Esta colonia está ocupada' : 'This colony is occupied'}</h2>
        <p className="text-sm text-gray-300 max-w-md mx-auto">
          {es
            ? 'No puedes usar esta sección mientras la colonia esté ocupada. Cambia a otro planeta para preparar la recuperación.'
            : 'You cannot use this section while the colony is occupied. Switch to another planet to prepare the recovery.'}
        </p>
      </div>
    </>
  );
}
