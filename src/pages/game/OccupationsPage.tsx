/**
 * OccupationsPage - Guardián
 * - Compra de la nave con TUNG (precio fijo en USD, cobrado al precio en vivo)
 * - Gestión de colonias ocupadas: producción, transporte y abandono
 * - Colonias propias ocupadas (recuperación)
 * - Salón de Conquistadores
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle, Clock, Coins, Crown, Factory, Flag, Info, Loader2, LogOut,
  Rocket, Send, Shield, ShoppingCart, Swords, Trophy, Truck, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { useI18n, translateShipName, translateDefenseName, translatePlanetName } from '../../lib/i18n';
import { formatNumber, formatTime } from '../../lib/utils';
import { OCCUPATION_CHANGED_EVENT } from '../../components/ui/OccupationLock';

interface ShipInfo {
  success: boolean;
  error?: string;
  unit_price_usd: number;
  tung_price_usd: number | null;
  unit_cost_tung: number | null;
  balance: number;
  max_per_purchase: number;
  max_active_occupations: number | null;
  max_per_player?: number;
  active_occupations: number;
  ship: {
    id: number; code: string; name: string; description: string; image_url: string;
    structural_integrity: number; shield_power: number; weapon_power: number;
    cargo_capacity: number; base_speed: number; fuel_consumption: number;
  } | null;
}

interface OccupierItem {
  occupation_id: string; planet_id: string; planet_name: string;
  galaxy: number; solar_system: number; position: number;
  owner_name: string | null; started_at: string; garrison_ships: number; pending_builds: number;
}

interface OwnerItem {
  occupation_id: string; planet_id: string; planet_name: string;
  galaxy: number; solar_system: number; position: number;
  occupier_name: string | null; started_at: string;
}

interface Overview {
  as_occupier: OccupierItem[];
  as_owner: OwnerItem[];
  max_active: number | null;
  max_per_player?: number;
}

interface GarrisonShip {
  ship_type_id: number; code: string; name: string; image_url: string | null;
  quantity: number; cargo_capacity: number; base_speed: number;
}

interface QueueItem {
  id: number; item_type: 'ship' | 'defense'; type_id: number; name: string; image_url: string | null;
  quantity: number; quantity_done: number; unit_time: number; start_time: string; end_time: string;
}

interface BuildOption {
  id: number; code: string; name: string; image_url: string | null;
  metal_cost: number; crystal_cost: number; deuterium_cost: number; unit_time: number; available: boolean;
}

interface TransportTarget {
  id: string; name: string; galaxy: number; solar_system: number; position: number; planet_type: string;
}

interface Detail {
  occupation: {
    id: string; started_at: string; owner_name: string | null; planet_id: string; planet_name: string;
    galaxy: number; solar_system: number; position: number; image_id: number;
  };
  resources: {
    metal: number; crystal: number; deuterium: number;
    metal_per_hour: number; crystal_per_hour: number; deuterium_per_hour: number;
  };
  shipyard_level: number;
  garrison: GarrisonShip[];
  queue: QueueItem[];
  build_ships: BuildOption[];
  build_defenses: BuildOption[];
  transport_targets: TransportTarget[];
}

interface RankingRow {
  rank: number; username: string; conquests: number; active: number;
  recovered_by_owner: number; hours: number; is_me: boolean;
}

type Tab = 'occupations' | 'buy' | 'ranking';
type Msg = { type: 'success' | 'error'; text: string } | null;

const coords = (g: number, s: number, p: number) => `[${g}:${s}:${p}]`;

export function OccupationsPage() {
  const { t, language } = useI18n();
  const es = language === 'es';
  const tx = (a: string, b: string) => (es ? a : b);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const occParam = searchParams.get('occ');
  const { profile, refreshProfile } = useAuthStore();
  const { currentPlanet, planets, selectPlanet, fetchShips, fetchResources, fetchFleets } = useGameStore();

  const [tab, setTab] = useState<Tab>('occupations');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [info, setInfo] = useState<ShipInfo | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [ranking, setRanking] = useState<RankingRow[] | null>(null);

  const [buyQty, setBuyQty] = useState(1);
  const [buildType, setBuildType] = useState<'ship' | 'defense'>('ship');
  const [buildQty, setBuildQty] = useState<Record<number, number>>({});
  const [tShips, setTShips] = useState<Record<number, number>>({});
  const [tMetal, setTMetal] = useState(0);
  const [tCrystal, setTCrystal] = useState(0);
  const [tDeut, setTDeut] = useState(0);
  const [tTarget, setTTarget] = useState('');
  const [tSpeed, setTSpeed] = useState(100);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [now, setNow] = useState(Date.now());

  const flash = (m: Msg) => {
    setMsg(m);
    if (m) setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 6000);
  };

  const loadInfo = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_occupation_ship_info');
    if (!error && data?.success) setInfo(data as ShipInfo);
  }, []);

  const loadOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_occupation_overview');
    if (!error && data?.success) {
      const ov = data as Overview;
      setOverview(ov);
      setSelectedId((cur) => {
        if (cur && ov.as_occupier.some((o) => o.occupation_id === cur)) return cur;
        return ov.as_occupier[0]?.occupation_id ?? null;
      });
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const { data, error } = await supabase.rpc('get_occupation_detail', { p_occupation_id: id });
    if (!error && data?.success) {
      const d = data as Detail;
      setDetail(d);
      setTTarget((cur) => (cur && d.transport_targets.some((x) => x.id === cur) ? cur : d.transport_targets[0]?.id || ''));
    } else {
      setDetail(null);
    }
    setDetailLoading(false);
  }, []);

  const loadRanking = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_occupation_ranking', { p_limit: 50 });
    if (!error && data?.success) setRanking(data.ranking as RankingRow[]);
  }, []);

  useEffect(() => {
    loadInfo();
    loadOverview();
  }, [loadInfo, loadOverview]);

  // [OCUPA2] Abrir directamente la ocupación elegida en el selector o en galaxia
  useEffect(() => {
    if (occParam) {
      setTab('occupations');
      setSelectedId(occParam);
    }
  }, [occParam]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
    setTShips({});
    setTMetal(0); setTCrystal(0); setTDeut(0);
    setConfirmAbandon(false);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (tab === 'ranking') loadRanking();
  }, [tab, loadRanking]);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Refresca el detalle cuando termina un lote de la cola
  const nextQueueEnd = useMemo(() => {
    if (!detail?.queue.length) return null;
    const q = detail.queue[0];
    const start = new Date(q.start_time).getTime();
    return start + (q.quantity_done + 1) * q.unit_time * 1000;
  }, [detail]);

  useEffect(() => {
    if (!selectedId || !nextQueueEnd) return;
    const ms = nextQueueEnd - Date.now();
    const timer = setTimeout(() => loadDetail(selectedId), Math.max(1500, ms + 1500));
    return () => clearTimeout(timer);
  }, [nextQueueEnd, selectedId, loadDetail]);

  const shipName = (code: string, name: string) => translateShipName(t, code, name);
  const defName = (code: string, name: string) => translateDefenseName(t, code, name);

  const afterChange = () => {
    window.dispatchEvent(new Event(OCCUPATION_CHANGED_EVENT));
    loadOverview();
    loadInfo();
    if (profile?.id) fetchFleets(profile.id);
  };

  // ---------- Compra ----------
  const buyCost = info?.tung_price_usd && info.tung_price_usd > 0
    ? Math.ceil((info.unit_price_usd * buyQty) / info.tung_price_usd)
    : null;

  const handleBuy = async () => {
    if (!currentPlanet || busy) return;
    setBusy('buy');
    const { data, error } = await supabase.rpc('purchase_occupation_ship', {
      p_planet_id: currentPlanet.id,
      p_quantity: buyQty,
    });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      flash({ type: 'success', text: data.message });
      refreshProfile();
      fetchShips(currentPlanet.id);
      loadInfo();
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  // ---------- Producción ----------
  const handleBuild = async (opt: BuildOption) => {
    if (!detail || busy) return;
    const qty = Math.max(1, Math.floor(buildQty[opt.id] || 1));
    setBusy(`build-${opt.id}`);
    const { data, error } = await supabase.rpc('occupation_build', {
      p_occupation_id: detail.occupation.id,
      p_item_type: buildType,
      p_type_id: opt.id,
      p_quantity: qty,
    });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      flash({ type: 'success', text: data.message });
      loadDetail(detail.occupation.id);
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  const handleCancelBuild = async (item: QueueItem) => {
    if (!detail || busy) return;
    setBusy(`cancel-${item.id}`);
    const { data, error } = await supabase.rpc('occupation_cancel_build', { p_item_id: item.id });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      flash({ type: 'success', text: data.message });
      loadDetail(detail.occupation.id);
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  // ---------- Transporte ----------
  const garrisonTotal = detail?.garrison.reduce((s, g) => s + g.quantity, 0) || 0;
  const selectedShips = detail?.garrison
    .map((g) => ({ ship_type_id: g.ship_type_id, quantity: Math.min(g.quantity, Math.max(0, Math.floor(tShips[g.ship_type_id] || 0))) }))
    .filter((s) => s.quantity > 0) || [];
  const selectedCount = selectedShips.reduce((s, x) => s + x.quantity, 0);
  const selectedCargo = selectedShips.reduce((s, x) => {
    const g = detail?.garrison.find((gg) => gg.ship_type_id === x.ship_type_id);
    return s + (g ? g.cargo_capacity * x.quantity : 0);
  }, 0);
  const cargoUsed = Math.max(0, tMetal) + Math.max(0, tCrystal) + Math.max(0, tDeut);

  const handleTransport = async () => {
    if (!detail || busy) return;
    setBusy('transport');
    const { data, error } = await supabase.rpc('occupation_transport', {
      p_occupation_id: detail.occupation.id,
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
      loadDetail(detail.occupation.id);
      afterChange();
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  // ---------- Abandono ----------
  const handleAbandon = async () => {
    if (!detail || busy) return;
    setBusy('abandon');
    setConfirmAbandon(false);
    const { data, error } = await supabase.rpc('occupation_abandon', { p_occupation_id: detail.occupation.id });
    if (error) flash({ type: 'error', text: error.message });
    else if (data?.success) {
      flash({ type: 'success', text: data.message });
      setSelectedId(null);
      afterChange();
    } else flash({ type: 'error', text: data?.error || tx('Error desconocido', 'Unknown error') });
    setBusy(null);
  };

  // ---------- Recuperación (dueño) ----------
  const handleRecover = async (o: OwnerItem) => {
    const base = planets.find((p) => p.planet_type === 'planet' && p.is_main_planet && p.id !== o.planet_id)
      || planets.find((p) => p.planet_type === 'planet' && p.id !== o.planet_id && !(overview?.as_owner.some((x) => x.planet_id === p.id)));
    if (base && currentPlanet?.id !== base.id) {
      await selectPlanet(base.id);
      fetchResources(base.id);
    }
    navigate(`/game/fleet?galaxy=${o.galaxy}&system=${o.solar_system}&position=${o.position}&mission=attack`);
  };

  const shipImg = info?.ship?.image_url ? encodeURI(info.ship.image_url) : null;
  const activeCount = overview?.as_occupier.length ?? 0;
  const maxPerPlayer = overview?.max_per_player ?? 3;

  const tabs: { key: Tab; icon: typeof Flag; label: string }[] = [
    { key: 'occupations', icon: Flag, label: tx('Mis ocupaciones', 'My occupations') },
    { key: 'buy', icon: ShoppingCart, label: tx('Comprar nave', 'Buy ship') },
    { key: 'ranking', icon: Trophy, label: tx('Salón de Conquistadores', 'Hall of Conquerors') },
  ];

  const options = detail ? (buildType === 'ship' ? detail.build_ships : detail.build_defenses) : [];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="card-glass p-5 flex flex-col md:flex-row items-center gap-5 border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-space-800 to-yellow-950/20">
        {shipImg && (
          <img src={shipImg} alt={t.shipyard.occupationShip} className="w-32 h-32 object-contain drop-shadow-[0_0_18px_rgba(245,158,11,0.45)]" />
        )}
        <div className="flex-1 text-center md:text-left">
          <h1 className="font-serif text-2xl sm:text-3xl text-amber-100 tracking-wide flex items-center gap-2 justify-center md:justify-start">
            <Flag className="w-7 h-7 text-amber-400" /> {t.nav.occupations}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {tx(
              'Conquista colonias enemigas con el Guardián: produce en ellas, quédate con sus recursos y defiéndelas con tu guarnición.',
              'Conquer enemy colonies with the Guardian: produce there, keep their resources and defend them with your garrison.'
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-space-700/50 rounded-lg px-4 py-2">
            <p className="text-xs text-gray-400">{tx('Ocupaciones activas', 'Active occupations')}</p>
            <p className="font-serif text-lg text-amber-300">{activeCount}</p>
            <p className="text-[10px] text-gray-500">{tx(`máx ${maxPerPlayer} por jugador`, `max ${maxPerPlayer} per player`)}</p>
          </div>
          <div className="bg-space-700/50 rounded-lg px-4 py-2">
            <p className="text-xs text-gray-400">{tx('Precio', 'Price')}</p>
            <p className="font-serif text-lg text-amber-300">{info?.unit_price_usd ?? 10} USD</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg flex items-center gap-2 ${msg.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-300' : 'bg-red-900/30 border border-red-700/50 text-red-300'}`}>
          {msg.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm">{msg.text}</span>
        </div>
      )}

      {/* Colonias propias ocupadas */}
      {overview && overview.as_owner.length > 0 && (
        <div className="card-glass p-4 border-red-500/40">
          <h2 className="font-orbitron text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" /> {tx('Tus colonias ocupadas', 'Your occupied colonies')}
          </h2>
          <div className="space-y-2">
            {overview.as_owner.map((o) => (
              <div key={o.occupation_id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-red-950/30 border border-red-800/40">
                <div className="flex-1">
                  <p className="text-sm text-white font-semibold">{o.planet_name} <span className="text-red-300">{coords(o.galaxy, o.solar_system, o.position)}</span></p>
                  <p className="text-xs text-gray-400">
                    {tx('Ocupada por', 'Occupied by')} <span className="text-red-300">{o.occupier_name || '?'}</span> · {new Date(o.started_at).toLocaleString(es ? 'es-ES' : 'en-US')}
                  </p>
                </div>
                <button
                  onClick={() => handleRecover(o)}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-500 text-white"
                >
                  <Swords className="w-4 h-4" /> {tx('Recuperar (atacar)', 'Recover (attack)')}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {tx(
              'Ataca la guarnición en solitario o con un SAC creado por ti. Si ganas, la colonia vuelve a ti y tus colas congeladas se reanudan.',
              'Attack the garrison solo or with an ACS you create. If you win, the colony returns to you and your frozen queues resume.'
            )}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap ${tab === tb.key ? 'bg-amber-600 text-white' : 'bg-space-700 text-gray-400 hover:bg-space-600'}`}
          >
            <tb.icon className="w-4 h-4" /> {tb.label}
          </button>
        ))}
      </div>

      {/* ---------------- Mis ocupaciones ---------------- */}
      {tab === 'occupations' && (
        <div className="space-y-4">
          {!overview ? (
            <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
          ) : overview.as_occupier.length === 0 ? (
            <div className="card-glass p-8 text-center space-y-3">
              <Flag className="w-12 h-12 text-gray-500 mx-auto" />
              <p className="text-gray-300">{tx('No tienes colonias ocupadas.', 'You have no occupied colonies.')}</p>
              <p className="text-sm text-gray-500 max-w-lg mx-auto">
                {tx(
                  'Compra un Guardián y envíalo en una misión de Ataque contra una colonia enemiga junto con otras naves.',
                  'Buy a Guardian and send it on an Attack mission against an enemy colony together with other ships.'
                )}
              </p>
              <button onClick={() => setTab('buy')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold">
                <ShoppingCart className="w-4 h-4" /> {tx('Comprar nave', 'Buy ship')}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {overview.as_occupier.map((o) => (
                  <button
                    key={o.occupation_id}
                    onClick={() => setSelectedId(o.occupation_id)}
                    className={`text-left p-3 rounded-lg border transition-all ${selectedId === o.occupation_id ? 'border-red-500 bg-red-950/40' : 'border-space-600 bg-space-800/60 hover:border-red-500/50'}`}
                  >
                    <p className="text-sm font-semibold text-white flex items-center gap-1"><Flag className="w-4 h-4 text-red-400" /> {o.planet_name}</p>
                    <p className="text-xs text-red-300">{coords(o.galaxy, o.solar_system, o.position)}</p>
                    <p className="text-xs text-gray-400 mt-1">{tx('Dueño', 'Owner')}: {o.owner_name || '?'}</p>
                    <p className="text-xs text-gray-400">{tx('Guarnición', 'Garrison')}: {formatNumber(o.garrison_ships)} · {tx('En cola', 'Queued')}: {o.pending_builds}</p>
                  </button>
                ))}
              </div>

              {detailLoading && !detail && (
                <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
              )}

              {detail && (
                <div className="space-y-4">
                  {/* Recursos */}
                  <div className="card-glass p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <h2 className="font-serif text-amber-100">
                        {detail.occupation.planet_name} <span className="text-amber-300">{coords(detail.occupation.galaxy, detail.occupation.solar_system, detail.occupation.position)}</span>
                      </h2>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {tx('Ocupada desde', 'Occupied since')} {new Date(detail.occupation.started_at).toLocaleString(es ? 'es-ES' : 'en-US')}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ['metal', t.resources.metal, 'text-gray-200'],
                        ['crystal', t.resources.crystal, 'text-cyan-300'],
                        ['deuterium', t.resources.deuterium, 'text-emerald-300'],
                      ] as const).map(([k, label, color]) => (
                        <div key={k} className="bg-space-700/50 rounded-lg p-3">
                          <p className="text-xs text-gray-400">{label}</p>
                          <p className={`font-orbitron ${color}`}>{formatNumber(detail.resources[k])}</p>
                          <p className="text-[11px] text-gray-500">+{formatNumber(Math.floor(detail.resources[`${k}_per_hour` as const]))}/h</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                      <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {tx(
                        'La producción del planeta es tuya mientras dure la ocupación. Úsala para producir aquí o transpórtala a tus planetas.',
                        'The planet production is yours while the occupation lasts. Use it to produce here or transport it to your planets.'
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Guarnición */}
                    <div className="card-glass p-4">
                      <h3 className="font-serif text-amber-100 mb-3 flex items-center gap-2"><Shield className="w-5 h-5 text-amber-400" /> {tx('Guarnición', 'Garrison')}</h3>
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

                    {/* Cola */}
                    <div className="card-glass p-4">
                      <h3 className="font-serif text-amber-100 mb-3 flex items-center gap-2"><Factory className="w-5 h-5 text-amber-400" /> {tx('Producción en curso', 'Production in progress')}</h3>
                      {detail.queue.length === 0 ? (
                        <p className="text-sm text-gray-500">{tx('Nada en producción.', 'Nothing in production.')}</p>
                      ) : (
                        <div className="space-y-1">
                          {detail.queue.map((q, idx) => {
                            const end = new Date(q.end_time).getTime();
                            const remaining = Math.max(0, Math.floor((end - now) / 1000));
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
                  </div>

                  {/* Producir */}
                  <div className="card-glass p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <h3 className="font-serif text-amber-100 flex items-center gap-2"><Rocket className="w-5 h-5 text-amber-400" /> {tx('Producir', 'Produce')}</h3>
                      <div className="flex gap-2">
                        {(['ship', 'defense'] as const).map((bt) => (
                          <button
                            key={bt}
                            onClick={() => setBuildType(bt)}
                            className={`px-3 py-1.5 rounded-md text-sm font-semibold ${buildType === bt ? 'bg-orange-600 text-white' : 'bg-space-700 text-gray-400 hover:bg-space-600'}`}
                          >
                            {bt === 'ship' ? tx('Naves', 'Ships') : tx('Defensas', 'Defenses')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      {tx(
                        `Barraca del planeta: nivel ${detail.shipyard_level}. Las naves producidas se unen a tu guarnición; las defensas quedan en el planeta aunque lo pierdas. No se pueden construir edificios ni investigar.`,
                        `Planet shipyard: level ${detail.shipyard_level}. Produced ships join your garrison; defenses stay on the planet even if you lose it. Buildings and research are not allowed.`
                      )}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {options.map((opt) => {
                        const qty = Math.max(1, Math.floor(buildQty[opt.id] || 1));
                        const canPay = detail.resources.metal >= opt.metal_cost * qty
                          && detail.resources.crystal >= opt.crystal_cost * qty
                          && detail.resources.deuterium >= opt.deuterium_cost * qty;
                        const label = buildType === 'ship' ? shipName(opt.code, opt.name) : defName(opt.code, opt.name);
                        return (
                          <div key={opt.id} className={`p-3 rounded-lg border ${opt.available ? 'border-space-600 bg-space-800/60' : 'border-space-700 bg-space-900/50 opacity-60'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              {opt.image_url && <img src={encodeURI(opt.image_url)} alt="" className="w-10 h-10 object-contain" />}
                              <div className="min-w-0">
                                <p className="text-sm text-white truncate">{label}</p>
                                <p className="text-[11px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(opt.unit_time)} / u</p>
                              </div>
                            </div>
                            <p className="text-[11px] text-gray-400">
                              M {formatNumber(opt.metal_cost)} · C {formatNumber(opt.crystal_cost)}{opt.deuterium_cost > 0 ? ` · D ${formatNumber(opt.deuterium_cost)}` : ''}
                            </p>
                            {opt.available ? (
                              <div className="flex gap-2 mt-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={buildQty[opt.id] ?? 1}
                                  onChange={(e) => setBuildQty((s) => ({ ...s, [opt.id]: parseInt(e.target.value) || 1 }))}
                                  className="w-20 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm"
                                />
                                <button
                                  onClick={() => handleBuild(opt)}
                                  disabled={!!busy || !canPay}
                                  className="flex-1 px-2 py-1 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm font-semibold"
                                >
                                  {busy === `build-${opt.id}` ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : canPay ? tx('Producir', 'Produce') : tx('Sin recursos', 'No resources')}
                                </button>
                              </div>
                            ) : (
                              <p className="text-[11px] text-amber-400/80 mt-2">{tx('Requisitos no cumplidos en este planeta', 'Requirements not met on this planet')}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Transporte */}
                  <div className="card-glass p-4">
                    <h3 className="font-serif text-amber-100 mb-3 flex items-center gap-2"><Truck className="w-5 h-5 text-amber-400" /> {tx('Transportar a tus planetas', 'Transport to your planets')}</h3>
                    {detail.transport_targets.length === 0 ? (
                      <p className="text-sm text-gray-500">{tx('No tienes planetas de destino disponibles.', 'No destination planets available.')}</p>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                            ['M', tMetal, setTMetal, detail.resources.metal],
                            ['C', tCrystal, setTCrystal, detail.resources.crystal],
                            ['D', tDeut, setTDeut, detail.resources.deuterium],
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
                                  {translatePlanetName(p.name)} {coords(p.galaxy, p.solar_system, p.position)}{p.planet_type === 'moon' ? ` (${tx('Luna', 'Moon')})` : ''}
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
                  </div>

                  {/* Abandonar */}
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
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------------- Comprar ---------------- */}
      {tab === 'buy' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card-glass p-5 border-amber-500/30">
            {!info ? (
              <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-4">
                  {shipImg && <img src={shipImg} alt="" className="w-24 h-24 object-contain" />}
                  <div>
                    <h2 className="font-serif text-xl text-amber-100">{t.shipyard.occupationShip}</h2>
                    <p className="text-sm text-gray-400">{tx('Exclusiva del sistema · No comerciable', 'System exclusive · Not tradable')}</p>
                  </div>
                </div>
                {info.ship && (
                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    {([
                      [tx('Estructura', 'Structure'), info.ship.structural_integrity],
                      [tx('Escudo', 'Shield'), info.ship.shield_power],
                      [tx('Ataque', 'Attack'), info.ship.weapon_power],
                      [tx('Carga', 'Cargo'), info.ship.cargo_capacity],
                      [tx('Velocidad', 'Speed'), info.ship.base_speed],
                      [tx('Consumo', 'Fuel'), info.ship.fuel_consumption],
                    ] as const).map(([l, v]) => (
                      <div key={l} className="bg-space-700/50 rounded p-2">
                        <p className="text-[11px] text-gray-400">{l}</p>
                        <p className="text-sm text-white font-orbitron">{formatNumber(v)}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">{tx('Precio por nave', 'Price per ship')}</span><span className="text-white">{info.unit_price_usd} USD</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">{tx('Precio TUNG en vivo', 'Live TUNG price')}</span><span className="text-white">{info.tung_price_usd ? `$${Number(info.tung_price_usd).toFixed(6)}` : tx('No disponible', 'Unavailable')}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">{tx('Tu saldo', 'Your balance')}</span><span className="text-amber-300">{formatNumber(Math.floor(Number(info.balance)))} TUNG</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{tx('Entrega en', 'Delivered to')}</span>
                    <span className="text-white">{currentPlanet ? `${translatePlanetName(currentPlanet.name)} ${coords(currentPlanet.galaxy, currentPlanet.solar_system, currentPlanet.position)}` : '-'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-sm text-gray-400">{tx('Cantidad', 'Quantity')}</span>
                  <input
                    type="number"
                    min={1}
                    max={info.max_per_purchase}
                    value={buyQty}
                    onChange={(e) => setBuyQty(Math.min(info.max_per_purchase, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-20 px-2 py-1 rounded bg-space-900 border border-space-600 text-white text-sm"
                  />
                  <span className="text-xs text-gray-500">{tx(`máx. ${info.max_per_purchase} por compra`, `max ${info.max_per_purchase} per purchase`)}</span>
                </div>
                <button
                  onClick={handleBuy}
                  disabled={!!busy || !currentPlanet || buyCost == null || Number(info.balance) < buyCost}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 disabled:opacity-40 text-white font-bold"
                >
                  {busy === 'buy' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coins className="w-5 h-5" />}
                  {buyCost != null ? `${tx('Comprar por', 'Buy for')} ${formatNumber(buyCost)} TUNG` : tx('Precio no disponible', 'Price unavailable')}
                </button>
                {buyCost != null && Number(info.balance) < buyCost && (
                  <p className="text-xs text-red-400 mt-2 text-center">{tx('TUNG insuficiente', 'Insufficient TUNG')}</p>
                )}
              </>
            )}
          </div>

          <div className="card-glass p-5">
            <h3 className="font-serif text-amber-100 mb-3 flex items-center gap-2"><Info className="w-5 h-5 text-amber-400" /> {tx('Cómo funciona', 'How it works')}</h3>
            <ul className="space-y-2 text-sm text-gray-300 list-disc pl-5">
              <li>{tx('Envía la nave en una misión de Ataque contra una colonia enemiga, acompañada de al menos otra nave.', 'Send the ship on an Attack mission against an enemy colony, together with at least one other ship.')}</li>
              <li>{tx('Si ganas y el Guardián sobrevive, el planeta queda ocupado. La nave no se gasta: se queda con tu flota como guarnición.', 'If you win and the Guardian survives, the planet becomes occupied. The ship is not consumed: it stays with your fleet as garrison.')}</li>
              <li>{tx('Si el dueño gana la batalla de recuperación, el Guardián se destruye. Si abandonas, vuelve a tu base con toda la guarnición según su velocidad de vuelo.', 'If the owner wins the recovery battle, the Guardian is destroyed. If you abandon, it flies back to your base with the whole garrison at its flight speed.')}</li>
              <li>{tx('Solo colonias: nunca planetas principales ni lunas. Sin límite total, pero máximo 3 colonias ocupadas de un mismo jugador.', 'Colonies only: never main planets or moons. No total limit, but at most 3 occupied colonies from the same player.')}</li>
              <li>{tx('Te quedas con la producción, puedes fabricar naves y defensas y transportar recursos. No puedes construir edificios ni investigar.', 'You keep the production, can produce ships and defenses and transport resources. No buildings or research.')}</li>
              <li>{tx('El dueño puede recuperarla atacando tu guarnición (solo o con su SAC). Puedes abandonarla cuando quieras.', 'The owner can recover it by attacking your garrison (solo or with their ACS). You can abandon it anytime.')}</li>
              <li>{tx('Si ganas pero no se puede ocupar, la flota regresa a casa con la nave y recibes un mensaje con el motivo.', 'If you win but the occupation is not possible, the fleet returns home with the ship and you get a message with the reason.')}</li>
            </ul>
            <button
              onClick={() => navigate('/game/fleet?mission=attack')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-space-700 hover:bg-space-600 text-gray-200 text-sm font-semibold"
            >
              <Swords className="w-4 h-4" /> {tx('Ir a Flota', 'Go to Fleet')}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Ranking ---------------- */}
      {tab === 'ranking' && (
        <div className="card-glass p-4">
          <h2 className="font-serif text-amber-100 mb-3 flex items-center gap-2"><Crown className="w-5 h-5 text-amber-400" /> {tx('Salón de Conquistadores', 'Hall of Conquerors')}</h2>
          {!ranking ? (
            <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
          ) : ranking.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">{tx('Aún no hay conquistadores. ¡Sé el primero!', 'No conquerors yet. Be the first!')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs border-b border-space-600">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">{tx('Jugador', 'Player')}</th>
                    <th className="text-right py-2 px-2">{tx('Conquistas', 'Conquests')}</th>
                    <th className="text-right py-2 px-2">{tx('Activas', 'Active')}</th>
                    <th className="text-right py-2 px-2">{tx('Recuperadas por el dueño', 'Recovered by owner')}</th>
                    <th className="text-right py-2 px-2">{tx('Horas ocupando', 'Hours occupying')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr key={r.rank} className={`border-b border-space-700/50 ${r.is_me ? 'bg-amber-950/30' : ''}`}>
                      <td className="py-2 px-2 font-orbitron text-amber-300">{r.rank}</td>
                      <td className="py-2 px-2 text-white">{r.username}{r.is_me && <span className="ml-2 text-xs text-red-300">({tx('tú', 'you')})</span>}</td>
                      <td className="py-2 px-2 text-right text-white">{formatNumber(r.conquests)}</td>
                      <td className="py-2 px-2 text-right text-amber-300">{formatNumber(r.active)}</td>
                      <td className="py-2 px-2 text-right text-red-300">{formatNumber(r.recovered_by_owner)}</td>
                      <td className="py-2 px-2 text-right text-gray-300">{formatNumber(r.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
