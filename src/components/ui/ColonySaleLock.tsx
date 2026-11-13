import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Cpu, Factory, Lock, Store, X, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { useOccupationStore } from '../../store/occupationStore';
import { occViewSegment } from '../game/OccupiedPlanetView';

export const COLONY_LISTING_CHANGED_EVENT = 'colony-listing-changed';

const LOCKED_ROUTES = ['buildings', 'resources', 'research', 'shipyard', 'defense', 'fleet'];

interface ActiveColonyListing {
  id: string;
  planet_id: string;
}

export function ColonySaleLock({ children }: { children: React.ReactNode }) {
  const { profile } = useAuthStore();
  const { currentPlanet, planets, fetchPlanets, fetchResources } = useGameStore();
  const location = useLocation();
  const activeOccupationId = useOccupationStore((s) => s.activeOccupationId);
  const [listings, setListings] = useState<ActiveColonyListing[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  useEffect(() => {
    if (!confirmOpen) {
      setConfirmVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setConfirmVisible(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [confirmOpen]);

  const load = useCallback(async () => {
    if (!profile?.id) {
      setListings([]);
      return;
    }
    const { data, error: qErr } = await supabase
      .from('market_listings')
      .select('id, planet_id')
      .eq('seller_id', profile.id)
      .eq('listing_type', 'colony')
      .eq('status', 'active');
    if (!qErr) setListings((data as ActiveColonyListing[]) || []);
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load, currentPlanet?.id]);

  useEffect(() => {
    const onChange = () => {
      load();
      const { currentPlanet: cp } = useGameStore.getState();
      if (profile?.id) fetchPlanets(profile.id);
      if (cp) fetchResources(cp.id);
    };
    window.addEventListener(COLONY_LISTING_CHANGED_EVENT, onChange);
    const interval = setInterval(load, 60000);
    return () => {
      window.removeEventListener(COLONY_LISTING_CHANGED_EVENT, onChange);
      clearInterval(interval);
    };
  }, [load, profile?.id, fetchPlanets, fetchResources]);

  const listing = currentPlanet
    ? listings.find((l) => {
        if (l.planet_id === currentPlanet.id) return true;
        if (currentPlanet.planet_type !== 'moon') return false;
        const colony = planets.find((p) => p.id === l.planet_id);
        return (
          !!colony &&
          colony.galaxy === currentPlanet.galaxy &&
          colony.solar_system === currentPlanet.solar_system &&
          colony.position === currentPlanet.position
        );
      })
    : undefined;

  // [OCUPA3] En modo planeta ocupado la vista no es la del planeta propio en venta
  if (!listing || (activeOccupationId && occViewSegment(location.pathname) !== null)) return <>{children}</>;

  const segment = location.pathname.replace(/\/+$/, '').split('/').pop() || '';
  const lockPage = LOCKED_ROUTES.includes(segment);

  const listedColony = planets.find((p) => p.id === listing.planet_id);

  const handleCancel = async () => {
    if (cancelling || !profile) return;
    setConfirmOpen(false);
    setCancelling(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('cancel_market_listing', {
        p_listing_id: listing.id,
        p_return_planet_id: listing.planet_id,
      });
      if (rpcError) throw rpcError;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        setError(result?.error || 'No se pudo cancelar la venta');
        return;
      }
      window.dispatchEvent(new Event(COLONY_LISTING_CHANGED_EVENT));
    } catch (err) {
      console.error('Error cancelling colony listing:', err);
      setError('No se pudo cancelar la venta');
    } finally {
      setCancelling(false);
    }
  };

  const banner = (
    <div className="rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-950/70 via-orange-900/40 to-amber-950/70 backdrop-blur-sm px-4 py-3">
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Lock className="w-6 h-6 text-amber-400 flex-shrink-0" />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-bold text-amber-200">Colonia en venta: bloqueada</p>
          <p className="text-xs text-amber-100/80">
            Mientras esté en el mercado no puedes construir, investigar, fabricar tropas o defensas ni enviar ejércitos desde o hacia ella.
            La producción está pausada y la IA desactivada. Cancela la venta para volver a usarla.
          </p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            to="/game/market"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-space-700 hover:bg-space-600 text-gray-200 border border-space-500"
          >
            <Store className="w-4 h-4" /> Mercado
          </Link>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={cancelling}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white"
          >
            <XCircle className="w-4 h-4" /> {cancelling ? 'Cancelando...' : 'Cancelar venta'}
          </button>
        </div>
      </div>
      {confirmOpen && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200 ${
            confirmVisible ? 'bg-black/70 backdrop-blur-sm' : 'bg-transparent'
          }`}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className={`w-full max-w-md transform transition-all duration-300 ${
              confirmVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-space-800 border border-amber-500/40 rounded-2xl overflow-hidden shadow-2xl shadow-amber-500/10">
              <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />
              <div className="relative p-5">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-space-700 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-orbitron text-white text-base">Cancelar venta de colonia</h3>
                    {listedColony && (
                      <p className="text-sm text-gray-400">
                        {listedColony.name}{' '}
                        <span className="text-amber-300/80">
                          [{listedColony.galaxy}:{listedColony.solar_system}:{listedColony.position}]
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-300 mb-3">
                  La colonia se retirará del mercado y volverá a estar operativa.
                </p>

                <div className="bg-space-900/80 rounded-xl p-3 border border-space-700 space-y-2 mb-5">
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <Factory className="w-4 h-4 flex-shrink-0" /> La producción se reanuda desde ahora
                  </div>
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Podrás construir, investigar y mover ejércitos
                  </div>
                  <div className="flex items-center gap-2 text-sm text-cyan-300">
                    <Cpu className="w-4 h-4 flex-shrink-0" /> La IA queda apagada; puedes reactivarla tú
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-space-700 hover:bg-space-600 text-gray-300 font-semibold text-sm transition-all"
                  >
                    Mantener en venta
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:text-red-300 font-semibold text-sm transition-all disabled:opacity-50"
                  >
                    Cancelar venta
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
      <div className="rounded-xl border border-amber-500/30 bg-space-800/70 p-8 text-center space-y-3">
        <Lock className="w-12 h-12 text-amber-400 mx-auto" />
        <h2 className="text-lg font-bold text-amber-200">Esta colonia está en venta</h2>
        <p className="text-sm text-gray-300 max-w-md mx-auto">
          No puedes usar esta sección mientras la colonia esté publicada en el mercado. Cambia a otra ciudad o cancela la venta.
        </p>
      </div>
    </>
  );
}
