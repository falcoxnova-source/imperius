import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, Rocket } from 'lucide-react';
import { CASINO_COORDS, CasinoStatus, fetchCasinoStatus } from '../../lib/casino';

// [CASINOGATE1] Mesas del Casino (Loteria/Rifa): requieren Nave Insignia estacionada.
// La regla real la aplica el servidor (_casino_games_gate); esto solo evita mostrar la mesa.
export function CasinoGameGate({ title, children }: { title: string; children: ReactNode }) {
  const [status, setStatus] = useState<CasinoStatus | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetchCasinoStatus().then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);

  if (status === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" />
      </div>
    );
  }

  if (!status?.games_require_dock || status.can_enter) return <>{children}</>;

  const coords = `[${CASINO_COORDS.galaxy}:${CASINO_COORDS.system}:${CASINO_COORDS.position}]`;
  return (
    <div className="max-w-xl mx-auto mt-10 rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-[#1a0526] via-[#0b0a1f] to-[#241002] p-8 text-center shadow-lg shadow-fuchsia-900/30">
      <div className="w-16 h-16 mx-auto rounded-full bg-amber-400/15 border border-amber-400/40 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-amber-300" />
      </div>
      <h1 className="font-orbitron text-xl font-bold text-white mb-2">{title} — Casino Galáctico</h1>
      <p className="text-amber-200 font-semibold">Para participar debes tener tu Héroe Imperial acuartelado en el planeta del Casino {coords}.</p>
      <p className="text-xs text-slate-400 mt-2">Envía tu Héroe Imperial desde el Casino y, cuando esté acuartelado, las mesas se abrirán.</p>
      <Link
        to="/game/casino"
        className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl font-bold text-sm text-black bg-gradient-to-r from-amber-300 via-fuchsia-400 to-cyan-300 hover:opacity-90"
      >
        <Rocket className="w-4 h-4" /> Ir al Casino Galáctico
      </Link>
    </div>
  );
}
