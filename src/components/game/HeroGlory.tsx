import { useEffect, useState } from 'react';
import { Crown, Lock, Check, Swords, Star, Shield, Gem, Trophy } from 'lucide-react';
import { Laurel } from '../ui/RomanOrnaments';
import { supabase } from '../../lib/supabase';

// Progreso visual del Héroe: rangos, hazañas y celebración de victoria.
// Todo se deriva de datos existentes (nivel, equipo y duelos); no otorga
// ventajas de combate ni recompensas.

interface GloryRank {
  minLevel: number;
  name: string;
  text: string;
  ring: string;
  aura: string;
}

export const GLORY_RANKS: GloryRank[] = [
  { minLevel: 1, name: 'Recluta', text: 'text-stone-300', ring: 'border-stone-400', aura: 'rgba(168,162,158,0.25)' },
  { minLevel: 3, name: 'Legionario', text: 'text-amber-200', ring: 'border-amber-600', aura: 'rgba(217,119,6,0.30)' },
  { minLevel: 5, name: 'Centurión', text: 'text-orange-300', ring: 'border-orange-400', aura: 'rgba(251,146,60,0.35)' },
  { minLevel: 10, name: 'Tribuno', text: 'text-sky-300', ring: 'border-sky-400', aura: 'rgba(56,189,248,0.35)' },
  { minLevel: 15, name: 'Legado', text: 'text-violet-300', ring: 'border-violet-400', aura: 'rgba(167,139,250,0.40)' },
  { minLevel: 25, name: 'General', text: 'text-rose-300', ring: 'border-rose-400', aura: 'rgba(251,113,133,0.40)' },
  { minLevel: 40, name: 'César', text: 'text-yellow-200', ring: 'border-yellow-300', aura: 'rgba(253,224,71,0.50)' },
];

export function getGloryRank(level: number) {
  let idx = 0;
  GLORY_RANKS.forEach((r, i) => { if (level >= r.minLevel) idx = i; });
  return { rank: GLORY_RANKS[idx], index: idx, next: GLORY_RANKS[idx + 1] ?? null };
}

interface GloryShip {
  level: number;
  weapon_slot: { rarity: string } | null;
  shield_slot: { rarity: string } | null;
  module_slot: { rarity: string } | null;
  reactor_slot: { rarity: string } | null;
}

interface Feat {
  id: string;
  name: string;
  desc: string;
  icon: typeof Star;
  current: number;
  goal: number;
}

function buildFeats(ship: GloryShip, wins: number, battles: number, winRate: number): Feat[] {
  const slots = [ship.weapon_slot, ship.shield_slot, ship.module_slot, ship.reactor_slot];
  const equipped = slots.filter(Boolean).length;
  const hasEpic = slots.some(s => s && (s.rarity === 'epic' || s.rarity === 'legendary')) ? 1 : 0;
  const hasLegendary = slots.some(s => s && s.rarity === 'legendary') ? 1 : 0;
  const unbeaten = battles >= 10 && winRate >= 70 ? 1 : 0;

  return [
    { id: 'lvl3', name: 'Juramento', desc: 'Alcanza el nivel 3', icon: Star, current: ship.level, goal: 3 },
    { id: 'lvl5', name: 'Veterano', desc: 'Alcanza el nivel 5', icon: Star, current: ship.level, goal: 5 },
    { id: 'lvl10', name: 'Hijo de Marte', desc: 'Alcanza el nivel 10', icon: Star, current: ship.level, goal: 10 },
    { id: 'lvl25', name: 'Leyenda de Roma', desc: 'Alcanza el nivel 25', icon: Crown, current: ship.level, goal: 25 },
    { id: 'win1', name: 'Primera Sangre', desc: 'Gana tu primer duelo', icon: Swords, current: wins, goal: 1 },
    { id: 'win5', name: 'Gladiador', desc: 'Gana 5 duelos', icon: Swords, current: wins, goal: 5 },
    { id: 'win20', name: 'Campeón de la Arena', desc: 'Gana 20 duelos', icon: Trophy, current: wins, goal: 20 },
    { id: 'win50', name: 'Favorito del Coliseo', desc: 'Gana 50 duelos', icon: Trophy, current: wins, goal: 50 },
    { id: 'unbeaten', name: 'Invicto', desc: '70% de victorias con 10+ duelos', icon: Shield, current: unbeaten, goal: 1 },
    { id: 'gear4', name: 'Armadura Completa', desc: 'Equipa las 4 piezas', icon: Shield, current: equipped, goal: 4 },
    { id: 'epic', name: 'Reliquia Épica', desc: 'Equipa una pieza épica', icon: Gem, current: hasEpic, goal: 1 },
    { id: 'legend', name: 'Tesoro Legendario', desc: 'Equipa una pieza legendaria', icon: Gem, current: hasLegendary, goal: 1 },
  ];
}

export function HeroGloryTab({ ship, userId }: { ship: GloryShip; userId: string }) {
  const [stats, setStats] = useState({ wins: 0, battles: 0, winRate: 0 });

  useEffect(() => {
    supabase.from('hero_ship_ranking_view').select('wins, total_battles, win_rate').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data) setStats({ wins: Number(data.wins) || 0, battles: Number(data.total_battles) || 0, winRate: Number(data.win_rate) || 0 });
      });
  }, [userId]);

  const { rank, index, next } = getGloryRank(ship.level);
  const feats = buildFeats(ship, stats.wins, stats.battles, stats.winRate);
  const done = feats.filter(f => f.current >= f.goal).length;
  const toNext = next ? Math.min(100, Math.round(((ship.level - rank.minLevel) / (next.minLevel - rank.minLevel)) * 100)) : 100;

  return (
    <div className="space-y-3">
      {/* Rango actual */}
      <div className="card-glass p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
            <div className="absolute inset-2 rounded-full glory-aura" style={{ ['--glory-aura' as string]: rank.aura }} />
            <Laurel className="absolute inset-0 w-full h-full" />
            <div className={`relative w-16 h-16 rounded-full flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#3a2a16,#0c0806)] border-2 ${rank.ring}`}>
              <Crown className={`w-8 h-8 ${rank.text} drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]`} />
            </div>
          </div>
          <div className="flex-1 w-full text-center sm:text-left">
            <p className="font-cinzel text-[10px] uppercase tracking-[0.25em] text-[#a08560]">Rango de Gloria</p>
            <h3 className={`font-cinzel font-black text-2xl sm:text-3xl ${rank.text} glory-shine`}>{rank.name} de Roma</h3>
            {next ? (
              <>
                <div className="hero-bar mt-2"><span className="bg-gradient-to-b from-[#f6e2a8] via-[#d6aa55] to-[#8a6a32]" style={{ width: `${toNext}%` }} /></div>
                <p className="text-[11px] text-[#c9a96a] mt-1">Siguiente rango: <span className="font-semibold text-[#f3dfae]">{next.name}</span> al nivel {next.minLevel}</p>
              </>
            ) : (
              <p className="text-[11px] text-[#c9a96a] mt-1">Has alcanzado el rango más alto del Imperio.</p>
            )}
          </div>
        </div>

        {/* Escalera de rangos */}
        <div className="mt-4 flex items-center gap-1 overflow-x-auto scrollbar-thin pb-1">
          {GLORY_RANKS.map((r, i) => (
            <div key={r.name} className={`flex-1 min-w-[72px] text-center px-1.5 py-1.5 rounded-sm border ${i <= index ? `${r.ring} bg-black/30` : 'border-[#3a2c18] bg-black/20 opacity-50'}`}>
              <div className={`font-cinzel text-[10px] font-bold ${i <= index ? r.text : 'text-stone-500'}`}>{r.name}</div>
              <div className="text-[9px] text-[#a08560]">Nv.{r.minLevel}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hazañas */}
      <div className="card-glass p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="rm-icon-sq w-7 h-7"><Trophy className="w-4 h-4 text-[#f6c945]" /></span>
          <h3 className="rm-title !text-sm sm:!text-base">Hazañas</h3>
          <span className="ml-auto font-cinzel text-xs text-[#f3dfae]">{done} / {feats.length}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {feats.map(f => {
            const unlocked = f.current >= f.goal;
            const pct = Math.min(100, Math.round((Math.min(f.current, f.goal) / f.goal) * 100));
            const Icon = f.icon;
            return (
              <div key={f.id} className={`relative flex items-center gap-3 p-2.5 rounded-sm border ${unlocked ? 'border-[#d6aa55] bg-[linear-gradient(180deg,rgba(80,58,24,0.45),rgba(20,14,8,0.6))] shadow-[0_0_14px_rgba(214,170,85,0.18)]' : 'border-[#3a2c18] bg-black/25'}`}>
                <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center border-2 ${unlocked ? 'border-[#f6c945] bg-[radial-gradient(circle,#5a3d14,#1a1006)]' : 'border-stone-700 bg-stone-900'}`}>
                  {unlocked ? <Icon className="w-5 h-5 text-[#f6c945]" /> : <Lock className="w-4 h-4 text-stone-500" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-cinzel text-xs font-bold truncate ${unlocked ? 'text-[#f6e2a8]' : 'text-stone-400'}`}>{f.name}</span>
                    {unlocked && <Check className="w-3.5 h-3.5 text-[#6fd86a] shrink-0" />}
                  </div>
                  <p className="text-[10px] text-[#a08560] truncate">{f.desc}</p>
                  {!unlocked && (
                    <div className="mt-1 h-1 rounded-full bg-black/50 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#8a6a32] to-[#e2b865]" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function VictoryCelebration() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute left-1/2 top-[38%] w-[520px] h-[520px] -translate-x-1/2 -translate-y-1/2 glory-rays" />
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="glory-leaf"
          style={{
            left: `${(i * 53) % 100}%`,
            animationDelay: `${(i % 6) * 0.35}s`,
            animationDuration: `${2.8 + (i % 5) * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}
