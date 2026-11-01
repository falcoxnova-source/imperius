import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Crown,
  Wheat,
  Hammer,
  Scroll,
  Swords,
  Ship,
  Zap,
  Layers,
  Clock,
  Sparkles,
  Flame,
  Target,
  Gem,
  Anchor,
  Shield,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBonusSummary, type BonusEntry, type BonusKind } from '../../lib/useBonusSummary';

/* -------------------------------------------------------------------------- */
/*                                  Estilos                                   */
/* -------------------------------------------------------------------------- */

interface KindStyle {
  icon: LucideIcon;
  glow: string;
  text: string;
  chip: string;
}

const KIND_STYLE: Record<BonusKind, KindStyle> = {
  production: { icon: Wheat, glow: '#fbbf24', text: 'text-amber-300', chip: 'bg-amber-500/10 border-amber-400/30' },
  build: { icon: Hammer, glow: '#fb923c', text: 'text-orange-300', chip: 'bg-orange-500/10 border-orange-400/30' },
  research: { icon: Scroll, glow: '#eab308', text: 'text-yellow-300', chip: 'bg-yellow-500/10 border-yellow-400/30' },
  shipyard: { icon: Swords, glow: '#f87171', text: 'text-red-300', chip: 'bg-red-500/10 border-red-400/30' },
  fleet: { icon: Ship, glow: '#60a5fa', text: 'text-blue-300', chip: 'bg-blue-500/10 border-blue-400/30' },
  energy: { icon: Zap, glow: '#fde047', text: 'text-yellow-200', chip: 'bg-yellow-500/10 border-yellow-400/30' },
  queue: { icon: Layers, glow: '#d6d3d1', text: 'text-stone-300', chip: 'bg-stone-500/10 border-stone-400/30' },
};

const SOURCE_ICON: Record<string, LucideIcon> = {
  vip: Crown,
  geologist: Gem,
  technocrat: Scroll,
  admiral: Anchor,
  engineer: Hammer,
  commander: Shield,
  daily_streak: Flame,
  daily_mission: Target,
};

const KIND_ORDER: BonusKind[] = ['production', 'build', 'research', 'shipyard', 'fleet', 'energy', 'queue'];

/* -------------------------------------------------------------------------- */
/*                                 Countdown                                  */
/* -------------------------------------------------------------------------- */

function Countdown({ expiresAt, expiredLabel }: { expiresAt: string; expiredLabel: string }) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setDisplay(expiredLabel);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(
        d > 0
          ? `${d}d ${h}h`
          : `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, expiredLabel]);

  return <span className="font-mono tabular-nums">{display}</span>;
}

/* -------------------------------------------------------------------------- */
/*                             Numero animado                                 */
/* -------------------------------------------------------------------------- */

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.requestAnimationFrame) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/* -------------------------------------------------------------------------- */
/*                                  Tarjeta                                   */
/* -------------------------------------------------------------------------- */

interface KindGroup {
  kind: BonusKind;
  entries: BonusEntry[];
  /** Valor mostrado en grande: multiplicador de tiempo o de produccion. */
  multiplier: number | null;
  /** Etiqueta grande alternativa (p.ej. "+2" espacios de cola). */
  rawLabel: string | null;
}

function BonusCard({ group, featured }: { group: KindGroup; featured: boolean }) {
  const { t } = useI18n();
  const style = KIND_STYLE[group.kind];
  const Icon = style.icon;
  const animated = useCountUp(group.multiplier ?? 0);

  const kindName = {
    production: t.bonuses.kindProduction,
    build: t.bonuses.kindBuild,
    research: t.bonuses.kindResearch,
    shipyard: t.bonuses.kindShipyard,
    fleet: t.bonuses.kindFleet,
    energy: t.bonuses.kindEnergy,
    queue: t.bonuses.kindQueue,
  }[group.kind];

  const kindDesc = {
    production: t.bonuses.kindProductionDesc,
    build: t.bonuses.kindBuildDesc,
    research: t.bonuses.kindResearchDesc,
    shipyard: t.bonuses.kindShipyardDesc,
    fleet: t.bonuses.kindFleetDesc,
    energy: t.bonuses.kindEnergyDesc,
    queue: t.bonuses.kindQueueDesc,
  }[group.kind];

  const sourceName: Record<string, string> = {
    vip: t.bonuses.srcVip,
    geologist: t.bonuses.srcGeologist,
    technocrat: t.bonuses.srcTechnocrat,
    admiral: t.bonuses.srcAdmiral,
    engineer: t.bonuses.srcEngineer,
    commander: t.bonuses.srcCommander,
    daily_streak: t.bonuses.srcDailyStreak,
    daily_mission: t.bonuses.srcDailyMission,
  };

  const isProductionLike = group.kind === 'production' || group.kind === 'energy';
  const gainPercent = group.multiplier !== null ? Math.round((group.multiplier - 1) * 100) : 0;

  return (
    <div
      className={`bonus-aura bonus-halo relative rounded-xl border border-amber-700/40 bg-gradient-to-br from-stone-800/95 to-stone-900/95 p-4 overflow-hidden transition-transform duration-300 hover:-translate-y-1 ${
        featured ? 'sm:col-span-2' : ''
      }`}
      style={{ ['--bonus-glow' as string]: style.glow }}
    >
      <div className="bonus-sweep" aria-hidden="true" />
      <div className="bonus-particles" aria-hidden="true">
        {[12, 34, 52, 71, 88].map((left, i) => (
          <span key={left} className="bonus-particle" style={{ left: `${left}%`, animationDelay: `${i * 0.9}s` }} />
        ))}
      </div>

      <div className="relative z-10">
        <div className="flex items-start gap-3">
          <div className={`bonus-icon-float shrink-0 w-11 h-11 rounded-lg flex items-center justify-center border ${style.chip}`}>
            <Icon className={`w-6 h-6 ${style.text}`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-widest text-stone-400 font-semibold">{kindName}</div>
            <div className="text-[11px] text-stone-500 leading-tight mt-0.5">{kindDesc}</div>
          </div>

          <div className="text-right shrink-0">
            {group.multiplier !== null ? (
              <>
                <div className={`bonus-value-glow font-serif font-black leading-none ${style.text} text-2xl sm:text-3xl`}>
                  {isProductionLike ? `+${Math.round((animated - 1) * 100)}%` : `x${animated.toFixed(2)}`}
                </div>
                <div className="text-[10px] text-stone-400 mt-1">
                  {isProductionLike ? t.bonuses.moreProduction : `+${gainPercent}% ${t.bonuses.faster}`}
                </div>
              </>
            ) : (
              <div className={`bonus-value-glow font-serif font-black leading-none ${style.text} text-2xl sm:text-3xl`}>
                {group.rawLabel}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-amber-700/30 space-y-1.5">
          {group.entries.map((e, idx) => {
            const SIcon = SOURCE_ICON[e.code] ?? Sparkles;
            const label = sourceName[e.code] ?? e.code;
            return (
              <div key={`${e.code}-${e.kind}-${idx}`} className="flex items-center gap-2 text-xs">
                <SIcon className={`w-3.5 h-3.5 shrink-0 ${e.code === 'vip' ? 'text-amber-300' : 'text-stone-400'}`} />
                <span className={`truncate ${e.code === 'vip' ? 'text-amber-200 font-semibold' : 'text-stone-300'}`}>
                  {e.title || label}
                  {e.code === 'daily_streak' && e.meta?.streak ? ` · ${e.meta.streak} ${t.bonuses.streakDays}` : ''}
                  {e.code === 'commander' && e.meta?.slots ? ` · +${e.meta.slots} ${t.bonuses.extraSlots}` : ''}
                </span>
                {e.percent > 0 && (
                  <span className={`ml-auto shrink-0 font-mono font-semibold ${style.text}`}>
                    +{Number(e.percent).toFixed(Number(e.percent) % 1 === 0 ? 0 : 2)}%
                  </span>
                )}
                {e.expires_at ? (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] text-stone-400 bg-stone-900/70 px-1.5 py-0.5 rounded">
                    <Clock className="w-2.5 h-2.5" />
                    <Countdown expiresAt={e.expires_at} expiredLabel={t.bonuses.expired} />
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-stone-500 bg-stone-900/70 px-1.5 py-0.5 rounded">
                    {t.bonuses.permanent}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Panel                                    */
/* -------------------------------------------------------------------------- */

export function ActiveBonusesPanel({
  compact = false,
  variant = 'full',
}: { compact?: boolean; variant?: 'full' | 'bar' } = {}) {
  const { t } = useI18n();
  const { summary, loading } = useBonusSummary();
  const [open, setOpen] = useState(false);

  const groups = useMemo<KindGroup[]>(() => {
    if (!summary) return [];
    const byKind = new Map<BonusKind, BonusEntry[]>();
    for (const e of summary.entries) {
      const list = byKind.get(e.kind) ?? [];
      list.push(e);
      byKind.set(e.kind, list);
    }

    const result: KindGroup[] = [];
    for (const kind of KIND_ORDER) {
      const entries = byKind.get(kind);
      if (!entries || entries.length === 0) continue;

      let multiplier: number | null = null;
      let rawLabel: string | null = null;

      if (kind === 'queue') {
        rawLabel = `+${entries.reduce((acc, e) => acc + (e.meta?.slots ?? 0), 0)}`;
      } else if (kind === 'energy') {
        multiplier = entries.reduce((acc, e) => acc * (1 + Number(e.percent) / 100), 1);
      } else {
        multiplier = Number(summary.totals[kind as keyof typeof summary.totals]);
      }

      result.push({ kind, entries, multiplier, rawLabel });
    }
    return result;
  }, [summary]);

  if (loading || !summary) return null;

  const totalCount = summary.entries.length;

  /* ------------------------- Variante barra compacta ------------------------ */
  if (variant === 'bar') {
    if (totalCount === 0) {
      return (
        <Link
          to="/game/vip"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-400/25 bg-amber-500/5 hover:bg-amber-500/10 transition"
        >
          <Crown className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
          <span className="text-[11px] text-slate-400 truncate">{t.bonuses.emptyHint}</span>
          <span className="ml-auto text-[11px] font-bold text-amber-300 shrink-0">{t.bonuses.getVip}</span>
        </Link>
      );
    }

    return (
      <div
        className="bonus-aura relative rounded-lg border border-amber-700/40 bg-stone-900/60 overflow-hidden"
        style={{ ['--bonus-glow' as string]: '#fbbf24' }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative z-10 w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-800/40 transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 bonus-icon-float" />
          <span className="text-[11px] font-serif font-bold bonus-vip-shine shrink-0">{t.bonuses.title}</span>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0">
            {groups.map((g) => {
              const s = KIND_STYLE[g.kind];
              const GIcon = s.icon;
              const isProdLike = g.kind === 'production' || g.kind === 'energy';
              const label =
                g.multiplier === null
                  ? g.rawLabel
                  : isProdLike
                    ? `+${Math.round((g.multiplier - 1) * 100)}%`
                    : `x${g.multiplier.toFixed(2).replace(/\.00$/, '')}`;
              return (
                <span
                  key={g.kind}
                  className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${s.chip} ${s.text}`}
                >
                  <GIcon className="w-3 h-3" />
                  {label}
                </span>
              );
            })}
          </div>

          {summary.is_plus && (
            <span className="hidden sm:flex ml-auto shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-stone-900 items-center gap-0.5">
              <Crown className="w-2.5 h-2.5" />
              PLUS
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-stone-400 shrink-0 transition-transform ${summary.is_plus ? '' : 'ml-auto'} ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="relative z-10 px-3 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-amber-700/30">
            {groups.map((g) => (
              <BonusCard key={g.kind} group={g} featured={false} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div
        className="bonus-aura bonus-halo relative card-glass rounded-xl p-5 overflow-hidden"
        style={{ ['--bonus-glow' as string]: '#fbbf24' }}
      >
        <div className="bonus-sweep" aria-hidden="true" />
        <div className="relative z-10 text-center">
          <Crown className="w-8 h-8 text-amber-400/70 mx-auto mb-2 bonus-icon-float" />
          <div className="text-sm font-serif font-semibold text-stone-200">{t.bonuses.empty}</div>
          <div className="text-xs text-stone-400 mt-1">{t.bonuses.emptyHint}</div>
          <Link
            to="/game/vip"
            className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-stone-900 text-xs font-bold hover:brightness-110 transition"
          >
            <Sparkles className="w-4 h-4" />
            {t.bonuses.getVip}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="w-4 h-4 text-amber-400 bonus-icon-float" />
        <h3 className="font-serif text-sm font-bold bonus-vip-shine">{t.bonuses.title}</h3>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300">
          {totalCount} {t.bonuses.active}
        </span>
        {summary.is_plus && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-stone-900 flex items-center gap-1">
            <Crown className="w-3 h-3" />
            PLUS
          </span>
        )}
        {!compact && <span className="text-[11px] text-stone-500 ml-auto hidden sm:block">{t.bonuses.subtitle}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {groups.map((g, i) => (
          <BonusCard key={g.kind} group={g} featured={!compact && groups.length % 2 === 1 && i === 0} />
        ))}
      </div>
    </div>
  );
}
