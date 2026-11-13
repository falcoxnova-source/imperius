import { useMemo, useState, useRef, useEffect } from 'react';
import { Globe, Moon, Recycle, Sparkles, Rocket, Crosshair, Eye, Truck, ArrowRightLeft, Home, X } from 'lucide-react';

interface DebrisField {
  metal: number;
  crystal: number;
}

interface PlanetData {
  position: number;
  name?: string;
  isOwn?: boolean;
  isCurrentPlanet?: boolean;
  isCurrentMoon?: boolean;
  isDestroyed?: boolean;
  hasMoon?: boolean;
  hasDebris?: boolean;
  debris?: DebrisField;
  isEmpty?: boolean;
  isExpedition?: boolean;
  isCasino?: boolean;
  isBattleship?: boolean;
  isSports?: boolean;
  isFortress?: boolean;
  fortressData?: { owner_alliance_name: string | null; owner_alliance_tag: string | null; total_ships: number };
  isTreasurePlanet?: boolean;
  treasurePlanetData?: { owner_alliance_name: string | null; owner_alliance_tag: string | null; total_ships: number };
  username?: string;
  occupiedBy?: string;
  isMyOccupied?: boolean;
}

interface SolarSystemViewProps {
  planets: PlanetData[];
  currentSystem: number;
  currentGalaxy?: number;
  onPlanetClick?: (position: number) => void;
  onDebrisClick?: (position: number) => void;
  onColonizeClick?: (position: number) => void;
  onAttackClick?: (position: number, isMoon?: boolean) => void;
  onSpyClick?: (position: number, isMoon?: boolean) => void;
  onTransportClick?: (position: number, isMoon?: boolean) => void;
  onDeployClick?: (position: number, isMoon?: boolean) => void;
  onOverviewClick?: (position: number) => void;
  // [CASINO4] Click del Casino Galactico (planeta marcado con isCasino)
  onCasinoClick?: () => void;
  // [BATTLESHIP1] Click del planeta de Batalla Naval
  onBattleshipClick?: () => void;
  // [SPORTS1] Click del Estadio Galactico (apuestas de futbol)
  onSportsClick?: () => void;
}

interface ActionMenu {
  position: number;
  x: number;
  y: number;
  isMoon?: boolean;
}

interface DebrisMenu {
  position: number;
  x: number;
  y: number;
  metal: number;
  crystal: number;
}

// Unique visual per orbital position
const PLANET_VISUALS: Record<number, { size: number; colors: string[]; ring?: boolean }> = {
  1:  { size: 14, colors: ['#a0522d', '#8b4513'] },
  2:  { size: 20, colors: ['#daa520', '#cd853f', '#b8860b'] },
  3:  { size: 22, colors: ['#4169e1', '#228b22', '#32cd32'] },
  4:  { size: 18, colors: ['#cd5c5c', '#b22222', '#8b0000'] },
  5:  { size: 15, colors: ['#808080', '#696969'] },
  6:  { size: 16, colors: ['#2e8b57', '#3cb371'] },
  7:  { size: 28, colors: ['#daa520', '#f4a460', '#cd853f'], ring: true },
  8:  { size: 26, colors: ['#87ceeb', '#b0c4de', '#6495ed'] },
  9:  { size: 20, colors: ['#4682b4', '#5f9ea0'] },
  10: { size: 16, colors: ['#9370db', '#8a2be2'] },
  11: { size: 14, colors: ['#20b2aa', '#008b8b'] },
  12: { size: 12, colors: ['#778899', '#708090'] },
  13: { size: 24, colors: ['#f08080', '#e9967a', '#fa8072'] },
  14: { size: 15, colors: ['#556b2f', '#6b8e23'] },
  15: { size: 18, colors: ['#4169e1', '#191970', '#000080'] },
};

export function SolarSystemView({
  planets,
  currentSystem,
  currentGalaxy,
  onPlanetClick,
  onDebrisClick,
  onColonizeClick,
  onAttackClick,
  onSpyClick,
  onTransportClick,
  onDeployClick,
  onOverviewClick,
  onCasinoClick,
  onBattleshipClick,
  onSportsClick,
}: SolarSystemViewProps) {
  const [actionMenu, setActionMenu] = useState<ActionMenu | null>(null);
  const [debrisMenu, setDebrisMenu] = useState<DebrisMenu | null>(null);
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Slow rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setRotation(prev => (prev + 0.02) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Stars
  const stars = useMemo(() => {
    return [...Array(120)].map((_, i) => ({
      id: i,
      size: Math.random() * 2 + 0.5,
      left: Math.random() * 100,
      top: Math.random() * 100,
      opacity: Math.random() * 0.6 + 0.1,
      twinkle: Math.random() > 0.7,
    }));
  }, []);

  // Planet positions
  const planetPositions = useMemo(() => {
    return planets.map((planet) => {
      const orbitRadius = 38 + (planet.position * 16);
      const baseAngle = (planet.position * 23 + planet.position * planet.position * 7) % 360;
      return { ...planet, orbitRadius, baseAngle };
    });
  }, [planets]);

  const handlePlanetClick = (e: React.MouseEvent, planet: typeof planetPositions[0], isMoon = false) => {
    e.preventDefault();
    e.stopPropagation();
    // Don't open action menu for destroyed/abandoned planets
    if (planet.isDestroyed) return;
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const rect = e.currentTarget.getBoundingClientRect();
    setActionMenu({
      position: planet.position,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top + rect.height,
      isMoon,
    });
  };

  const closeMenu = () => { setActionMenu(null); setDebrisMenu(null); };

  const handleDebrisClick = (e: React.MouseEvent, planet: typeof planetPositions[0]) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const rect = e.currentTarget.getBoundingClientRect();
    setDebrisMenu({
      position: planet.position,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top + rect.height,
      metal: planet.debris?.metal || 0,
      crystal: planet.debris?.crystal || 0,
    });
    setActionMenu(null);
  };

  const currentPlanetData = actionMenu ? planets.find(p => p.position === actionMenu.position) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-slate-700/50 flex"
      style={{ height: '560px' }}
      onClick={closeMenu}
    >
      {/* ===== LEFT: ORBITAL VIEW ===== */}
      <div className="relative flex-1 overflow-hidden">
        {/* Deep space background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a] via-[#0d1525] to-[#080c16]" />

        {/* Nebula glows */}
        <div className="absolute top-0 right-0 w-[60%] h-[40%] bg-gradient-to-bl from-orange-900/10 via-red-900/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[40%] h-[30%] bg-gradient-to-tr from-blue-900/8 via-cyan-900/4 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-[20%] left-[10%] w-[30%] h-[20%] bg-gradient-to-r from-purple-900/5 to-transparent rounded-full blur-2xl pointer-events-none" />

        {/* Stars */}
        <div className="absolute inset-0 pointer-events-none">
          {stars.map((star) => (
            <div
              key={star.id}
              className={`absolute rounded-full bg-white ${star.twinkle ? 'animate-pulse' : ''}`}
              style={{
                width: star.size + 'px',
                height: star.size + 'px',
                left: star.left + '%',
                top: star.top + '%',
                opacity: star.opacity,
              }}
            />
          ))}
        </div>

        {/* Solar system centered */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Orbit rings */}
          {planets.filter(p => !p.isExpedition).map((planet) => {
            const r = 38 + (planet.position * 16);
            return (
              <div
                key={`orbit-${planet.position}`}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: `${r * 2}px`,
                  height: `${r * 2}px`,
                  border: '1px dashed rgba(100, 140, 180, 0.12)',
                }}
              />
            );
          })}

          {/* Sun */}
          <div className="absolute z-10 pointer-events-none">
            <div className="relative">
              <div className="absolute rounded-full animate-pulse" style={{ inset: '-20px', background: 'radial-gradient(circle, rgba(255,180,50,0.15) 0%, rgba(255,120,0,0.05) 50%, transparent 70%)' }} />
              <div className="absolute rounded-full" style={{ inset: '-10px', background: 'radial-gradient(circle, rgba(255,200,50,0.3) 0%, rgba(255,150,0,0.1) 60%, transparent 80%)' }} />
              <div className="w-16 h-16 rounded-full relative" style={{ background: 'radial-gradient(circle at 35% 35%, #fff6d5, #ffcc33 30%, #ff9900 60%, #e67300 80%, #cc5500)', boxShadow: '0 0 30px rgba(255,150,0,0.5), 0 0 60px rgba(255,100,0,0.2), inset 0 0 20px rgba(255,200,100,0.3)' }}>
                <div className="absolute inset-1 rounded-full opacity-40" style={{ background: 'radial-gradient(circle at 60% 40%, transparent 40%, rgba(200,100,0,0.3) 70%, transparent 90%)' }} />
              </div>
            </div>
          </div>

          {/* Planets */}
          {planetPositions.map((planet) => {
            const speed = (16 - planet.position) * 0.3;
            const angle = ((planet.baseAngle + rotation * speed) * Math.PI) / 180;
            const x = Math.cos(angle) * planet.orbitRadius;
            const y = Math.sin(angle) * planet.orbitRadius;
            const v = PLANET_VISUALS[planet.position] || { size: 16, colors: ['#888', '#666'] };
            const sz = v.size;

            return (
              <div key={planet.position} className="absolute z-20" style={{ transform: `translate(${x}px, ${y}px)` }}>
                {planet.isExpedition ? (
                  <button className="relative cursor-pointer group focus:outline-none" onClick={() => onPlanetClick?.(planet.position)} type="button">
                    <div className="rounded-full flex items-center justify-center animate-pulse border border-yellow-400/40 hover:scale-125 transition-transform" style={{ width: '14px', height: '14px', background: 'radial-gradient(circle, rgba(255,200,50,0.3) 0%, rgba(100,50,200,0.1) 60%, transparent 80%)' }}>
                      <Sparkles className="w-2.5 h-2.5 text-yellow-300" />
                    </div>
                  </button>
                ) : planet.isCasino && onCasinoClick ? (
                  <button
                    type="button"
                    className="relative cursor-pointer group focus:outline-none flex flex-col items-center"
                    onClick={(e) => { e.stopPropagation(); onCasinoClick(); }}
                    title={`Casino Galáctico [${currentGalaxy}:${currentSystem}:${planet.position}]`}
                  >
                    <div className="relative">
                      <div className="absolute rounded-full animate-pulse pointer-events-none" style={{ inset: '-8px', background: 'radial-gradient(circle, rgba(217,70,239,0.45) 0%, rgba(245,158,11,0.15) 55%, transparent 75%)' }} />
                      <div
                        className="relative w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-125"
                        style={{
                          background: 'radial-gradient(circle at 35% 30%, #fde68a, #e879f9 35%, #a21caf 65%, #3b0764)',
                          boxShadow: '0 0 12px rgba(217,70,239,0.7), 0 0 22px rgba(245,158,11,0.35), inset -4px -4px 8px rgba(0,0,0,0.45)',
                        }}
                      >
                        <span className="text-sm drop-shadow">🎰</span>
                      </div>
                      <div className="absolute pointer-events-none" style={{ width: '48px', height: '12px', left: '-10px', top: '8px', border: '1.5px solid rgba(251,191,36,0.5)', borderRadius: '50%', transform: 'rotate(-18deg)' }} />
                    </div>
                    <span className="absolute top-full mt-1 text-[8px] font-orbitron font-bold text-amber-200 bg-slate-900/70 px-1 rounded whitespace-nowrap pointer-events-none">CASINO</span>
                  </button>
                ) : planet.isBattleship && onBattleshipClick ? (
                  <button
                    type="button"
                    className="relative cursor-pointer group focus:outline-none flex flex-col items-center"
                    onClick={(e) => { e.stopPropagation(); onBattleshipClick(); }}
                    title={`Batalla de Tropas [${currentGalaxy}:${currentSystem}:${planet.position}]`}
                  >
                    <div className="relative">
                      <div className="absolute rounded-full animate-pulse pointer-events-none" style={{ inset: '-8px', background: 'radial-gradient(circle, rgba(56,189,248,0.5) 0%, rgba(99,102,241,0.18) 55%, transparent 75%)' }} />
                      <div
                        className="relative w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-125"
                        style={{
                          background: 'radial-gradient(circle at 35% 30%, #cffafe, #38bdf8 35%, #1d4ed8 65%, #0b1033)',
                          boxShadow: '0 0 12px rgba(56,189,248,0.75), 0 0 22px rgba(99,102,241,0.4), inset -4px -4px 8px rgba(0,0,0,0.45)',
                        }}
                      >
                        <span className="text-sm drop-shadow">🚀</span>
                      </div>
                      <div className="absolute pointer-events-none" style={{ width: '48px', height: '12px', left: '-10px', top: '8px', border: '1.5px solid rgba(125,211,252,0.55)', borderRadius: '50%', transform: 'rotate(18deg)' }} />
                    </div>
                    <span className="absolute top-full mt-1 text-[8px] font-orbitron font-bold text-sky-200 bg-slate-900/70 px-1 rounded whitespace-nowrap pointer-events-none">BATALLA DE NAVES</span>
                  </button>
                ) : planet.isSports && onSportsClick ? (
                  <button
                    type="button"
                    className="relative cursor-pointer group focus:outline-none flex flex-col items-center"
                    onClick={(e) => { e.stopPropagation(); onSportsClick(); }}
                    title={`Estadio Galáctico · Apuestas de fútbol [${currentGalaxy}:${currentSystem}:${planet.position}]`}
                  >
                    <div className="relative">
                      <div className="absolute rounded-full animate-pulse pointer-events-none" style={{ inset: '-8px', background: 'radial-gradient(circle, rgba(74,222,128,0.5) 0%, rgba(16,185,129,0.18) 55%, transparent 75%)' }} />
                      <div
                        className="relative w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-125"
                        style={{
                          background: 'radial-gradient(circle at 35% 30%, #ecfccb, #4ade80 35%, #15803d 65%, #052e16)',
                          boxShadow: '0 0 12px rgba(74,222,128,0.75), 0 0 22px rgba(16,185,129,0.4), inset -4px -4px 8px rgba(0,0,0,0.45)',
                        }}
                      >
                        <span className="text-sm drop-shadow">⚽</span>
                      </div>
                      <div className="absolute pointer-events-none" style={{ width: '48px', height: '12px', left: '-10px', top: '8px', border: '1.5px solid rgba(187,247,208,0.55)', borderRadius: '50%', transform: 'rotate(-10deg)' }} />
                    </div>
                    <span className="absolute top-full mt-1 text-[8px] font-orbitron font-bold text-green-200 bg-slate-900/70 px-1 rounded whitespace-nowrap pointer-events-none">APUESTAS</span>
                  </button>
                ) : planet.isFortress ? (
                  <button className="relative cursor-pointer group focus:outline-none" onClick={(e) => handlePlanetClick(e, planet, false)} type="button">
                    <div className="rounded-full hover:scale-125 transition-all border-2 border-amber-400/60 flex items-center justify-center" style={{ width: '14px', height: '14px', background: 'radial-gradient(circle, rgba(245,158,11,0.4) 0%, rgba(100,50,20,0.3) 60%, rgba(80,60,40,0.1) 100%)', boxShadow: '0 0 8px rgba(245,158,11,0.4)' }}>
                      <span className="text-[7px]">🏰</span>
                    </div>
                  </button>
                ) : planet.isTreasurePlanet ? (
                  <button className="relative cursor-pointer group focus:outline-none" onClick={(e) => handlePlanetClick(e, planet, false)} type="button">
                    <div className="absolute rounded-full animate-pulse" style={{ inset: '-4px', background: 'radial-gradient(circle, rgba(250,204,21,0.35) 0%, transparent 70%)' }} />
                    <div className="rounded-full hover:scale-125 transition-all border-2 border-yellow-300 flex items-center justify-center relative" style={{ width: '14px', height: '14px', background: 'radial-gradient(circle, rgba(255,223,90,0.9) 0%, rgba(250,204,21,0.6) 55%, rgba(180,130,10,0.3) 100%)', boxShadow: '0 0 10px rgba(250,204,21,0.9), 0 0 18px rgba(255,215,0,0.5)' }}>
                      <span className="text-[7px]">💎</span>
                    </div>
                  </button>
                ) : planet.isEmpty ? (
                  <button className="relative cursor-pointer group focus:outline-none" onClick={(e) => handlePlanetClick(e, planet, false)} type="button">
                    <div className="rounded-full hover:scale-150 transition-all" style={{ width: '8px', height: '8px', background: 'radial-gradient(circle, rgba(150,160,180,0.5) 0%, rgba(100,110,130,0.3) 60%, rgba(80,90,100,0.1) 100%)', boxShadow: '0 0 4px rgba(150,160,180,0.2)' }} />
                  </button>
                ) : planet.isDestroyed ? (
                  /* Destroyed / Ruins planet */
                  <div className="relative cursor-not-allowed">
                    <div
                      className="rounded-full flex items-center justify-center opacity-50 grayscale"
                      style={{
                        width: `${sz}px`, height: `${sz}px`,
                        background: 'radial-gradient(circle at 35% 30%, #555, #333 70%)',
                        boxShadow: `0 0 ${sz / 2}px rgba(100,100,100,0.2)`,
                      }}
                    >
                      <span className="text-[10px]">💀</span>
                    </div>
                    {/* Ruins label */}
                    <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none" style={{ bottom: `${-sz / 2 - 10}px` }}>
                      <span className="text-[6px] text-red-400/50 bg-slate-900/70 px-1 rounded">Ruinas</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Planet body */}
                    <button
                      type="button"
                      className="rounded-full transition-all hover:scale-[1.3] cursor-pointer focus:outline-none relative"
                      style={{
                        width: `${sz}px`, height: `${sz}px`,
                        background: `radial-gradient(circle at 35% 30%, ${v.colors[0]}, ${v.colors[1] || v.colors[0]} 70%${v.colors[2] ? `, ${v.colors[2]}` : ''})`,
                        boxShadow: `0 0 ${sz / 2}px ${v.colors[0]}44, inset -${sz / 4}px -${sz / 4}px ${sz / 2}px rgba(0,0,0,0.5)`,
                        border: planet.isOwn ? '2px solid #34d399' : 'none',
                      }}
                      onClick={(e) => handlePlanetClick(e, planet, false)}
                    >
                      <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.6) 100%)' }} />
                    </button>

                    {/* Own planet glow */}
                    {planet.isOwn && (
                      <div className="absolute rounded-full pointer-events-none" style={{ inset: '-3px', border: '1px solid rgba(52, 211, 153, 0.4)', boxShadow: '0 0 8px rgba(52, 211, 153, 0.3)', borderRadius: '50%' }} />
                    )}

                    {/* Ring */}
                    {v.ring && (
                      <div className="absolute pointer-events-none" style={{ width: `${sz * 1.8}px`, height: `${sz * 0.5}px`, left: `${-sz * 0.4}px`, top: `${sz * 0.25}px`, border: '1.5px solid rgba(218,165,32,0.35)', borderRadius: '50%', transform: 'rotateX(70deg)' }} />
                    )}

                    {/* Position # */}
                    <div className="absolute pointer-events-none" style={{ top: `${-sz / 2 - 6}px`, left: '50%', transform: 'translateX(-50%)' }}>
                      <span className="text-[7px] text-slate-500 font-mono">{planet.position}</span>
                    </div>

                    {/* Moon */}
                    {planet.hasMoon && (
                      <button type="button" className="absolute rounded-full hover:scale-150 transition-transform cursor-pointer focus:outline-none" style={{ width: '10px', height: '10px', background: 'radial-gradient(circle at 35% 30%, #e4e4e7, #71717a)', boxShadow: '0 0 5px rgba(220,220,220,0.6)', top: '-6px', right: '-6px' }} onClick={(e) => handlePlanetClick(e, planet, true)} title="🌙 Castra de Diana — clic para espiar, atacar o transportar" />
                    )}

                    {/* Debris */}
                    {planet.hasDebris && planet.debris && (
                      <button type="button" className="absolute rounded-full cursor-pointer hover:scale-150 transition-transform focus:outline-none animate-pulse" style={{ width: '12px', height: '12px', background: 'radial-gradient(circle at 40% 35%, #fb923c, #f97316 40%, #9a3412 100%)', boxShadow: '0 0 8px 2px rgba(249,115,22,0.7), 0 0 16px 4px rgba(249,115,22,0.3)', bottom: '-5px', left: '-5px' }} onClick={(e) => handleDebrisClick(e, planet)} title={`💥 Escombros: ${planet.debris.metal.toLocaleString()} Metal | ${planet.debris.crystal.toLocaleString()} Cristal`} />
                    )}

                    {/* [OCUPA2] Ocupación */}
                    {planet.occupiedBy && (
                      <div className="absolute pointer-events-none" style={{ top: '-6px', left: '-6px' }} title={`Ocupado por ${planet.occupiedBy}`}>
                        <span className="text-[9px] leading-none px-0.5 rounded bg-red-600 text-white shadow shadow-red-500/50">⚑</span>
                      </div>
                    )}

                    {/* Enemy name */}
                    {planet.username && !planet.isOwn && (
                      <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none" style={{ bottom: `${-sz / 2 - 8}px` }}>
                        <span className="text-[6px] text-cyan-400/70 bg-slate-900/70 px-1 rounded">{planet.username}</span>
                      </div>
                    )}
                    {planet.occupiedBy && (
                      <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none" style={{ bottom: `${-sz / 2 - (planet.username && !planet.isOwn ? 16 : 8)}px` }}>
                        <span className="text-[6px] text-red-300 bg-red-950/80 px-1 rounded">⚑ {planet.occupiedBy}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom label */}
        <div className="absolute bottom-4 left-0 right-0 text-center z-30 pointer-events-none">
          <span className="text-sm text-slate-400 tracking-wider">
            Continente {currentGalaxy || '?'} — Región {currentSystem}
          </span>
        </div>
      </div>

      {/* ===== RIGHT: INFO PANEL ===== */}
      <div className="w-[220px] sm:w-[260px] border-l border-slate-700/50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center py-8 px-4 shrink-0">
        <div className="mb-3">
          <Globe className="w-14 h-14 text-slate-500" strokeWidth={1} />
        </div>
        <h3 className="font-orbitron text-base text-white mb-1 tracking-wide">Continente</h3>
        <p className="text-xs text-slate-400 mb-8">Continente {currentGalaxy || '?'} — Región {currentSystem}</p>

        <div className="space-y-3 w-full">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-400 shrink-0" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
            <span className="text-sm text-slate-300">Tu ciudad</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-400 shrink-0" style={{ boxShadow: '0 0 6px rgba(96,165,250,0.5)' }} />
            <span className="text-sm text-slate-300">Ciudad ocupada</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-slate-500 shrink-0" />
            <span className="text-sm text-slate-300">Posición Vacía</span>
          </div>
          <div className="flex items-center gap-3">
            <Sparkles className="w-3 h-3 text-yellow-400 shrink-0" />
            <span className="text-sm text-slate-300">Tierras Desconocidas (Pos 16)</span>
          </div>
          {onCasinoClick && planets.some(p => p.isCasino) && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] shrink-0">🎰</span>
              <span className="text-sm text-fuchsia-300">Casino Galáctico (Pos {planets.find(p => p.isCasino)?.position})</span>
            </div>
          )}
          {onBattleshipClick && planets.some(p => p.isBattleship) && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] shrink-0">🚀</span>
              <span className="text-sm text-sky-300">Batalla de Naves (Pos {planets.find(p => p.isBattleship)?.position})</span>
            </div>
          )}
          {onSportsClick && planets.some(p => p.isSports) && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] shrink-0">⚽</span>
              <span className="text-sm text-green-300">Apuestas Deportivas (Pos {planets.find(p => p.isSports)?.position})</span>
            </div>
          )}          <div className="flex items-center gap-3">
            <span className="text-[10px] shrink-0">💀</span>
            <span className="text-sm text-red-400/60">Ruinas (Inhabitable)</span>
          </div>        </div>

        <div className="mt-8 w-full space-y-2 border-t border-slate-700/50 pt-4">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Ciudades</span>
            <span className="text-slate-300 font-mono">{planets.filter(p => !p.isEmpty && !p.isExpedition).length}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Tuyos</span>
            <span className="text-emerald-400 font-mono">{planets.filter(p => p.isOwn).length}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Vacíos</span>
            <span className="text-slate-400 font-mono">{planets.filter(p => p.isEmpty).length}</span>
          </div>
        </div>
      </div>

      {/* ===== ACTION MENU ===== */}
      {actionMenu && currentPlanetData && (
        <div
          className="absolute z-50 bg-slate-900/95 border border-slate-600 rounded-lg shadow-2xl overflow-hidden min-w-[150px]"
          style={{ left: `${actionMenu.x}px`, top: `${actionMenu.y + 8}px`, transform: 'translateX(-50%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white">
              {currentPlanetData.isFortress ? `🏰 Fortaleza Pos ${actionMenu.position}` : currentPlanetData.isTreasurePlanet ? `💎 Ciudad del Tesoro Pos ${actionMenu.position}` : currentPlanetData.isEmpty ? `🚀 Pos ${actionMenu.position}` : actionMenu.isMoon ? `🌙 Castra de Diana Pos ${actionMenu.position}` : `🌍 Pos ${actionMenu.position}`}
            </span>
            <button onClick={closeMenu} className="text-gray-400 hover:text-white ml-2" type="button">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="p-1">
            {currentPlanetData.isFortress ? (
              <button type="button" onClick={() => { onAttackClick?.(actionMenu.position); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 rounded transition-colors">
                ⚔️ Atacar Fortaleza
              </button>
            ) : currentPlanetData.isTreasurePlanet ? (
              <button type="button" onClick={() => { onAttackClick?.(actionMenu.position); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-yellow-300 hover:bg-yellow-400/20 rounded transition-colors">
                ⚔️ Atacar Ciudad del Tesoro
              </button>
            ) : currentPlanetData.isEmpty ? (
              <button type="button" onClick={() => { onColonizeClick?.(actionMenu.position); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-green-400 hover:bg-green-500/20 rounded transition-colors">
                <Rocket className="w-3.5 h-3.5" />Colonizar
              </button>
            ) : currentPlanetData.isMyOccupied && !actionMenu.isMoon ? (
              <>
                <button type="button" onClick={() => { onSpyClick?.(actionMenu.position); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 rounded transition-colors">
                  <Eye className="w-3.5 h-3.5" />Espiar
                </button>
                <button type="button" onClick={() => { onAttackClick?.(actionMenu.position); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/20 rounded transition-colors">
                  <Crosshair className="w-3.5 h-3.5" />Atacar (Recuperar)
                </button>
              </>
            ) : currentPlanetData.isOwn && (actionMenu.isMoon ? currentPlanetData.isCurrentMoon : currentPlanetData.isCurrentPlanet) ? (
              <>
                {actionMenu.isMoon ? (
                  <p className="px-2 py-1.5 text-[11px] text-slate-400">Ya estás en esta Castra de Diana</p>
                ) : (
                  <button type="button" onClick={() => { onOverviewClick?.(actionMenu.position); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors">
                    <Home className="w-3.5 h-3.5" />Visión General
                  </button>
                )}
              </>
            ) : currentPlanetData.isOwn ? (
              <>
                <button type="button" onClick={() => { onTransportClick?.(actionMenu.position, actionMenu.isMoon); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-cyan-400 hover:bg-cyan-500/20 rounded transition-colors">
                  <Truck className="w-3.5 h-3.5" />{actionMenu.isMoon ? 'Transportar a la Castra de Diana' : 'Transportar'}
                </button>
                <button type="button" onClick={() => { onDeployClick?.(actionMenu.position, actionMenu.isMoon); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 rounded transition-colors">
                  <ArrowRightLeft className="w-3.5 h-3.5" />{actionMenu.isMoon ? 'Desplegar en la Castra de Diana' : 'Desplegar'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { onSpyClick?.(actionMenu.position, actionMenu.isMoon); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 rounded transition-colors">
                  <Eye className="w-3.5 h-3.5" />{actionMenu.isMoon ? 'Espiar Castra de Diana' : 'Espiar'}
                </button>
                <button type="button" onClick={() => { onAttackClick?.(actionMenu.position, actionMenu.isMoon); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/20 rounded transition-colors">
                  <Crosshair className="w-3.5 h-3.5" />{actionMenu.isMoon ? 'Atacar Castra de Diana' : 'Atacar'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== DEBRIS MENU ===== */}
      {debrisMenu && (
        <div
          className="absolute z-50 bg-slate-900/95 border border-orange-500/50 rounded-lg shadow-2xl overflow-hidden min-w-[160px]"
          style={{ left: `${debrisMenu.x}px`, top: `${debrisMenu.y + 8}px`, transform: 'translateX(-50%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1.5 bg-orange-500/20 border-b border-orange-500/30 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-orange-400 flex items-center gap-1">
              <Recycle className="w-3 h-3" />Escombros
            </span>
            <button onClick={closeMenu} className="text-gray-400 hover:text-white ml-2" type="button">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="p-2 space-y-1 border-b border-slate-700">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-400">Hierro:</span>
              <span className="text-gray-200 font-semibold">{debrisMenu.metal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-cyan-400">Piedra:</span>
              <span className="text-gray-200 font-semibold">{debrisMenu.crystal.toLocaleString()}</span>
            </div>
          </div>
          <div className="p-1">
            <button type="button" onClick={() => { onDebrisClick?.(debrisMenu.position); closeMenu(); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-orange-400 hover:bg-orange-500/20 rounded transition-colors">
              <Recycle className="w-3.5 h-3.5" />Recolectar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
