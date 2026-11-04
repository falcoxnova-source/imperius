/**
 * [OCUPA3] Vista del planeta ocupado para el ocupante.
 * Cuando el ocupante selecciona un planeta ocupado en el selector, las secciones
 * Visión general / Edificios / Recursos / Investigación / Hangar / Defensa / Flota
 * muestran ese planeta "como si fuera suyo", con las limitaciones del servidor:
 * - Edificios: solo lectura (la tecnología es del dueño).
 * - Investigación: bloqueada mientras dure la ocupación.
 * - Hangar / Defensa: producción normal (occupation_build).
 * - Flota: transporte de recursos a tus planetas (occupation_transport).
 * Toda la validación se hace en el servidor (RPCs del ocupante).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Building2, CheckCircle, Clock, Factory, Flag, Globe, Info, Loader2, Lock, LogOut,
  Microscope, Rocket, Send, Shield, Sun, Swords, TrendingUp, Truck, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import {
  useOccupationStore, liveOccResources,
  type OccBuildOption, type OccQueueItem,
} from '../../store/occupationStore';
import { useI18n, translateBuildingName, translateShipName, translateDefenseName } from '../../lib/i18n';
import { formatCoordinates, formatNumber, formatTime, getPlanetImage } from '../../lib/utils';
import { MediaDisplay } from '../ui/MediaDisplay';

// Rutas que se muestran con el planeta ocupado ('' = visión general)
const OCC_VIEW_RE = /^\/game(?:\/(buildings|resources|research|shipyard|defense|fleet))?$/;
// Rutas independientes del planeta: el modo se conserva al visitarlas
const OCC_NEUTRAL_RE = /^\/game\/(chat|messages|ranking|hall-of-fame|records|top-battles|forum|settings|occupations|requirements)(\/.*)?$/;

export function occViewSegment(pathname: string): string | null {
  const m = pathname.replace(/\/+$/, '').match(OCC_VIEW_RE);
  return m ? (m[1] || '') : null;
}

export function isOccNeutralRoute(pathname: string): boolean {
  return OCC_NEUTRAL_RE.test(pathname.replace(/\/+$/, ''));
}

const MOON_ONLY = new Set(['lunar_base', 'sensor_phalanx', 'jump_gate']);
const MAX_BUILD = 10000;

type Msg = { type: 'success' | 'error'; text: string } | null;
type Res = { metal: number; crystal: number; deuterium: number };

function maxAffordable(opt: OccBuildOption, res: Res) {
  const lim = [
    opt.metal_cost > 0 ? Math.floor(res.metal / opt.metal_cost) : Infinity,
    opt.crystal_cost > 0 ? Math.floor(res.crystal / opt.crystal_cost) : Infinity,
    opt.deuterium_cost > 0 ? Math.floor(res.deuterium / opt.deuterium_cost) : Infinity,
  ];
  const m = Math.min(...lim, MAX_BUILD);
  return Number.isFinite(m) ? Math.max(1, m) : 1;
}

function CostItem({ label, value, available }: { label: string; value: number; available: number }) {
  const ok = available >= value;
  return (
    <div className={`bg-space-700/50 rounded-lg p-1.5 sm:p-2 text-center ${ok ? '' : 'ring-1 ring-red-500/30 bg-red-500/5'}`}>
      <p className="text-[9px] sm:text-xs text-gray-500 truncate">{label}</p>
      <p className={`text-[11px] sm:text-sm font-semibold truncate ${ok ? 'text-white' : 'text-cyber-red'}`}>{formatNumber(value)}</p>
    </div>
  );
}

interface BuildCardProps {
  opt: OccBuildOption;
  label: string;
  owned: number;
  inQueue: number;
  stats: { label: string; value: number }[];
  qty: number;
  res: Res;
  busy: boolean;
  disabled: boolean;
  accent: 'orange' | 'green';
  icon: typeof Rocket;
  onQty: (q: number) => void;
  onBuild: () => void;
}

function BuildCard({ opt, label, owned, inQueue, stats, qty, res, busy, disabled, accent, icon: Icon, onQty, onBuild }: BuildCardProps) {
  const { t, language } = useI18n();
  const es = language === 'es';
  const total = { metal: opt.metal_cost * qty, crystal: opt.crystal_cost * qty, deuterium: opt.deuterium_cost * qty };
  const canPay = res.metal >= total.metal && res.crystal >= total.crystal && res.deuterium >= total.deuterium;
  const accentText = accent === 'orange' ? 'text-cyber-orange' : 'text-cyber-green';
  const set = (q: number) => onQty(Math.min(MAX_BUILD, Math.max(1, Math.floor(q) || 1)));

  return (
    <div className={`card-glass overflow-hidden rounded-2xl ${opt.available ? '' : 'opacity-60'}`}>
      <div className="relative w-full aspect-[4/3] sm:aspect-square bg-gradient-to-br from-space-700 via-space-800 to-space-900 overflow-hidden">
        {opt.image_url ? (
          <MediaDisplay src={opt.image_url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-24 h-24 text-space-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-space-900/90 via-transparent to-transparent" />
        <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 bg-space-900/80 backdrop-blur-sm px-2 py-1 sm:px-3 sm:py-1.5 rounded-full">
          <span className={`font-orbitron text-[10px] sm:text-sm ${accentText}`}>{formatNumber(owned)}</span>
          {inQueue > 0 && <span className="text-[9px] sm:text-xs text-gray-400 ml-1">(+{formatNumber(inQueue)})</span>}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4">
          <h3 className="font-orbitron text-[11px] sm:text-lg truncate text-white">{label}</h3>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        {stats.length > 0 && (
          <div className={`grid gap-1 sm:gap-2 text-center text-[10px] sm:text-sm ${stats.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
            {stats.map((s) => (
              <div key={s.label} className="bg-space-700/50 rounded-lg p-1 sm:p-2">
                <p className="text-gray-500 text-[9px] sm:text-xs">{s.label}</p>
                <p className="text-white font-semibold truncate">{formatNumber(s.value)}</p>
              </div>
            ))}
          </div>
        )}

        {!opt.available ? (
          <div className="text-xs sm:text-sm text-cyber-orange flex items-center gap-2">
            <Lock className="w-4 h-4 flex-shrink-0" />
            {es ? 'Requisitos no cumplidos en este planeta' : 'Requirements not met on this planet'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              <CostItem label={t.resources.metal} value={total.metal} available={res.metal} />
              <CostItem label={t.resources.crystal} value={total.crystal} available={res.crystal} />
              <CostItem label={t.resources.deuterium} value={total.deuterium} available={res.deuterium} />
            </div>

            <div className="flex items-center justify-center gap-1 flex-wrap">
              {[-10, -1].map((d) => (
                <button key={d} onClick={() => set(qty + d)} className="px-2 py-1.5 bg-space-700 rounded-lg hover:bg-space-600 text-xs text-gray-300 font-medium">{d}</button>
              ))}
              <input
                type="number"
                min={1}
                max={MAX_BUILD}
                value={qty}
                onChange={(e) => set(parseInt(e.target.value) || 1)}
                className="w-16 text-center bg-space-800 border border-cyber-blue/30 rounded-lg py-1.5 text-white text-sm"
              />
              {[1, 10].map((d) => (
                <button key={d} onClick={() => set(qty + d)} className="px-2 py-1.5 bg-space-700 rounded-lg hover:bg-space-600 text-xs text-gray-300 font-medium">+{d}</button>
              ))}
              <button onClick={() => set(maxAffordable(opt, res))} className="px-2 py-1.5 bg-cyber-blue/20 text-cyber-blue rounded-lg hover:bg-cyber-blue/30 text-xs font-medium">MAX</button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-space-700">
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Clock className="w-4 h-4" />
                {formatTime(opt.unit_time * qty)}
              </div>
              <button
                onClick={onBuild}
                disabled={disabled || !canPay}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                  disabled || !canPay
                    ? 'bg-space-700 text-gray-500 cursor-not-allowed'
                    : accent === 'orange'
                      ? 'bg-cyber-orange text-white hover:bg-cyber-orange/80'
                      : 'bg-cyber-green text-space-900 hover:bg-cyber-green/80'
                }`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : canPay ? (es ? 'Construir' : 'Build') : (es ? 'Sin recursos' : 'No resources')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PageTitle({ icon: Icon, color, title, right }: { icon: typeof Rocket; color: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <h1 className="font-orbitron text-xl sm:text-2xl text-white flex items-center gap-2 sm:gap-3">
        <Icon className={`w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0 ${color}`} />
        {title}
      </h1>
      {right && <div className="text-sm text-gray-400">{right}</div>}
    </div>
  );
}

export function OccupiedPlanetView({ segment }: { segment: string }) {
  const { t, language } = useI18n();
  const es = language === 'es';
  const tx = (a: string, b: string) => (es ? a : b);
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { shipTypes, defenseTypes, fetchShipTypes, fetchDefenseTypes, fetchFleets } = useGameStore();
  const {
    activeOccupationId, activeDetail: detail, activeView: view, activeFetchedAt,
    refreshActive, exit, load,
  } = useOccupationStore();

  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [tShips, setTShips] = useState<Record<number, number>>({});
  const [tMetal, setTMetal] = useState(0);
  const [tCrystal, setTCrystal] = useState(0);
  const [tDeut, setTDeut] = useState(0);
  const [tTarget, setTTarget] = useState('');
  const [tSpeed, setTSpeed] = useState(100);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  // [OCCATK1] ataque desde el planeta ocupado
  const [aShips, setAShips] = useState<Record<number, number>>({});
  const [aG, setAG] = useState(1);
  const [aS, setAS] = useState(1);
  const [aP, setAP] = useState(1);
  const [aType, setAType] = useState<'planet' | 'moon'>('planet');
  const [aSpeed, setASpeed] = useState(100);

  useEffect(() => {
    refreshActive();
  }, [segment, refreshActive]);

  useEffect(() => {
    if (shipTypes.length === 0) fetchShipTypes();
    if (defenseTypes.length === 0) fetchDefenseTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Al cambiar de planeta ocupado, limpiar formularios
  useEffect(() => {
    setQtys({});
    setTShips({});
    setTMetal(0); setTCrystal(0); setTDeut(0);
    setTTarget('');
    setConfirmAbandon(false);
    setAShips({});
  }, [activeOccupationId]);

  useEffect(() => {
    if (!detail) return;
    setTTarget((cur) => (cur && detail.transport_targets.some((x) => x.id === cur) ? cur : detail.transport_targets[0]?.id || ''));
  }, [detail]);

  // Refrescar cuando termina una unidad de la cola
  const nextQueueEnd = useMemo(() => {
    if (!detail?.queue.length) return null;
    const q = detail.queue[0];
    return new Date(q.start_time).getTime() + (q.quantity_done + 1) * q.unit_time * 1000;
  }, [detail]);

  useEffect(() => {
    if (!nextQueueEnd) return;
    const ms = nextQueueEnd - Date.now();
    const timer = setTimeout(() => refreshActive(), Math.max(1500, ms + 1500));
    return () => clearTimeout(timer);
  }, [nextQueueEnd, refreshActive]);

  const flash = (m: Msg) => {
    setMsg(m);
    if (m) setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 6000);
  };

  if (!detail) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
      </div>
    );
  }

  const occ = detail.occupation;
  const owner = occ.owner_name || '?';
  const res = liveOccResources(detail, view, activeFetchedAt, now);
  const shipName = (code: string, name: string) => translateShipName(t, code, name);
  const defName = (code: string, name: string) => translateDefenseName(t, code, name);

  const handleExit = () => {
    exit();
  };

  // ---------- Producción ----------
  const handleBuild = async (kind: 'ship' | 'defense', opt: OccBuildOption, qty: number) => {
    if (busy) return;
    setBusy(`build-${kind}-${opt.id}`);
    const { data, error } = await supabase.rpc('occupation_build', {
      p_occupation_id: occ.id,
      p_item_type: kind,
      p_type_id: opt.id,
      p_quantity: qty,
    });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      flash({ type: 'success', text: data.message });
      await refreshActive();
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  const handleCancelBuild = async (item: OccQueueItem) => {
    if (busy) return;
    setBusy(`cancel-${item.id}`);
    const { data, error } = await supabase.rpc('occupation_cancel_build', { p_item_id: item.id });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      flash({ type: 'success', text: data.message });
      await refreshActive();
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  // ---------- Transporte ----------
  const garrisonTotal = detail.garrison.reduce((s, g) => s + g.quantity, 0);
  const selectedShips = detail.garrison
    .map((g) => ({ ship_type_id: g.ship_type_id, quantity: Math.min(g.quantity, Math.max(0, Math.floor(tShips[g.ship_type_id] || 0))) }))
    .filter((s) => s.quantity > 0);
  const selectedCount = selectedShips.reduce((s, x) => s + x.quantity, 0);
  const selectedCargo = selectedShips.reduce((s, x) => {
    const g = detail.garrison.find((gg) => gg.ship_type_id === x.ship_type_id);
    return s + (g ? g.cargo_capacity * x.quantity : 0);
  }, 0);
  const cargoUsed = Math.max(0, tMetal) + Math.max(0, tCrystal) + Math.max(0, tDeut);

  const handleTransport = async () => {
    if (busy) return;
    setBusy('transport');
    const { data, error } = await supabase.rpc('occupation_transport', {
      p_occupation_id: occ.id,
      p_ships: selectedShips,
      p_metal: Math.max(0, Math.floor(tMetal)),
      p_crystal: Math.max(0, Math.floor(tCrystal)),
      p_deuterium: Math.max(0, Math.floor(tDeut)),
      p_target_planet_id: tTarget,
      p_speed_percent: tSpeed,
    });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      flash({ type: 'success', text: `${data.message} ${tx('Llegada en', 'Arrives in')} ${formatTime(data.flight_time)}.` });
      setTShips({}); setTMetal(0); setTCrystal(0); setTDeut(0);
      await refreshActive();
      load();
      if (profile?.id) fetchFleets(profile.id);
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  // ---------- Ataque desde el planeta ocupado [OCCATK1] ----------
  const attackShips = detail.garrison
    .filter((g) => g.code !== 'occupation_ship' && g.code !== 'espionage_probe')
    .map((g) => ({ ship_type_id: g.ship_type_id, quantity: Math.min(g.quantity, Math.max(0, Math.floor(aShips[g.ship_type_id] || 0))) }))
    .filter((s) => s.quantity > 0);
  const attackCount = attackShips.reduce((s, x) => s + x.quantity, 0);

  const handleAttack = async () => {
    if (busy) return;
    setBusy('attack');
    const { data, error } = await supabase.rpc('occupation_attack', {
      p_occupation_id: occ.id,
      p_ships: attackShips,
      p_target_galaxy: aG,
      p_target_system: aS,
      p_target_position: aP,
      p_target_type: aType,
      p_speed_percent: aSpeed,
    });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      flash({ type: 'success', text: `${data.message} ${tx('Llegada en', 'Arrives in')} ${formatTime(data.flight_time)}.` });
      setAShips({});
      await refreshActive();
      load();
      if (profile?.id) fetchFleets(profile.id);
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  // ---------- Abandono ----------
  const handleAbandon = async () => {
    if (busy) return;
    setBusy('abandon');
    setConfirmAbandon(false);
    const { data, error } = await supabase.rpc('occupation_abandon', { p_occupation_id: occ.id });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      exit();
      load();
      if (profile?.id) fetchFleets(profile.id);
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  // ---------- Bloques reutilizables ----------
  const banner = (
    <div className="rounded-lg border border-red-500/40 bg-gradient-to-r from-red-950/70 via-rose-900/30 to-red-950/70 backdrop-blur-sm px-4 py-2.5">
      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
        <Flag className="w-5 h-5 text-red-400 flex-shrink-0" />
        <p className="flex-1 text-center sm:text-left text-xs sm:text-sm text-red-100">
          <span className="font-bold text-red-200">{tx('Planeta ocupado', 'Occupied planet')}: {occ.planet_name} {formatCoordinates(occ.galaxy, occ.solar_system, occ.position)}</span>
          {' · '}{tx('Dueño', 'Owner')}: <span className="text-red-300">{owner}</span>
          {' · '}{tx('La tecnología del planeta pertenece al dueño.', 'The planet technology belongs to the owner.')}
        </p>
        <button
          onClick={handleExit}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-space-700 hover:bg-space-600 text-gray-200 flex-shrink-0"
        >
          <Globe className="w-4 h-4" /> {tx('Volver a mis planetas', 'Back to my planets')}
        </button>
      </div>
    </div>
  );

  const flashBox = msg && (
    <div className={`p-3 rounded-lg flex items-center gap-2 ${msg.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300' : 'bg-red-900/30 border border-red-700/50 text-red-300'}`}>
      {msg.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
      <span className="text-sm">{msg.text}</span>
    </div>
  );

  const queuePanel = (kind: 'ship' | 'defense' | 'all') => {
    const items = detail.queue
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => kind === 'all' || q.item_type === kind);
    if (kind !== 'all' && items.length === 0) return null;
    return (
      <div className="card-glass p-4">
        <h3 className="font-orbitron text-white mb-3 flex items-center gap-2">
          <Factory className="w-5 h-5 text-amber-400" /> {tx('Cola de producción', 'Production queue')}
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">{tx('Nada en producción.', 'Nothing in production.')}</p>
        ) : (
          <div className="space-y-1">
            {items.map(({ q, idx }) => {
              const remaining = Math.max(0, Math.floor((new Date(q.end_time).getTime() - now) / 1000));
              return (
                <div key={q.id} className="flex items-center gap-2 p-2 rounded bg-space-700/40">
                  {q.image_url && <img src={encodeURI(q.image_url)} alt="" className="w-8 h-8 object-contain" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{q.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {q.quantity_done}/{q.quantity} · {idx === 0 ? formatTime(remaining) : tx('En espera', 'Waiting')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancelBuild(q)}
                    disabled={!!busy}
                    title={tx('Cancelar (devuelve los recursos de lo no producido)', 'Cancel (refunds unproduced units)')}
                    className="p-1.5 rounded hover:bg-red-500/20 text-red-400 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const garrisonPanel = (
    <div className="card-glass p-4">
      <h3 className="font-orbitron text-white mb-3 flex items-center gap-2"><Shield className="w-5 h-5 text-red-400" /> {tx('Guarnición', 'Garrison')}</h3>
      {detail.garrison.length === 0 ? (
        <p className="text-sm text-gray-500">{tx('Sin naves.', 'No ships.')}</p>
      ) : (
        <div className="space-y-1">
          {detail.garrison.map((g) => (
            <div key={g.ship_type_id} className="flex items-center gap-2 p-2 rounded bg-space-700/40">
              {g.image_url && <img src={encodeURI(g.image_url)} alt="" className="w-8 h-8 object-contain" />}
              <span className="flex-1 text-sm text-gray-200">{shipName(g.code, g.name)}</span>
              <span className="font-orbitron text-sm text-white">{formatNumber(g.quantity)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const resourceCards = (
    <div className="grid grid-cols-3 gap-2">
      {([
        ['metal', t.resources.metal, 'text-gray-200', 'metal_storage'],
        ['crystal', t.resources.crystal, 'text-cyan-300', 'crystal_storage'],
        ['deuterium', t.resources.deuterium, 'text-emerald-300', 'deuterium_storage'],
      ] as const).map(([k, label, color, st]) => (
        <div key={k} className="bg-space-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-400">{label}</p>
          <p className={`font-orbitron ${color}`}>{formatNumber(Math.floor(res[k]))}</p>
          <p className="text-[11px] text-gray-500">
            +{formatNumber(Math.floor(detail.resources[`${k}_per_hour` as const]))}/h
            {view && <> · {tx('Alm.', 'Cap.')} {formatNumber(Number(view.storage[st]))}</>}
          </p>
        </div>
      ))}
    </div>
  );

  const queuedOf = (kind: 'ship' | 'defense', typeId: number) =>
    detail.queue
      .filter((q) => q.item_type === kind && q.type_id === typeId)
      .reduce((s, q) => s + (q.quantity - q.quantity_done), 0);

  const renderBuildGrid = (kind: 'ship' | 'defense', options: OccBuildOption[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
      {options.map((opt) => {
        const key = `${kind}-${opt.id}`;
        const qty = qtys[key] ?? 1;
        let owned = 0;
        let stats: { label: string; value: number }[] = [];
        if (kind === 'ship') {
          owned = detail.garrison.find((g) => g.ship_type_id === opt.id)?.quantity ?? 0;
          const st = shipTypes.find((s) => s.id === opt.id);
          if (st) {
            stats = [
              { label: t.shipyard.attack, value: st.weapon_power },
              { label: t.shipyard.shield, value: st.shield_power },
              { label: t.shipyard.cargo, value: st.cargo_capacity },
              { label: t.shipyard.speed, value: st.base_speed },
            ];
          }
        } else {
          owned = view?.defenses.find((d) => d.defense_type_id === opt.id)?.quantity ?? 0;
          const dt = defenseTypes.find((d) => d.id === opt.id);
          if (dt) {
            stats = [
              { label: t.shipyard.attack, value: dt.weapon_power },
              { label: t.shipyard.shield, value: dt.shield_power },
              { label: tx('Estructura', 'Structure'), value: dt.structural_integrity },
            ];
          }
        }
        return (
          <BuildCard
            key={key}
            opt={opt}
            label={kind === 'ship' ? shipName(opt.code, opt.name) : defName(opt.code, opt.name)}
            owned={owned}
            inQueue={queuedOf(kind, opt.id)}
            stats={stats}
            qty={qty}
            res={res}
            busy={busy === `build-${key}`}
            disabled={!!busy || detail.shipyard_level < 1}
            accent={kind === 'ship' ? 'orange' : 'green'}
            icon={kind === 'ship' ? Rocket : Shield}
            onQty={(q) => setQtys((s) => ({ ...s, [key]: q }))}
            onBuild={() => handleBuild(kind, opt, qty)}
          />
        );
      })}
    </div>
  );

  const shipyardMissing = detail.shipyard_level < 1 && (
    <div className="card-glass p-4 border-l-4 border-cyber-orange">
      <div className="flex items-center gap-3">
        <Lock className="w-6 h-6 text-cyber-orange" />
        <div>
          <p className="text-white font-semibold">{tx('Este planeta no tiene Hangar', 'This planet has no Shipyard')}</p>
          <p className="text-sm text-gray-400">{tx('No puedes construir edificios en un planeta ocupado.', 'You cannot construct buildings on an occupied planet.')}</p>
        </div>
      </div>
    </div>
  );

  // ---------- Secciones ----------
  let content: React.ReactNode = null;

  if (segment === '') {
    const p = view?.planet;
    content = (
      <>
        <PageTitle icon={Globe} color="text-cyber-blue" title={t.nav.overview} />
        <div className="card-glass p-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-red-500/60 shadow-[0_0_18px_rgba(239,68,68,0.35)] flex-shrink-0">
            <img src={getPlanetImage(p?.temp_max ?? 0, occ.image_id)} alt={occ.planet_name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 w-full space-y-2">
            <h2 className="font-orbitron text-lg text-white flex items-center gap-2">
              <Flag className="w-5 h-5 text-red-400" /> {occ.planet_name}
              <span className="text-red-300 text-sm">{formatCoordinates(occ.galaxy, occ.solar_system, occ.position)}</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {([
                [tx('Dueño', 'Owner'), owner],
                [tx('Ocupado desde', 'Occupied since'), new Date(occ.started_at).toLocaleString(es ? 'es-ES' : 'en-US')],
                [tx('Diámetro', 'Diameter'), p ? `${formatNumber(p.diameter)} km` : '-'],
                [tx('Campos', 'Fields'), p ? `${p.fields_used}/${p.fields_max}` : '-'],
                [tx('Temperatura', 'Temperature'), p ? `${p.temp_min}°C / ${p.temp_max}°C` : '-'],
                [tx('Hangar', 'Shipyard'), `${tx('Nv.', 'Lv.')} ${detail.shipyard_level}`],
                [tx('Guarnición', 'Garrison'), formatNumber(garrisonTotal)],
                [tx('En cola', 'Queued'), formatNumber(detail.queue.length)],
              ] as const).map(([l, v]) => (
                <div key={l} className="bg-space-700/50 rounded-lg p-2">
                  <p className="text-[11px] text-gray-400">{l}</p>
                  <p className="text-xs sm:text-sm text-white truncate">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        {resourceCards}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {garrisonPanel}
          {queuePanel('all')}
        </div>
        <div className="card-glass p-4 border-amber-600/30 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm text-amber-200 font-semibold">{tx('Abandonar ocupación', 'Abandon occupation')}</p>
            <p className="text-xs text-gray-400">
              {tx(
                'Tu guarnición y el Guardián regresan a su planeta de origen según su velocidad de vuelo. La producción pendiente se devuelve al planeta y el dueño recupera el control.',
                'Your garrison and the Guardian fly back to their origin planet at their flight speed. Pending production is refunded to the planet and the owner regains control.'
              )}
            </p>
          </div>
          {confirmAbandon ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmAbandon(false)} className="px-3 py-2 rounded-lg bg-space-700 hover:bg-space-600 text-gray-300 text-sm">{tx('Cancelar', 'Cancel')}</button>
              <button onClick={handleAbandon} disabled={!!busy} className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold">
                {busy === 'abandon' ? <Loader2 className="w-4 h-4 animate-spin" /> : tx('Confirmar abandono', 'Confirm abandon')}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmAbandon(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600/20 border border-amber-600/40 hover:bg-amber-600/30 text-amber-300 text-sm font-semibold">
              <LogOut className="w-4 h-4" /> {tx('Abandonar', 'Abandon')}
            </button>
          )}
        </div>
      </>
    );
  } else if (segment === 'buildings') {
    const list = (view?.buildings || []).filter((b) => !MOON_ONLY.has(b.code));
    content = (
      <>
        <PageTitle icon={Building2} color="text-cyber-blue" title={t.nav.buildings} right={view ? `${tx('Campos', 'Fields')} ${view.planet.fields_used}/${view.planet.fields_max}` : undefined} />
        <div className="card-glass p-4 border-l-4 border-cyber-orange">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-cyber-orange flex-shrink-0" />
            <div>
              <p className="text-white font-semibold">{tx(`Tecnología de ${owner}`, `${owner}'s technology`)}</p>
              <p className="text-sm text-gray-400">
                {tx(
                  'Puedes ver los edificios de este planeta, pero no puedes construir, mejorar ni demoler nada: pertenecen al dueño del planeta.',
                  'You can see the buildings of this planet, but you cannot build, upgrade or demolish anything: they belong to the planet owner.'
                )}
              </p>
            </div>
          </div>
        </div>
        {!view ? (
          <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 text-cyber-blue animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {list.map((b) => {
              const label = translateBuildingName(t, b.code, b.name);
              return (
                <div key={b.id} className={`card-glass overflow-hidden rounded-lg ${b.level > 0 ? '' : 'opacity-50'}`}>
                  <div className="relative w-full aspect-[2/1] bg-gradient-to-br from-space-700 via-space-800 to-space-900 overflow-hidden">
                    {b.image_url ? (
                      <MediaDisplay src={b.image_url} alt={label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Building2 className="w-16 h-16 text-space-600" /></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-space-900/90 via-transparent to-transparent" />
                    <div className="absolute top-2 right-2 bg-space-900/80 backdrop-blur-sm px-3 py-1 rounded-full">
                      <span className="font-orbitron text-cyber-blue text-xs sm:text-sm">{tx('Nv.', 'Lv.')} {b.level}</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3">
                      <h3 className="font-orbitron text-sm sm:text-base text-white truncate">{label}</h3>
                    </div>
                  </div>
                  <div className="px-3 py-2 flex items-center gap-2 text-xs text-gray-400">
                    <Lock className="w-3.5 h-3.5 text-cyber-orange flex-shrink-0" />
                    {tx('Solo lectura · tecnología del dueño', 'Read only · owner technology')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  } else if (segment === 'resources') {
    const lvl = (code: string) => view?.buildings.find((b) => b.code === code)?.level ?? 0;
    const energyMax = Number(view?.storage.energy_max ?? 0);
    const energyUsed = Number(view?.storage.energy_used ?? 0);
    content = (
      <>
        <PageTitle icon={TrendingUp} color="text-cyber-green" title={t.nav.resources} />
        <div className="card-glass p-4 border-l-4 border-cyber-green">
          <div className="flex items-center gap-3">
            <Info className="w-6 h-6 text-cyber-green flex-shrink-0" />
            <p className="text-sm text-gray-300">
              {tx(
                'La producción de este planeta es tuya mientras dure la ocupación. No puedes cambiar los porcentajes de producción porque las minas pertenecen al dueño.',
                'This planet production is yours while the occupation lasts. You cannot change production percentages because the mines belong to the owner.'
              )}
            </p>
          </div>
        </div>
        {resourceCards}
        <div className="card-glass p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-space-600">
                <th className="text-left py-2 px-2">{tx('Fuente', 'Source')}</th>
                <th className="text-right py-2 px-2">{tx('Nivel', 'Level')}</th>
                <th className="text-right py-2 px-2">{tx('Por hora', 'Per hour')}</th>
                <th className="text-right py-2 px-2">{tx('Por día', 'Per day')}</th>
              </tr>
            </thead>
            <tbody>
              {([
                ['metal_mine', t.resources.metal, detail.resources.metal_per_hour, 'text-gray-200'],
                ['crystal_mine', t.resources.crystal, detail.resources.crystal_per_hour, 'text-cyan-300'],
                ['deuterium_synthesizer', t.resources.deuterium, detail.resources.deuterium_per_hour, 'text-emerald-300'],
              ] as const).map(([code, label, rate, color]) => (
                <tr key={code} className="border-b border-space-700/50">
                  <td className={`py-2 px-2 ${color}`}>{translateBuildingName(t, code, label)}</td>
                  <td className="py-2 px-2 text-right text-white">{lvl(code)}</td>
                  <td className="py-2 px-2 text-right text-cyber-green">+{formatNumber(Math.floor(Number(rate)))}</td>
                  <td className="py-2 px-2 text-right text-gray-300">+{formatNumber(Math.floor(Number(rate) * 24))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Sun className={`w-4 h-4 ${energyMax - energyUsed < 0 ? 'text-cyber-red' : 'text-yellow-400'}`} />
            <span className="text-gray-400">{t.resources.energy}:</span>
            <span className={energyMax - energyUsed < 0 ? 'text-cyber-red' : 'text-white'}>
              {formatNumber(energyMax - energyUsed)} ({formatNumber(energyMax)}/{formatNumber(energyUsed)})
            </span>
          </div>
        </div>
      </>
    );
  } else if (segment === 'research') {
    content = (
      <>
        <PageTitle icon={Microscope} color="text-cyber-purple" title={t.nav.research} />
        <div className="rounded-xl border border-red-500/30 bg-space-800/70 p-8 text-center space-y-3">
          <Lock className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-red-200">{tx('No puedes investigar en este planeta', 'You cannot research on this planet')}</h2>
          <p className="text-sm text-gray-300 max-w-lg mx-auto">
            {tx(
              `El laboratorio y la tecnología pertenecen a ${owner}. La investigación queda bloqueada en este planeta mientras esté ocupado. Investiga desde tus propios planetas.`,
              `The lab and technology belong to ${owner}. Research is locked on this planet while it is occupied. Research from your own planets.`
            )}
          </p>
          <button onClick={handleExit} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-space-700 hover:bg-space-600 text-gray-200 text-sm font-semibold">
            <Globe className="w-4 h-4" /> {tx('Volver a mis planetas', 'Back to my planets')}
          </button>
        </div>
      </>
    );
  } else if (segment === 'shipyard') {
    content = (
      <>
        <PageTitle icon={Rocket} color="text-cyber-orange" title={t.nav.shipyard} right={`${t.shipyard.shipyardLevel} ${detail.shipyard_level}`} />
        {shipyardMissing}
        <p className="text-xs text-gray-400 flex items-start gap-1">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {tx(
            'Se paga con los recursos de este planeta. Las naves producidas se unen a tu guarnición.',
            'Paid with this planet resources. Produced ships join your garrison.'
          )}
        </p>
        {queuePanel('ship')}
        {renderBuildGrid('ship', detail.build_ships)}
      </>
    );
  } else if (segment === 'defense') {
    content = (
      <>
        <PageTitle icon={Shield} color="text-cyber-green" title={t.nav.defense} right={`${t.shipyard.shipyardLevel} ${detail.shipyard_level}`} />
        {shipyardMissing}
        <p className="text-xs text-gray-400 flex items-start gap-1">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {tx(
            'Se paga con los recursos de este planeta. Las defensas quedan en el planeta aunque lo pierdas.',
            'Paid with this planet resources. Defenses stay on the planet even if you lose it.'
          )}
        </p>
        {queuePanel('defense')}
        {renderBuildGrid('defense', detail.build_defenses)}
      </>
    );
  } else if (segment === 'fleet') {
    content = (
      <>
        <PageTitle icon={Send} color="text-cyber-blue" title={t.nav.fleet} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">{garrisonPanel}</div>
          <div className="lg:col-span-2 space-y-4">
          <div className="card-glass p-4">
            <h3 className="font-orbitron text-white mb-3 flex items-center gap-2"><Truck className="w-5 h-5 text-cyan-400" /> {tx('Transportar a tus planetas', 'Transport to your planets')}</h3>
            {detail.transport_targets.length === 0 ? (
              <p className="text-sm text-gray-500">{tx('No tienes planetas de destino disponibles.', 'No destination planets available.')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  {detail.garrison.filter((g) => g.code !== 'occupation_ship').map((g) => (
                    <div key={g.ship_type_id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-300">{shipName(g.code, g.name)} <span className="text-gray-500">({formatNumber(g.quantity)})</span></span>
                      <input
                        type="number"
                        min={0}
                        max={g.quantity}
                        value={tShips[g.ship_type_id] ?? 0}
                        onChange={(e) => setTShips((s) => ({ ...s, [g.ship_type_id]: Math.min(g.quantity, Math.max(0, parseInt(e.target.value) || 0)) }))}
                        className="w-24 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm"
                      />
                      <button
                        onClick={() => setTShips((s) => ({ ...s, [g.ship_type_id]: g.quantity }))}
                        className="px-2 py-1 rounded bg-space-700 hover:bg-space-600 text-xs text-gray-300"
                      >
                        {tx('Máx', 'Max')}
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-gray-500 pt-1">
                    {tx('Debe quedar al menos 1 nave como guarnición.', 'At least 1 ship must stay as garrison.')} ({formatNumber(selectedCount)}/{formatNumber(garrisonTotal)})
                  </p>
                </div>
                <div className="space-y-2">
                  {([
                    ['M', tMetal, setTMetal, Math.floor(res.metal)],
                    ['C', tCrystal, setTCrystal, Math.floor(res.crystal)],
                    ['D', tDeut, setTDeut, Math.floor(res.deuterium)],
                  ] as const).map(([lbl, val, setter, max]) => (
                    <div key={lbl} className="flex items-center gap-2">
                      <span className="w-6 text-sm text-gray-400">{lbl}</span>
                      <input
                        type="number"
                        min={0}
                        value={val}
                        onChange={(e) => setter(Math.min(max, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="flex-1 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm"
                      />
                      <button onClick={() => setter(max)} className="px-2 py-1 rounded bg-space-700 hover:bg-space-600 text-xs text-gray-300">{tx('Máx', 'Max')}</button>
                    </div>
                  ))}
                  <p className={`text-[11px] ${cargoUsed > selectedCargo ? 'text-red-400' : 'text-gray-500'}`}>
                    {tx('Carga', 'Cargo')}: {formatNumber(cargoUsed)} / {formatNumber(selectedCargo)}
                  </p>
                  <div className="flex gap-2">
                    <select value={tTarget} onChange={(e) => setTTarget(e.target.value)} className="flex-1 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm">
                      {detail.transport_targets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {formatCoordinates(p.galaxy, p.solar_system, p.position)}{p.planet_type === 'moon' ? ` (${tx('Luna', 'Moon')})` : ''}
                        </option>
                      ))}
                    </select>
                    <select value={tSpeed} onChange={(e) => setTSpeed(parseInt(e.target.value))} className="w-20 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm">
                      {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((s) => <option key={s} value={s}>{s}%</option>)}
                    </select>
                  </div>
                  <button
                    onClick={handleTransport}
                    disabled={!!busy || selectedCount === 0 || selectedCount >= garrisonTotal || cargoUsed > selectedCargo || !tTarget}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-sm"
                  >
                    {busy === 'transport' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {tx('Enviar transporte', 'Send transport')}
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3 flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {tx(
                'Los transportes desde un planeta ocupado solo pueden ir a tus planetas.',
                'Transports from an occupied planet can only go to your planets.'
              )}
            </p>
          </div>
          <div className="card-glass p-4">
            <h3 className="font-orbitron text-white mb-3 flex items-center gap-2"><Swords className="w-5 h-5 text-red-400" /> {tx('Atacar desde este planeta', 'Attack from this planet')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {detail.garrison.filter((g) => g.code !== 'occupation_ship' && g.code !== 'espionage_probe').map((g) => (
                  <div key={g.ship_type_id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-gray-300">{shipName(g.code, g.name)} <span className="text-gray-500">({formatNumber(g.quantity)})</span></span>
                    <input
                      type="number"
                      min={0}
                      max={g.quantity}
                      value={aShips[g.ship_type_id] ?? 0}
                      onChange={(e) => setAShips((s) => ({ ...s, [g.ship_type_id]: Math.min(g.quantity, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      className="w-24 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm"
                    />
                    <button
                      onClick={() => setAShips((s) => ({ ...s, [g.ship_type_id]: g.quantity }))}
                      className="px-2 py-1 rounded bg-space-700 hover:bg-space-600 text-xs text-gray-300"
                    >
                      {tx('Máx', 'Max')}
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-gray-500 pt-1">
                  {tx('Debe quedar al menos 1 nave como guarnición.', 'At least 1 ship must stay as garrison.')} ({formatNumber(attackCount)}/{formatNumber(garrisonTotal)})
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {([
                    ['G', aG, setAG],
                    ['S', aS, setAS],
                    ['P', aP, setAP],
                  ] as const).map(([lbl, val, setter]) => (
                    <label key={lbl} className="flex-1 flex items-center gap-1 text-sm text-gray-400">
                      {lbl}
                      <input
                        type="number"
                        min={1}
                        value={val}
                        onChange={(e) => setter(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select value={aType} onChange={(e) => setAType(e.target.value as 'planet' | 'moon')} className="flex-1 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm">
                    <option value="planet">{tx('Planeta', 'Planet')}</option>
                    <option value="moon">{tx('Luna', 'Moon')}</option>
                  </select>
                  <select value={aSpeed} onChange={(e) => setASpeed(parseInt(e.target.value))} className="w-20 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm">
                    {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((s) => <option key={s} value={s}>{s}%</option>)}
                  </select>
                </div>
                <button
                  onClick={handleAttack}
                  disabled={!!busy || attackCount === 0 || attackCount >= garrisonTotal}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold text-sm"
                >
                  {busy === 'attack' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />} {tx('Enviar ataque', 'Send attack')}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {tx(
                'Mientras controles esta colonia puedes atacar a otros jugadores con las naves de la guarnición (saqueo normal). El combustible sale de este planeta y, al volver, las naves se unen a la guarnición y el botín se descarga aquí. Si pierdes la colonia antes, vuelven a tu planeta principal.',
                'While you control this colony you can attack other players with the garrison ships (normal looting). Fuel is taken from this planet and, on return, ships rejoin the garrison and loot is unloaded here. If you lose the colony first, they return to your main planet.'
              )}
            </p>
          </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-occupied-view={occ.id}>
      {banner}
      {flashBox}
      {content}
      {segment !== '' && segment !== 'research' && (
        <div className="flex justify-end">
          <button onClick={() => navigate('/game/occupations')} className="text-xs text-gray-500 hover:text-red-300 inline-flex items-center gap-1">
            <Flag className="w-3 h-3" /> {t.nav.occupations}
          </button>
        </div>
      )}
    </div>
  );
}
