import { useMemo } from 'react';

export type ParcelKind =
  | 'own'
  | 'ally'
  | 'enemy'
  | 'empty'
  | 'ruins'
  | 'fortress'
  | 'treasure'
  | 'casino'
  | 'battleship'
  | 'sports';

export interface MapParcel {
  position: number;
  kind: ParcelKind;
  name?: string;
  owner?: string;
  tag?: string;
  isCurrent?: boolean;
  hasMoon?: boolean;
  hasDebris?: boolean;
  occupied?: boolean;
  vacation?: boolean;
}

interface TerrainMapViewProps {
  galaxy: number;
  system: number;
  parcels: MapParcel[];
  selected: number | null;
  loading?: boolean;
  onSelect: (position: number) => void;
  onMoonClick: (position: number, rect: DOMRect) => void;
  onExpedition: () => void;
}

export const PROVINCE_NAMES = ['Hispania', 'Galia', 'Germania', 'Egipto', 'Britania'];

export const KIND_STYLE: Record<ParcelKind, { fill: string; stroke: string; accent: string; label: string }> = {
  own: { fill: '#e6b94d', stroke: '#7a4f0e', accent: '#b91c1c', label: 'Tu ciudad' },
  ally: { fill: '#79a6e3', stroke: '#1e3a8a', accent: '#1d4ed8', label: 'Aliado' },
  enemy: { fill: '#d0805f', stroke: '#6b1f0f', accent: '#7f1d1d', label: 'Otro jugador' },
  empty: { fill: '#b3cc76', stroke: '#f3e8c0', accent: '#4d7c0f', label: 'Parcela libre' },
  ruins: { fill: '#968e82', stroke: '#4b463f', accent: '#57534e', label: 'Ruinas' },
  fortress: { fill: '#c98a2b', stroke: '#5c3a0a', accent: '#92400e', label: 'Fortaleza' },
  treasure: { fill: '#f3cf55', stroke: '#7c5c06', accent: '#ca8a04', label: 'Ciudad del Tesoro' },
  casino: { fill: '#c77ad8', stroke: '#4a0f5c', accent: '#a21caf', label: 'Casino' },
  battleship: { fill: '#6aa5dc', stroke: '#0c2d5c', accent: '#1d4ed8', label: 'Batalla de Tropas' },
  sports: { fill: '#5cba7a', stroke: '#14532d', accent: '#15803d', label: 'Coliseo' },
};

const W = 1000;
const H = 640;
const ROWS = [180, 345, 510];
const COLS = [95, 255, 480, 640, 800];
const FOG_X = 885;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

function smoothOpen(pts: Pt[]): string {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 8, p1[1] + (p2[1] - p0[1]) / 8];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 8, p2[1] - (p3[1] - p1[1]) / 8];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function riverXAt(river: Pt[], y: number): number {
  for (let i = 0; i < river.length - 1; i++) {
    const [x1, y1] = river[i];
    const [x2, y2] = river[i + 1];
    if (y >= y1 && y <= y2) return x1 + ((x2 - x1) * (y - y1)) / (y2 - y1 || 1);
  }
  return river[river.length - 1][0];
}

function useTerrain(galaxy: number, system: number) {
  return useMemo(() => {
    const rnd = mulberry32(galaxy * 7919 + system * 104729);
    const jit = (n: number) => (rnd() * 2 - 1) * n;

    // Parcelas en serpentina: 1-5 arriba, 6-10 en medio (de derecha a izquierda), 11-15 abajo
    const centers: Record<number, Pt> = {};
    for (let pos = 1; pos <= 15; pos++) {
      const row = Math.floor((pos - 1) / 5);
      const idx = (pos - 1) % 5;
      const col = row === 1 ? 4 - idx : idx;
      centers[pos] = [COLS[col] + jit(14), ROWS[row] + jit(14)];
    }

    const shapes: Record<number, string> = {};
    for (let pos = 1; pos <= 15; pos++) {
      const [cx, cy] = centers[pos];
      const rx = 64 + jit(5);
      const ry = 54 + jit(5);
      const rot = jit(0.35);
      const pts: Pt[] = [];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + rot;
        const f = 0.84 + rnd() * 0.18;
        pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
      }
      shapes[pos] = smoothClosed(pts);
    }

    // Rio entre la columna 2 y la 3
    const riverBase = 367;
    const river: Pt[] = [];
    for (let y = 70; y <= H + 10; y += 80) river.push([riverBase + jit(22), y]);
    river[0][1] = 70;
    const riverPath = smoothOpen(river);

    // Caminos entre parcelas consecutivas
    const roads: string[] = [];
    const bridges: { x: number; y: number; angle: number }[] = [];
    for (let pos = 1; pos < 15; pos++) {
      const [x1, y1] = centers[pos];
      const [x2, y2] = centers[pos + 1];
      const mx = (x1 + x2) / 2 + jit(10);
      const my = (y1 + y2) / 2 + jit(18);
      roads.push(`M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const ry = (y1 + y2) / 2;
      const rx = riverXAt(river, ry);
      if (rx > minX && rx < maxX) {
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        const t = (rx - x1) / (x2 - x1);
        const by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
        bridges.push({ x: rx, y: by, angle: Math.abs(angle) > 90 ? angle - 180 : angle });
      }
    }
    const [lx, ly] = centers[15];
    roads.push(`M${lx.toFixed(1)},${ly.toFixed(1)} Q${(lx + FOG_X) / 2},${ly + 30} ${FOG_X + 20},${ly + 10}`);
    const [fx, fy] = centers[5];
    roads.push(`M${fx.toFixed(1)},${fy.toFixed(1)} Q${(fx + FOG_X) / 2},${fy - 20} ${FOG_X + 20},${fy + 20}`);

    // Colinas de fondo
    const hills: { x: number; y: number; rx: number; ry: number; shade: number }[] = [];
    for (let i = 0; i < 16; i++) {
      hills.push({
        x: 40 + rnd() * (FOG_X - 60),
        y: 120 + rnd() * (H - 150),
        rx: 70 + rnd() * 90,
        ry: 30 + rnd() * 40,
        shade: rnd(),
      });
    }

    // Montanas en el borde superior
    const mountains: { x: number; h: number; w: number }[] = [];
    for (let x = -20; x < W + 40; x += 38 + rnd() * 26) {
      mountains.push({ x, h: 48 + rnd() * 46, w: 70 + rnd() * 50 });
    }

    // Bosques fuera de parcelas, rio y niebla
    const trees: { x: number; y: number; r: number }[] = [];
    let guard = 0;
    while (trees.length < 85 && guard < 3000) {
      guard++;
      const x = 20 + rnd() * (FOG_X - 30);
      const y = 105 + rnd() * (H - 125);
      if (Math.abs(x - riverXAt(river, y)) < 30) continue;
      let ok = true;
      for (let pos = 1; pos <= 15; pos++) {
        const [cx, cy] = centers[pos];
        const dx = (x - cx) / 82;
        const dy = (y - cy) / 70;
        if (dx * dx + dy * dy < 1) { ok = false; break; }
      }
      if (x < 85 && y > H - 85) ok = false; // rosa de los vientos
      if (!ok) continue;
      trees.push({ x, y, r: 6 + rnd() * 5 });
    }
    trees.sort((a, b) => a.y - b.y);

    return { centers, shapes, riverPath, roads, bridges, hills, mountains, trees };
  }, [galaxy, system]);
}

function CityGlyph({ kind }: { kind: ParcelKind }) {
  const s = KIND_STYLE[kind];
  if (kind === 'empty') {
    return (
      <g>
        {[-18, -6, 8, 20].map((x, i) => (
          <path key={i} d={`M${x},6 l-3,-9 M${x},6 l0,-11 M${x},6 l3,-9`} stroke="#4d7c0f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        ))}
        <rect x="-1.5" y="-22" width="3" height="22" fill="#7c4a1e" />
        <rect x="-14" y="-28" width="28" height="11" rx="2" fill="#f3e3b3" stroke="#7c4a1e" strokeWidth="1.2" />
        <text x="0" y="-19.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#5b3a12">LIBRE</text>
      </g>
    );
  }
  if (kind === 'ruins') {
    return (
      <g>
        <ellipse cx="0" cy="8" rx="24" ry="6" fill="#00000030" />
        <rect x="-18" y="-10" width="7" height="18" fill="#cfc8bb" stroke="#4b463f" strokeWidth="1" />
        <rect x="-6" y="-2" width="7" height="10" fill="#cfc8bb" stroke="#4b463f" strokeWidth="1" />
        <rect x="6" y="-16" width="7" height="24" fill="#cfc8bb" stroke="#4b463f" strokeWidth="1" />
        <path d="M6,-16 l3,4 l2,-5 l2,3" stroke="#4b463f" strokeWidth="1" fill="none" />
        <circle cx="-2" cy="6" r="3" fill="#a8a196" />
        <circle cx="16" cy="6" r="2.5" fill="#a8a196" />
      </g>
    );
  }
  const emoji: Partial<Record<ParcelKind, string>> = {
    fortress: '🏰',
    treasure: '💎',
    casino: '🎰',
    battleship: '⚔️',
    sports: '🏟️',
  };
  if (emoji[kind]) {
    return (
      <g>
        <circle r="22" fill="#fff8e1" stroke={s.stroke} strokeWidth="2.5" />
        <circle r="22" fill="url(#tm-plot-shine)" />
        <text y="8" textAnchor="middle" fontSize="22">{emoji[kind]}</text>
      </g>
    );
  }
  // Ciudad: murallas, casas y torre con estandarte
  return (
    <g>
      <ellipse cx="0" cy="12" rx="30" ry="7" fill="#00000035" />
      <rect x="-26" y="-2" width="52" height="14" fill="#efe2c4" stroke="#5b4a32" strokeWidth="1.3" />
      {[-26, -16, -6, 4, 14].map((x) => (
        <rect key={x} x={x} y="-6" width="6" height="5" fill="#efe2c4" stroke="#5b4a32" strokeWidth="1" />
      ))}
      <path d="M-20,-2 l7,-10 l7,10 Z" fill={s.accent} stroke="#3b2a17" strokeWidth="1" />
      <path d="M8,-2 l7,-10 l7,10 Z" fill={s.accent} stroke="#3b2a17" strokeWidth="1" />
      <rect x="-5" y="-22" width="10" height="34" fill="#e6d6b2" stroke="#5b4a32" strokeWidth="1.3" />
      <path d="M-7,-22 l7,-9 l7,9 Z" fill={s.accent} stroke="#3b2a17" strokeWidth="1" />
      <line x1="0" y1="-31" x2="0" y2="-42" stroke="#3b2a17" strokeWidth="1.3" />
      <path d="M0,-42 l11,3 l-11,3 Z" fill={s.accent} />
      <rect x="-2" y="4" width="4" height="8" fill="#5b4a32" />
    </g>
  );
}

export function TerrainMapView({ galaxy, system, parcels, selected, loading, onSelect, onMoonClick, onExpedition }: TerrainMapViewProps) {
  const terrain = useTerrain(galaxy, system);
  const province = PROVINCE_NAMES[galaxy - 1] || `Provincia ${galaxy}`;
  const byPos = useMemo(() => {
    const m: Record<number, MapParcel> = {};
    parcels.forEach((p) => { m[p.position] = p; });
    return m;
  }, [parcels]);

  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  return (
    <div className="relative rounded-2xl p-[6px] bg-gradient-to-br from-[#8a6a3c] via-[#c9a86a] to-[#6e5230] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
      <div className="relative overflow-x-auto rounded-xl ring-1 ring-black/40">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full min-w-[760px] select-none"
          role="img"
          aria-label={`Provincia de ${province}, territorio ${system}`}
        >
          <defs>
            <linearGradient id="tm-grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7d9c55" />
              <stop offset="55%" stopColor="#6a8a47" />
              <stop offset="100%" stopColor="#56763a" />
            </linearGradient>
            <radialGradient id="tm-vignette" cx="50%" cy="50%" r="75%">
              <stop offset="60%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#2a1a05" stopOpacity="0.55" />
            </radialGradient>
            <radialGradient id="tm-hill" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#a9c27a" stopOpacity="0.9" />
              <stop offset="70%" stopColor="#6f8f4a" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#4a6630" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="tm-plot-shine" cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#fff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
            </radialGradient>
            <linearGradient id="tm-fog" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#e9e4d6" stopOpacity="0" />
              <stop offset="35%" stopColor="#e9e4d6" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#f4f0e4" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="tm-mountain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8d8a80" />
              <stop offset="100%" stopColor="#5d6a4a" />
            </linearGradient>
            <pattern id="tm-furrows" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <line x1="0" y1="0" x2="0" y2="9" stroke="#6f8f3a" strokeWidth="2" strokeOpacity="0.35" />
            </pattern>
            <filter id="tm-paper" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer>
                <feFuncA type="table" tableValues="0 0.12" />
              </feComponentTransfer>
            </filter>
            <filter id="tm-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1a1205" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Terreno */}
          <rect width={W} height={H} fill="url(#tm-grass)" />
          {terrain.hills.map((h, i) => (
            <g key={`h${i}`}>
              <ellipse cx={h.x} cy={h.y} rx={h.rx} ry={h.ry} fill="url(#tm-hill)" />
              <ellipse cx={h.x} cy={h.y} rx={h.rx * 0.72} ry={h.ry * 0.62} fill="none" stroke="#4a6630" strokeOpacity={0.18 + h.shade * 0.12} strokeWidth="1.2" />
              <ellipse cx={h.x - h.rx * 0.08} cy={h.y - h.ry * 0.1} rx={h.rx * 0.42} ry={h.ry * 0.32} fill="none" stroke="#4a6630" strokeOpacity="0.15" strokeWidth="1" />
            </g>
          ))}

          {/* Montanas */}
          <g>
            {terrain.mountains.map((m, i) => (
              <g key={`m${i}`}>
                <path d={`M${m.x - m.w / 2},${100} L${m.x},${100 - m.h} L${m.x + m.w / 2},${100} Z`} fill="url(#tm-mountain)" stroke="#3f4a32" strokeOpacity="0.5" strokeWidth="1" />
                <path d={`M${m.x},${100 - m.h} L${m.x + m.w / 2},${100} L${m.x + m.w * 0.12},${100} Z`} fill="#000" opacity="0.18" />
                <path d={`M${m.x - m.w * 0.13},${100 - m.h * 0.72} L${m.x},${100 - m.h} L${m.x + m.w * 0.13},${100 - m.h * 0.72} L${m.x + m.w * 0.04},${100 - m.h * 0.78} L${m.x - m.w * 0.03},${100 - m.h * 0.7} Z`} fill="#f5f2ea" />
              </g>
            ))}
            <rect x="0" y="96" width={W} height="14" fill="#6a8a47" opacity="0.6" />
          </g>

          {/* Rio */}
          <path d={terrain.riverPath} fill="none" stroke="#45683a" strokeWidth="30" strokeLinecap="round" opacity="0.7" />
          <path d={terrain.riverPath} fill="none" stroke="#3f7fb3" strokeWidth="20" strokeLinecap="round" />
          <path d={terrain.riverPath} fill="none" stroke="#7db4dc" strokeWidth="8" strokeLinecap="round" strokeDasharray="14 22" opacity="0.8">
            <animate attributeName="stroke-dashoffset" from="0" to="-72" dur="4s" repeatCount="indefinite" />
          </path>

          {/* Caminos */}
          {terrain.roads.map((d, i) => (
            <g key={`r${i}`}>
              <path d={d} fill="none" stroke="#6b4f2a" strokeWidth="9" strokeLinecap="round" opacity="0.55" />
              <path d={d} fill="none" stroke="#d8c08a" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 7" opacity="0.9" />
            </g>
          ))}
          {terrain.bridges.map((b, i) => (
            <g key={`b${i}`} transform={`translate(${b.x},${b.y}) rotate(${b.angle})`}>
              <rect x="-24" y="-8" width="48" height="16" rx="2" fill="#8b5e34" stroke="#3b2510" strokeWidth="1.5" />
              {[-16, -8, 0, 8, 16].map((x) => (
                <line key={x} x1={x} y1="-8" x2={x} y2="8" stroke="#3b2510" strokeWidth="1" opacity="0.6" />
              ))}
            </g>
          ))}

          {/* Bosques */}
          {terrain.trees.map((t, i) => (
            <g key={`t${i}`}>
              <ellipse cx={t.x + 2} cy={t.y + t.r * 0.8} rx={t.r} ry={t.r * 0.4} fill="#000" opacity="0.2" />
              <circle cx={t.x} cy={t.y} r={t.r} fill="#2f5a2a" />
              <circle cx={t.x - t.r * 0.3} cy={t.y - t.r * 0.3} r={t.r * 0.55} fill="#4b7d3a" />
            </g>
          ))}

          {/* Parcelas */}
          {Array.from({ length: 15 }, (_, i) => i + 1).map((pos) => {
            const p = byPos[pos];
            const kind: ParcelKind = p?.kind || 'empty';
            const st = KIND_STYLE[kind];
            const [cx, cy] = terrain.centers[pos];
            const isSel = selected === pos;
            const label = p?.name ? trunc(p.name, 16) : st.label;
            const owner = p?.owner ? trunc(`${p.tag ? `[${p.tag}] ` : ''}${p.owner}`, 20) : null;
            return (
              <g
                key={`p${pos}`}
                className="cursor-pointer transition-[filter] duration-200 hover:brightness-110 focus:outline-none"
                onClick={() => onSelect(pos)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(pos); } }}
                aria-label={`Parcela ${pos}: ${label}${owner ? `, ${owner}` : ''}`}
              >
                <g filter="url(#tm-shadow)">
                  <path d={terrain.shapes[pos]} fill={st.fill} stroke={st.stroke} strokeWidth={kind === 'empty' ? 2.2 : 3} strokeDasharray={kind === 'empty' ? '6 4' : undefined} />
                </g>
                {kind === 'empty' && <path d={terrain.shapes[pos]} fill="url(#tm-furrows)" pointerEvents="none" />}
                <path d={terrain.shapes[pos]} fill="url(#tm-plot-shine)" pointerEvents="none" />
                {isSel && (
                  <path d={terrain.shapes[pos]} fill="none" stroke="#fff6c9" strokeWidth="4" strokeDasharray="10 7" pointerEvents="none">
                    <animate attributeName="stroke-dashoffset" from="0" to="-34" dur="1.2s" repeatCount="indefinite" />
                  </path>
                )}
                {p?.isCurrent && (
                  <circle cx={cx} cy={cy - 6} r="34" fill="none" stroke="#fde68a" strokeWidth="2" pointerEvents="none">
                    <animate attributeName="r" values="30;40;30" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}

                <g transform={`translate(${cx},${cy - 6})`} pointerEvents="none">
                  <CityGlyph kind={kind} />
                </g>

                {/* Numero de parcela */}
                <g transform={`translate(${cx - 52},${cy - 38})`} pointerEvents="none">
                  <circle r="11" fill="#f6ecd0" stroke="#5b3a12" strokeWidth="1.5" />
                  <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="#5b3a12">{pos}</text>
                </g>

                {/* Ocupada */}
                {p?.occupied && (
                  <g transform={`translate(${cx - 40},${cy - 14})`} pointerEvents="none">
                    <line x1="0" y1="0" x2="0" y2="-24" stroke="#3b2510" strokeWidth="1.8" />
                    <path d="M0,-24 l14,4 l-14,5 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.8" />
                  </g>
                )}

                {/* Restos de batalla */}
                {p?.hasDebris && (
                  <g transform={`translate(${cx - 34},${cy + 22})`} pointerEvents="none">
                    <circle r="9" fill="#9ca3af" opacity="0.6">
                      <animate attributeName="cy" values="0;-12;0" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.6;0;0.6" dur="3s" repeatCount="indefinite" />
                    </circle>
                    <path d="M-9,4 l5,-7 l4,4 l5,-6 l5,9 Z" fill="#78350f" stroke="#2b1405" strokeWidth="1" />
                    <circle cx="2" cy="1" r="2.5" fill="#f97316">
                      <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  </g>
                )}

                {/* Etiqueta */}
                <g transform={`translate(${cx},${cy + 30})`} pointerEvents="none">
                  <rect x={-Math.max(label.length * 3.6, 30) - 8} y="-9" width={Math.max(label.length * 7.2, 60) + 16} height="17" rx="4" fill="#f6ecd0" stroke="#5b3a12" strokeWidth="1" opacity="0.95" />
                  <text y="3.5" textAnchor="middle" fontSize="11" fontWeight="700" fill={kind === 'own' ? '#7a4f0e' : '#3b2510'}>{label}</text>
                  {owner && (
                    <text y="21" textAnchor="middle" fontSize="10" fontWeight="600" fill="#fff" stroke="#1f1408" strokeWidth="2.5" paintOrder="stroke">
                      {owner}{p?.vacation ? ' (V)' : ''}
                    </text>
                  )}
                </g>
              </g>
            );
          })}

          {/* Castra de Diana (luna) junto a su parcela */}
          {parcels.filter((p) => p.hasMoon).map((p) => {
            const [cx, cy] = terrain.centers[p.position];
            return (
              <g key={`moon${p.position}`} transform={`translate(${cx + 48},${cy - 34})`}>
                <g
                  className="cursor-pointer transition-transform duration-200 hover:scale-110"
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  onClick={(e) => { e.stopPropagation(); onMoonClick(p.position, (e.currentTarget as SVGGElement).getBoundingClientRect()); }}
                  role="button"
                  aria-label={`Castra de Diana de la parcela ${p.position}`}
                >
                  <title>Castra de Diana — clic para espiar, atacar o transportar</title>
                  <ellipse cx="0" cy="14" rx="14" ry="4" fill="#000" opacity="0.3" />
                  <rect x="-10" y="-14" width="20" height="28" fill="#d6d3d1" stroke="#44403c" strokeWidth="1.5" />
                  {[-10, -3, 4].map((x) => (
                    <rect key={x} x={x} y="-19" width="6" height="6" fill="#d6d3d1" stroke="#44403c" strokeWidth="1.2" />
                  ))}
                  <path d="M3,-6 a6,6 0 1,1 -4,8 a4.5,4.5 0 1,0 4,-8 Z" fill="#6366f1" />
                  <rect x="-3" y="6" width="6" height="8" fill="#44403c" />
                </g>
              </g>
            );
          })}

          {/* Tierras Desconocidas (posicion 16) */}
          <g className="cursor-pointer group" onClick={onExpedition} role="button" aria-label="Tierras Desconocidas: enviar expedición">
            <rect x={FOG_X - 40} y="0" width={W - FOG_X + 40} height={H} fill="url(#tm-fog)" />
            {[110, 210, 330, 450, 560].map((y, i) => (
              <g key={`c${i}`} opacity="0.9">
                <circle cx={FOG_X + 30 + (i % 2) * 30} cy={y} r="26" fill="#faf7ee">
                  <animate attributeName="cx" values={`${FOG_X + 30 + (i % 2) * 30};${FOG_X + 45 + (i % 2) * 30};${FOG_X + 30 + (i % 2) * 30}`} dur={`${6 + i}s`} repeatCount="indefinite" />
                </circle>
                <circle cx={FOG_X + 60 + (i % 2) * 20} cy={y + 12} r="20" fill="#f1ece0" />
              </g>
            ))}
            <g transform={`translate(${FOG_X + 58},${H / 2})`}>
              <circle r="30" fill="#5b3a12" opacity="0.12" className="transition-opacity group-hover:opacity-30" />
              <text y="12" textAnchor="middle" fontSize="38" fontWeight="800" fill="#7a5a2a">?</text>
              <text x="0" y="-60" textAnchor="middle" fontSize="12" fontWeight="800" fill="#5b3a12" letterSpacing="1.5">TIERRAS</text>
              <text x="0" y="-45" textAnchor="middle" fontSize="12" fontWeight="800" fill="#5b3a12" letterSpacing="1.5">DESCONOCIDAS</text>
              <text x="0" y="52" textAnchor="middle" fontSize="10" fontWeight="700" fill="#7a5a2a">Parcela 16</text>
              <text x="0" y="68" textAnchor="middle" fontSize="10" fontWeight="700" fill="#7a5a2a" className="opacity-70 group-hover:opacity-100">Expedición ›</text>
            </g>
          </g>

          {/* Rosa de los vientos */}
          <g transform={`translate(46,${H - 46})`} pointerEvents="none" opacity="0.9">
            <circle r="26" fill="#f6ecd0" stroke="#5b3a12" strokeWidth="1.5" />
            <path d="M0,-22 L5,0 L0,22 L-5,0 Z" fill="#5b3a12" />
            <path d="M-22,0 L0,5 L22,0 L0,-5 Z" fill="#a07a44" />
            <text y="-27" textAnchor="middle" fontSize="10" fontWeight="800" fill="#f6ecd0" stroke="#3b2510" strokeWidth="2.5" paintOrder="stroke">N</text>
          </g>

          {/* Cartela del territorio */}
          <g transform={`translate(${(FOG_X - 40) / 2},26)`} pointerEvents="none">
            <path d="M-170,-16 L170,-16 L182,0 L170,16 L-170,16 L-182,0 Z" fill="#f3e6c4" stroke="#5b3a12" strokeWidth="2" filter="url(#tm-shadow)" />
            <text y="5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#4a2e0c" letterSpacing="1.2" fontFamily="Georgia, 'Times New Roman', serif">
              PROVINCIA DE {province.toUpperCase()} · TERRITORIO {system}
            </text>
          </g>

          {/* Textura y vineta */}
          <rect width={W} height={H} filter="url(#tm-paper)" pointerEvents="none" />
          <rect width={W} height={H} fill="url(#tm-vignette)" pointerEvents="none" />
        </svg>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#2a1a05]/45 backdrop-blur-[1px]">
            <div className="flex items-center gap-3 px-5 py-3 rounded-lg bg-[#f3e6c4] border-2 border-[#5b3a12] shadow-xl">
              <div className="w-5 h-5 border-2 border-[#5b3a12]/30 border-t-[#5b3a12] rounded-full animate-spin" />
              <span className="font-serif font-bold text-[#4a2e0c]">Explorando el territorio…</span>
            </div>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-3 py-2 mt-[6px] rounded-lg bg-[#f3e6c4] text-[11px] font-semibold text-[#4a2e0c]">
        {(['own', 'ally', 'enemy', 'empty', 'ruins'] as ParcelKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-sm border" style={{ background: KIND_STYLE[k].fill, borderColor: KIND_STYLE[k].stroke }} />
            {KIND_STYLE[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-stone-300 border border-stone-600" />Castra de Diana</span>
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-orange-700 border border-orange-950" />Restos de batalla</span>
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-red-600 border border-red-900" />Ocupada</span>
      </div>
    </div>
  );
}
