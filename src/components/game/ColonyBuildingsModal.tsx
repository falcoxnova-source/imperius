import { useEffect, useState } from 'react';
import { Building2, Cpu, Factory, Layers, Loader2, Warehouse, X, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n, translateBuildingName } from '../../lib/i18n';
import { GameMedia } from '../ui/GameMedia';

// [COLMKT6] Detalle de niveles de edificios de una colonia en venta (solo lectura)
interface ColonyBuilding {
  code: string;
  name: string;
  category: string | null;
  level: number;
  image_url: string | null;
}

interface ColonyBuildingsModalProps {
  listingId: string;
  colonyName: string;
  coords: string;
  imageUrl?: string;
  fieldsUsed?: number;
  fieldsMax?: number;
  onClose: () => void;
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Factory; text: string; border: string; glow: string; bar: string }> = {
  resources: { label: 'Produccion', icon: Zap, text: 'text-amber-300', border: 'border-amber-400/30', glow: 'from-amber-500/25', bar: 'from-amber-500' },
  storage: { label: 'Almacenes', icon: Warehouse, text: 'text-cyan-300', border: 'border-cyan-400/30', glow: 'from-cyan-500/25', bar: 'from-cyan-500' },
  facilities: { label: 'Instalaciones', icon: Factory, text: 'text-fuchsia-300', border: 'border-fuchsia-400/30', glow: 'from-fuchsia-500/25', bar: 'from-fuchsia-500' },
  other: { label: 'Otros', icon: Cpu, text: 'text-indigo-300', border: 'border-indigo-400/30', glow: 'from-indigo-500/25', bar: 'from-indigo-500' },
};
const CATEGORY_ORDER = ['resources', 'storage', 'facilities', 'other'];

export function ColonyBuildingsModal({ listingId, colonyName, coords, imageUrl, fieldsUsed, fieldsMax, onClose }: ColonyBuildingsModalProps) {
  const { t } = useI18n();
  const [buildings, setBuildings] = useState<ColonyBuilding[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_colony_listing_buildings', { p_listing_id: listingId });
      if (cancelled) return;
      if (error) { setLoadError(true); setBuildings([]); return; }
      setBuildings((data as ColonyBuilding[]) || []);
    })();
    return () => { cancelled = true; };
  }, [listingId]);

  const maxLevel = Math.max(1, ...(buildings || []).map(b => b.level));
  const totalLevels = (buildings || []).reduce((s, b) => s + b.level, 0);
  const groups = CATEGORY_ORDER
    .map(cat => ({
      cat,
      items: (buildings || []).filter(b => (CATEGORY_META[b.category || ''] ? b.category : 'other') === cat),
    }))
    .filter(g => g.items.length > 0);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden rounded-2xl border border-indigo-400/40 bg-gradient-to-br from-space-800 via-space-900 to-black shadow-[0_0_40px_-8px_rgba(129,140,248,0.7)] transition-transform duration-200 ${visible ? 'scale-100' : 'scale-95'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Rejilla de fondo */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />

        {/* Cabecera */}
        <div className="relative flex items-center gap-3 p-3 sm:p-4 border-b border-indigo-400/20 bg-indigo-500/10">
          {imageUrl && (
            <div className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 rounded-xl overflow-hidden border border-indigo-400/40 bg-black/40">
              <GameMedia src={imageUrl} alt={colonyName} className="w-full h-full object-contain" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/80 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Edificios de la colonia
            </p>
            <p className="font-orbitron text-white text-sm sm:text-lg truncate">{colonyName}</p>
            <p className="text-[11px] text-gray-400 font-mono truncate">
              [{coords}]{fieldsMax ? ` · Campos ${fieldsUsed ?? 0}/${fieldsMax}` : ''}
            </p>
          </div>
          {buildings && buildings.length > 0 && (
            <div className="hidden sm:flex flex-col items-end flex-shrink-0 px-3 py-1.5 rounded-lg border border-indigo-400/30 bg-black/40">
              <span className="text-[9px] uppercase tracking-wider text-gray-400 flex items-center gap-1"><Layers className="w-3 h-3" /> Niveles</span>
              <span className="font-orbitron text-indigo-200 text-base leading-tight">{totalLevels}</span>
            </div>
          )}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="relative flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {buildings === null ? (
            <div className="flex items-center justify-center py-12 text-indigo-300">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : loadError ? (
            <p className="text-center text-sm text-red-400 py-10">No se pudo cargar la informacion de edificios.</p>
          ) : buildings.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">Esta colonia no tiene edificios construidos o ya no esta en venta.</p>
          ) : (
            groups.map(({ cat, items }) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              return (
                <div key={cat}>
                  <div className={`flex items-center gap-2 mb-2 text-xs font-orbitron uppercase tracking-wider ${meta.text}`}>
                    <Icon className="w-4 h-4" />
                    {meta.label}
                    <span className="flex-1 h-px bg-current opacity-20" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                    {items.map(b => {
                      const name = translateBuildingName(t, b.code, b.name);
                      const pct = Math.max(6, Math.round((b.level / maxLevel) * 100));
                      return (
                        <div
                          key={b.code}
                          className={`group relative overflow-hidden rounded-xl border ${meta.border} bg-gradient-to-br ${meta.glow} to-black/60 p-2 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110`}
                        >
                          <div className="relative h-16 sm:h-20 w-full rounded-lg overflow-hidden bg-black/40">
                            {b.image_url ? (
                              <GameMedia src={b.image_url} alt={name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Building2 className={`w-8 h-8 ${meta.text}`} />
                              </div>
                            )}
                            <span className={`absolute top-1 right-1 px-1.5 py-0.5 rounded-md border ${meta.border} bg-black/75 font-orbitron text-[11px] leading-none ${meta.text} drop-shadow-[0_0_6px_currentColor]`}>
                              Nv. {b.level}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[11px] sm:text-xs text-white leading-tight break-words line-clamp-2 min-h-[2em]">{name}</p>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                            <div className={`h-full rounded-full bg-gradient-to-r ${meta.bar} to-white/80`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
