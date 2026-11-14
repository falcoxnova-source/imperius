import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Swords, Crown, Users, Gift, ChevronRight, Clock, Hammer } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { useI18n, translateBuildingName, translateShipName, getBuildingImage, getShipImage } from '../../lib/i18n';
import { formatNumber, formatTimeRemaining } from '../../lib/utils';
import { getUserRank, getRankProgress } from '../../lib/ranks';
import { Laurel, FallbackImg } from '../ui/RomanOrnaments';

// Imagenes del Inicio. La primera ruta de cada lista es la imagen definitiva (pendiente de subir);
// mientras no exista se usa la siguiente.
export const HOME_IMG = {
  banner: ['/Imagenes/Nueva UI/ui_panorama.webp', '/Imagenes/Defensas/Ciudadela romana sobre las nubes_11zon.webp'],
  emblem: '/Imagenes/Nueva UI/ui_emblema_imperium.webp',
  city: ['/Imagenes/Visuales/inicio_ciudad.webp', '/Imagenes/Visuales/overview_city.webp'],
  promo: ['/Imagenes/Nueva UI/Centurión romano ante la ciudad dorada.webp', '/Imagenes/Barraca/Legionario romano en batalla épica.webp'],
  alliance: ['/Imagenes/Visuales/inicio_alianza.webp'],
  event: ['/Imagenes/Visuales/inicio_evento.webp'],
};

/** Encabezado de panel: icono dorado + titulo + boton a la derecha */
export function RmPanelHead({ icon, title, action, onAction }: { icon: React.ReactNode; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="rm-head">
      <span className="rm-icon-sq w-9 h-9">{icon}</span>
      <h2 className="rm-title flex-1 min-w-0 truncate">{title}</h2>
      {action && (
        <button onClick={onAction} className="rm-btn flex-shrink-0">
          {action}
        </button>
      )}
    </div>
  );
}

/** Insignia numerica dentro de una corona de laurel */
export function LaurelBadge({ value, size = 'md' }: { value: number | string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';
  const text = size === 'sm' ? 'text-base' : 'text-xl';
  return (
    <div className={`relative ${box} flex items-center justify-center flex-shrink-0`}>
      <Laurel className="absolute inset-0 w-full h-full" />
      <span className={`relative font-cinzel font-black ${text} text-[#f6e2a8] drop-shadow-[0_1px_0_#000]`}>{value}</span>
    </div>
  );
}

/** Banner panoramico con el emblema IMPERIUM abajo a la izquierda */
export function ImperiumBanner() {
  const [emblemOk, setEmblemOk] = useState(true);
  return (
    <div className="card-glass overflow-hidden !p-0">
      <div className="relative w-full aspect-[2172/343] min-h-[120px] overflow-hidden">
        <FallbackImg srcs={HOME_IMG.banner} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,6,4,0.55)_0%,rgba(8,6,4,0)_40%),linear-gradient(180deg,rgba(0,0,0,0)_60%,rgba(8,6,4,0.6)_100%)] pointer-events-none" />
        {emblemOk ? (
          <img
            src={encodeURI(HOME_IMG.emblem)}
            alt="Imperium"
            onError={() => setEmblemOk(false)}
            draggable={false}
            className="absolute left-[1.5%] bottom-[4%] w-[46%] sm:w-[34%] max-w-[420px] drop-shadow-[0_6px_14px_rgba(0,0,0,0.85)]"
          />
        ) : (
          <div className="absolute left-4 bottom-3 px-6 py-2 bg-black/80 border border-[#d6aa55]">
            <span className="font-cinzel text-2xl sm:text-4xl font-black tracking-[0.18em] text-[#f3dfae]">IMPERIUM</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Panel "Produccion y Edificios": los edificios del planeta con nivel, barra y tiempo */
export function BuildingsPanel() {
  const { buildings, buildingQueue } = useGameStore();
  const { t } = useI18n();
  const navigate = useNavigate();

  const list = [...buildings]
    .filter((b) => b.level > 0 || b.is_upgrading)
    .sort((a, b) => Number(b.is_upgrading) - Number(a.is_upgrading) || b.level - a.level)
    .slice(0, 5);
  const maxLevel = Math.max(1, ...list.map((b) => b.level));

  return (
    <div className="card-glass overflow-hidden">
      <RmPanelHead icon={<Building2 className="w-5 h-5" strokeWidth={1.6} />} title="Producción y Edificios" action="Gestionar" onAction={() => navigate('/game/buildings')} />
      <div className="p-3 sm:p-4">
        {list.length === 0 ? (
          <p className="text-center text-[#e9d6a6]/60 py-6 text-sm">Aún no hay edificios construidos.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {list.map((b) => {
              const code = b.building_type?.code || '';
              const name = translateBuildingName(t, code, b.building_type?.name || code);
              const queued = buildingQueue.find((q) => q.building_type_id === b.building_type_id && q.queue_position === 1);
              const end = b.upgrade_end_time || queued?.end_time;
              let pct = Math.round((b.level / maxLevel) * 100);
              if (queued?.start_time && queued?.end_time) {
                const s = new Date(queued.start_time).getTime();
                const e = new Date(queued.end_time).getTime();
                pct = e > s ? Math.min(100, Math.max(0, ((Date.now() - s) / (e - s)) * 100)) : 100;
              }
              const img = getBuildingImage(code, b.building_type?.image_url) || '';
              return (
                <button key={b.id} onClick={() => navigate('/game/buildings')} className="rm-tile text-left group">
                  <div className="relative h-24 sm:h-28">
                    <FallbackImg key={img} srcs={[img]} alt={name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_40%,rgba(8,6,4,0.95)_100%)]" />
                    <span className="absolute left-2 bottom-1.5 right-2 font-cinzel text-[12px] sm:text-[13px] font-bold text-[#f3dfae] truncate drop-shadow-[0_1px_0_#000]">{name}</span>
                  </div>
                  <div className="px-2 py-2 space-y-1.5 bg-[linear-gradient(180deg,#120d08,#080604)]">
                    <div className="flex items-center gap-1.5">
                      <span className="rm-icon-sq w-5 h-5"><Hammer className="w-3 h-3" /></span>
                      <span className="font-cinzel text-[11px] font-semibold text-[#e9d6a6]">Nivel {b.level}</span>
                    </div>
                    <div className="rm-bar !h-1.5"><span className="bg-[linear-gradient(90deg,#15803d,#4ade80)]" style={{ width: `${pct}%` }} /></div>
                    <div className="flex items-center gap-1 text-[10px] text-[#e9d6a6]/70">
                      <Clock className="w-3 h-3" />
                      <span className="font-mono">{end ? formatTimeRemaining(end) : '—'}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const ARMY_BAR = [
  'bg-[linear-gradient(90deg,#15803d,#4ade80)]',
  'bg-[linear-gradient(90deg,#1d4ed8,#60a5fa)]',
  'bg-[linear-gradient(90deg,#a16207,#facc15)]',
  'bg-[linear-gradient(90deg,#6d28d9,#c084fc)]',
];

/** Panel "Ejercito": las tropas con mas unidades del planeta */
export function ArmyPanel() {
  const { ships } = useGameStore();
  const { t } = useI18n();
  const navigate = useNavigate();

  const list = ships
    .filter((s) => s.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 4);
  const maxQty = Math.max(1, ...list.map((s) => s.quantity));

  return (
    <div className="card-glass overflow-hidden">
      <RmPanelHead icon={<Swords className="w-5 h-5" strokeWidth={1.6} />} title="Ejército" action="Gestionar" onAction={() => navigate('/game/shipyard')} />
      <div className="p-3 sm:p-4">
        {list.length === 0 ? (
          <p className="text-center text-[#e9d6a6]/60 py-6 text-sm">No hay tropas en esta ciudad.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {list.map((s, i) => {
              const code = s.ship_type?.code || '';
              const name = translateShipName(t, code, s.ship_type?.name || code);
              const img = getShipImage(code, s.ship_type?.image_url) || '';
              return (
                <button key={s.id} onClick={() => navigate('/game/shipyard')} className="rm-tile text-left group">
                  <div className="relative h-28 sm:h-32">
                    <FallbackImg key={img} srcs={[img]} alt={name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,6,4,0.75)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,0)_55%,rgba(8,6,4,0.95)_100%)]" />
                    <span className="absolute left-2 top-1.5 right-2 font-cinzel text-[12px] sm:text-[13px] font-bold text-[#f3dfae] truncate drop-shadow-[0_1px_0_#000]">{name}</span>
                    <span className="absolute left-2 bottom-1.5 font-cinzel text-base sm:text-lg font-black text-white drop-shadow-[0_1px_0_#000]">{s.quantity.toLocaleString('es-ES')}</span>
                  </div>
                  <div className="px-2 py-2 bg-[linear-gradient(180deg,#120d08,#080604)]">
                    <div className="rm-bar !h-1.5"><span className={ARMY_BAR[i % ARMY_BAR.length]} style={{ width: `${(s.quantity / maxQty) * 100}%` }} /></div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Panel "Circulo de Ciudadano": rango del jugador y sus puntos */
export function CitizenPanel() {
  const { profile } = useAuthStore();
  const { t } = useI18n();
  const points = profile?.points_total || 0;
  const rank = getUserRank(points);
  const progress = getRankProgress(points);
  const rankName = t.ranks[rank.key as keyof typeof t.ranks] || rank.key;

  const rows: { label: string; value: string }[] = [
    { label: 'Poder', value: points.toLocaleString('es-ES') },
    { label: 'Ranking', value: `#${profile?.rank_position || '-'}` },
    { label: t.ranking.fleetRanking, value: (profile?.points_fleet || 0).toLocaleString('es-ES') },
    { label: 'Defensa', value: (profile?.points_defense || 0).toLocaleString('es-ES') },
    { label: 'TUNG', value: formatNumber(Number(profile?.tung_balance) || 0) },
  ];

  return (
    <div className="card-glass overflow-hidden">
      <RmPanelHead icon={<Crown className="w-5 h-5" strokeWidth={1.6} />} title="Círculo de Ciudadano" />
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <LaurelBadge value={rank.level} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-cinzel text-sm font-bold text-[#f3dfae] truncate">{rankName}</span>
              <span className="font-cinzel text-xs text-[#e9d6a6]/80 flex-shrink-0">Nivel {rank.level}</span>
            </div>
            <div className="rm-bar mt-1.5"><span className="bg-[linear-gradient(90deg,#1e3a8a,#3b82f6,#93c5fd)]" style={{ width: `${progress}%` }} /></div>
            <span className="text-[10px] text-[#e9d6a6]/60">{Math.round(progress)}%</span>
          </div>
        </div>
        <div className="rm-divider" />
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5">
              <Laurel className="w-6 h-6 flex-shrink-0" />
              <span className="font-cinzel text-[13px] text-[#e9d6a6] flex-1 truncate">{r.label}</span>
              <span className="font-cinzel text-[13px] font-bold text-[#f6e2a8]">{r.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Tarjeta promocional con el legionario */
export function PromoCard() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate('/game/alliance')} className="card-glass overflow-hidden !p-0 w-full text-left group">
      <div className="relative aspect-[16/10]">
        <FallbackImg srcs={HOME_IMG.promo} className="absolute inset-0 w-full h-full object-cover object-left group-hover:scale-105 transition-transform duration-700" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0)_35%,rgba(8,6,4,0.55)_100%),linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(8,6,4,0.85)_100%)]" />
        <div className="absolute right-3 bottom-3 w-[58%] flex flex-col items-center text-center">
          <p className="font-cinzel text-[12px] sm:text-sm font-bold uppercase leading-snug text-[#f3dfae] drop-shadow-[0_2px_2px_rgba(0,0,0,0.95)]">
            Un gran imperio no se construye solo, <span className="text-[#e2b865]">se conquista juntos.</span>
          </p>
          <Laurel className="w-8 h-8 mt-1" />
        </div>
      </div>
    </button>
  );
}

/** Fila de acceso rapido (Alianza / Evento Especial) */
export function LinkRow({ icon, imgs, title, subtitle, to }: { icon: React.ReactNode; imgs?: string[]; title: string; subtitle: string; to: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)} className="card-glass w-full flex items-center gap-3 p-3 text-left group hover:brightness-110 transition">
      <span className="rm-icon-sq w-12 h-12 overflow-hidden relative">
        {icon}
        {imgs && imgs.length > 0 && <FallbackImg srcs={imgs} className="absolute inset-0 w-full h-full object-cover" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-cinzel text-sm font-bold uppercase tracking-wide text-[#f3dfae] truncate">{title}</span>
        <span className="block text-xs text-[#e9d6a6]/75 truncate">{subtitle}</span>
      </span>
      <ChevronRight className="w-5 h-5 text-[#d6aa55] group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
    </button>
  );
}

export function HomeSideLinks() {
  return (
    <>
      <LinkRow icon={<Users className="w-6 h-6" strokeWidth={1.6} />} imgs={HOME_IMG.alliance} title="Alianza" subtitle="Los valientes siempre avanzan." to="/game/alliance" />
      <LinkRow icon={<Gift className="w-6 h-6" strokeWidth={1.6} />} imgs={HOME_IMG.event} title="Evento Especial" subtitle="Rifas, lotería y premios del imperio." to="/game/casino" />
    </>
  );
}
