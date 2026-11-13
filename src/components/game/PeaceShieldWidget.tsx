import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Shield, ShieldCheck, ShieldOff, Swords, X, AlertTriangle, Check, Coins, Clock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

interface ShieldPackage {
  hours: number;
  usd: number;
  tung: number | null;
}

interface ShieldStatus {
  success: boolean;
  active: boolean;
  until: string | null;
  cooldown_until: string | null;
  max_hours: number;
  packages: ShieldPackage[];
  tung_price: number | null;
  balance: number;
  incoming_attack: boolean;
  outgoing_attack: boolean;
  server_now: string;
}

const CHANGED_EVENT = 'peace-shield-changed';

export function usePeaceShieldStatus(pollMs = 60000) {
  const { profile } = useAuthStore();
  const [status, setStatus] = useState<ShieldStatus | null>(null);
  const [skew, setSkew] = useState(0);

  const reload = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase.rpc('get_peace_shield_status');
    if (error || !data?.success) return;
    const s = data as ShieldStatus;
    setSkew(new Date(s.server_now).getTime() - Date.now());
    setStatus(s);
  }, [profile?.id]);

  useEffect(() => {
    reload();
    const id = setInterval(reload, pollMs);
    const onChange = () => reload();
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => {
      clearInterval(id);
      window.removeEventListener(CHANGED_EVENT, onChange);
    };
  }, [reload, pollMs]);

  return { status, skew, reload };
}

function useNow(skew: number, everyMs: number) {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    setNow(Date.now() + skew);
    const id = setInterval(() => setNow(Date.now() + skew), everyMs);
    return () => clearInterval(id);
  }, [skew, everyMs]);
  return now;
}

function formatLeft(ms: number) {
  if (ms <= 0) return '0m';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function packageLabel(hours: number) {
  if (hours < 48) return `${hours} HORAS`;
  const days = Math.round(hours / 24);
  return `${days} DÍAS`;
}

/** Aviso que se muestra antes de lanzar un ataque / misiles con el escudo activo */
export function PeaceShieldAttackWarning({ action = 'ataque' }: { action?: string }) {
  const { status, skew } = usePeaceShieldStatus(120000);
  const now = useNow(skew, 30000);
  if (!status?.active || !status.until) return null;
  const left = new Date(status.until).getTime() - now;
  if (left <= 0) return null;

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-400/50 bg-gradient-to-r from-amber-500/15 via-red-500/10 to-transparent shadow-[0_0_14px_rgba(251,191,36,0.15)]">
      <div className="relative flex-shrink-0 mt-0.5">
        <Shield className="w-5 h-5 text-emerald-300" />
        <X className="w-3 h-3 text-red-400 absolute -bottom-1 -right-1" strokeWidth={3} />
      </div>
      <div className="text-xs sm:text-sm leading-snug">
        <p className="font-bold text-amber-300 uppercase tracking-wide">Perderás tu Escudo de Paz</p>
        <p className="text-amber-100/80">
          Te quedan <span className="font-orbitron text-emerald-300">{formatLeft(left)}</span> de protección. Si confirmas este {action},
          el escudo se desactiva al instante, pierdes el tiempo restante y no podrás comprar otro durante 24 h.
        </p>
      </div>
    </div>
  );
}

/** Barra compacta para Visión General + modal de compra */
export function PeaceShieldWidget() {
  const { status, skew, reload } = usePeaceShieldStatus(60000);
  const [open, setOpen] = useState(false);
  const now = useNow(skew, 1000);

  const untilMs = status?.until ? new Date(status.until).getTime() : 0;
  const leftMs = untilMs - now;
  const active = !!status?.active && leftMs > 0;
  const cdMs = status?.cooldown_until ? new Date(status.cooldown_until).getTime() - now : 0;
  const inCooldown = !active && cdMs > 0;
  const expiringSoon = active && leftMs < 3 * 3600000;
  const minUsd = status?.packages?.length ? Math.min(...status.packages.map((p) => p.usd)) : 0.5;

  useEffect(() => {
    if (status?.active && untilMs > 0 && leftMs <= 0) reload();
  }, [status?.active, untilMs, leftMs, reload]);

  if (!status) return null;

  const tone = active
    ? expiringSoon
      ? 'border-amber-400/60 from-amber-500/20 via-amber-900/10 shadow-[0_0_18px_rgba(251,191,36,0.25)]'
      : 'border-emerald-400/60 from-emerald-500/20 via-stone-900/10 shadow-[0_0_18px_rgba(16,185,129,0.25)]'
    : inCooldown
      ? 'border-red-500/40 from-red-500/15 via-slate-900/10'
      : 'border-amber-500/50 from-amber-500/15 via-stone-900/15 shadow-[0_0_16px_rgba(245,158,11,0.18)] hover:shadow-[0_0_24px_rgba(245,158,11,0.35)]';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative w-full overflow-hidden rounded-xl border bg-gradient-to-r to-transparent px-3 py-2.5 text-left transition-all ${tone}`}
      >
        <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 group-hover:translate-x-[400%] transition-all duration-1000" />
        <div className="relative flex items-center gap-3">
          <div className={`relative flex-shrink-0 p-1.5 rounded-lg border ${
            active ? (expiringSoon ? 'bg-amber-500/20 border-amber-400/40' : 'bg-emerald-500/20 border-emerald-400/40')
              : inCooldown ? 'bg-red-500/15 border-red-500/30' : 'bg-amber-500/15 border-amber-500/40'
          }`}>
            {active ? (
              <ShieldCheck className={`w-5 h-5 ${expiringSoon ? 'text-amber-300 animate-pulse' : 'text-emerald-300'}`} />
            ) : inCooldown ? (
              <ShieldOff className="w-5 h-5 text-red-400" />
            ) : (
              <Shield className="w-5 h-5 text-amber-300 animate-pulse" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-orbitron text-xs sm:text-sm font-bold tracking-wider ${
                active ? (expiringSoon ? 'text-amber-300' : 'text-emerald-300') : inCooldown ? 'text-red-300' : 'text-amber-200'
              }`}>
                ESCUDO DE PAZ
              </span>
              {active && (
                <span className={`flex items-center gap-1 text-[11px] font-orbitron px-2 py-0.5 rounded-full ${
                  expiringSoon ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/15 text-emerald-200'
                }`}>
                  <Clock className="w-3 h-3" /> {formatLeft(leftMs)}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-300/80 truncate">
              {active
                ? expiringSoon
                  ? 'Expira pronto · amplíalo para seguir protegido'
                  : 'Protegido · si atacas pierdes el escudo'
                : inCooldown
                  ? `Perdido por atacar · podrás comprar otro en ${formatLeft(cdMs)}`
                  : `Que nadie te ataque ni te espíe · desde $${minUsd.toFixed(2)}`}
            </p>
          </div>
          {!inCooldown && (
            <span className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold whitespace-nowrap ${
              active
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'bg-gradient-to-r from-amber-500 to-amber-700 text-stone-950 shadow-lg shadow-amber-500/20'
            }`}>
              {active ? 'Ampliar' : 'Activar'}
            </span>
          )}
        </div>
      </button>
      {open && (
        <PeaceShieldModal
          status={status}
          active={active}
          leftMs={leftMs}
          cdMs={cdMs}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PeaceShieldModal({
  status,
  active,
  leftMs,
  cdMs,
  onClose,
}: {
  status: ShieldStatus;
  active: boolean;
  leftMs: number;
  cdMs: number;
  onClose: () => void;
}) {
  const { profile, fetchProfile } = useAuthStore();
  const [selected, setSelected] = useState<number | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !buying) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, buying]);

  const balance = Number(profile?.tung_balance ?? status.balance ?? 0);
  const leftHours = active ? leftMs / 3600000 : 0;
  const inCooldown = !active && cdMs > 0;
  const blockedReason = inCooldown
    ? `Perdiste tu escudo por atacar. Podrás comprar otro en ${formatLeft(cdMs)}.`
    : status.incoming_attack
      ? 'Tienes ataques enemigos en camino. No puedes activar el escudo hasta que lleguen.'
      : status.outgoing_attack
        ? 'Tienes ejércitos de ataque en marcha. Espera a que impacten o retíralos.'
        : status.tung_price == null
          ? 'Precio de TUNG no disponible ahora mismo. Inténtalo en unos minutos.'
          : null;

  const pkgs = status.packages || [];
  const sel = pkgs.find((p) => p.hours === selected) || null;
  const exceeds = (p: ShieldPackage) => leftHours + p.hours > status.max_hours + 0.01;
  const canBuy = !!sel && sel.tung != null && !blockedReason && !exceeds(sel) && balance >= sel.tung && accepted && !buying;

  const buy = async () => {
    if (!sel || !canBuy) return;
    setBuying(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('buy_peace_shield', { p_hours: sel.hours });
    setBuying(false);
    if (error) {
      setMsg({ type: 'err', text: error.message });
      return;
    }
    if (data?.success) {
      setMsg({
        type: 'ok',
        text: `¡Escudo ${data.extended ? 'ampliado' : 'activado'}! Protegido hasta ${new Date(data.until).toLocaleString()}. Coste: ${data.cost} TUNG.`,
      });
      setSelected(null);
      setAccepted(false);
      fetchProfile();
      window.dispatchEvent(new Event(CHANGED_EVENT));
    } else {
      setMsg({ type: 'err', text: data?.error || 'No se pudo activar el escudo' });
    }
  };

  const badge = (hours: number) => (hours === 168 ? 'POPULAR' : hours === 360 ? 'MEJOR PRECIO' : null);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm" onClick={() => !buying && onClose()}>
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-amber-600/40 bg-gradient-to-b from-[#241a10] via-[#1b1209] to-[#0f0a05] shadow-[0_0_40px_rgba(245,158,11,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl" />
        <button
          onClick={onClose}
          disabled={buying}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabecera */}
        <div className="relative px-5 pt-6 pb-4 text-center border-b border-amber-600/20">
          <div className="mx-auto mb-2 w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400/30 to-amber-700/30 border border-amber-300/50 shadow-[0_0_30px_rgba(245,158,11,0.45)]">
            {active ? <ShieldCheck className="w-9 h-9 text-emerald-300" /> : <Shield className="w-9 h-9 text-amber-200" />}
          </div>
          <h2 className="font-orbitron text-xl sm:text-2xl font-bold tracking-[0.15em] text-white drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
            ESCUDO DE PAZ
          </h2>
          {active ? (
            <p className="mt-1 text-sm text-emerald-300">
              Activo · quedan <span className="font-orbitron">{formatLeft(leftMs)}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-300">Protege tu imperio mientras no estás.</p>
          )}
        </div>

        <div className="relative p-4 sm:p-5 space-y-4">
          {/* Reglas */}
          <div className="grid gap-1.5 text-xs sm:text-sm">
            <p className="flex items-start gap-2 text-slate-200"><Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> Nadie puede atacarte, espiarte ni lanzarte misiles.</p>
            <p className="flex items-start gap-2 text-slate-200"><Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> Protege todas tus ciudades y Castras de Diana. Ampliable hasta 15 días acumulados.</p>
            <p className="flex items-start gap-2 text-slate-200"><Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> Puedes seguir construyendo, investigando, comerciando, transportando y espiando.</p>
            <div className="flex items-start gap-2 p-2.5 mt-1 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200">
              <Swords className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>
                <b className="text-red-300">Si atacas o lanzas misiles, pierdes el escudo al instante</b> junto con el tiempo restante (sin reembolso)
                y no podrás comprar otro durante 24 h.
              </span>
            </div>
          </div>

          {/* Tabla de precios */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {pkgs.map((p) => {
              const isSel = selected === p.hours;
              const over = exceeds(p);
              const noFunds = p.tung != null && balance < p.tung;
              const disabled = !!blockedReason || over || p.tung == null;
              const b = badge(p.hours);
              return (
                <button
                  key={p.hours}
                  type="button"
                  disabled={disabled}
                  onClick={() => { setSelected(p.hours); setMsg(null); }}
                  className={`relative rounded-xl border px-2 pt-4 pb-3 text-center transition-all ${
                    disabled
                      ? 'border-slate-700/60 bg-slate-800/40 opacity-50 cursor-not-allowed'
                      : isSel
                        ? 'border-amber-300 bg-gradient-to-b from-amber-500/30 to-amber-700/20 shadow-[0_0_20px_rgba(245,158,11,0.45)] scale-[1.03]'
                        : 'border-amber-600/30 bg-white/[0.03] hover:border-amber-400/60 hover:bg-amber-500/10'
                  }`}
                >
                  {b && (
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider ${
                      p.hours === 360 ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900' : 'bg-gradient-to-r from-yellow-400 to-amber-600 text-stone-950'
                    }`}>
                      {b}
                    </span>
                  )}
                  <div className="font-orbitron text-[11px] sm:text-xs tracking-widest text-amber-200">{packageLabel(p.hours)}</div>
                  <div className="mt-1 font-orbitron text-2xl font-bold text-white drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">
                    ${p.usd.toFixed(2)}
                  </div>
                  <div className={`mt-0.5 text-[11px] flex items-center justify-center gap-1 ${noFunds ? 'text-red-400' : 'text-amber-300'}`}>
                    <Coins className="w-3 h-3" /> {p.tung != null ? `${p.tung.toLocaleString()} TUNG` : '—'}
                  </div>
                  {over && <div className="mt-1 text-[10px] text-slate-400">Supera 15 días</div>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
            <span>Tu saldo: <b className="text-amber-300">{Math.floor(balance).toLocaleString()} TUNG</b></span>
            {status.tung_price != null && <span>1 TUNG ≈ ${Number(status.tung_price).toFixed(6)}</span>}
          </div>

          {blockedReason && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs sm:text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {blockedReason}
            </div>
          )}

          {sel && !blockedReason && (
            <label className="flex items-start gap-2 p-2.5 rounded-lg border border-red-500/30 bg-red-500/5 text-xs sm:text-sm text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              Entiendo que si ataco o lanzo misiles perderé el escudo y el tiempo que me quede.
            </label>
          )}

          {msg && (
            <div className={`text-xs sm:text-sm px-3 py-2 rounded-lg border ${
              msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-red-500/10 text-red-300 border-red-500/30'
            }`}>
              {msg.text}
            </div>
          )}

          <button
            type="button"
            onClick={buy}
            disabled={!canBuy}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all ${
              canBuy
                ? 'bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 text-white shadow-[0_0_22px_rgba(34,211,238,0.45)] hover:brightness-110'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {buying ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : !sel ? (
              'ELIGE UNA DURACIÓN'
            ) : sel.tung != null && balance < sel.tung ? (
              'TUNG INSUFICIENTE'
            ) : (
              <>
                <Shield className="w-4 h-4" />
                {active ? 'AMPLIAR' : 'ACTIVAR'} {packageLabel(sel.hours)} · {sel.tung?.toLocaleString()} TUNG
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
