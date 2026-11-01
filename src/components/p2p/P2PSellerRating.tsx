import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  userId: string;
  ratingAvg: number;
  ratingCount: number;
  totalOrders: number;
  successRate: number;
  isBanned: boolean;
}

type Distribution = Record<1 | 2 | 3 | 4 | 5, number>;

const EMPTY_DIST: Distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

const distCache = new Map<string, Distribution>();
const cacheKey = (userId: string, ratingCount: number) => `${userId}:${ratingCount}`;

export function P2PSellerRating({
  userId,
  ratingAvg,
  ratingCount,
  totalOrders,
  successRate,
  isBanned,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dist, setDist] = useState<Distribution | null>(distCache.get(cacheKey(userId, ratingCount)) || null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);

  const updatePosition = () => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const tooltipWidth = 288;
    const tooltipHeight = 230;
    const margin = 8;

    let left = rect.left;
    if (left + tooltipWidth > window.innerWidth - margin) {
      left = window.innerWidth - tooltipWidth - margin;
    }
    if (left < margin) left = margin;

    let top = rect.top - tooltipHeight - margin;
    if (top < margin) top = rect.bottom + margin;

    setCoords({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  // Invalidate stale local state if ratingCount changes between renders
  useEffect(() => {
    const cached = distCache.get(cacheKey(userId, ratingCount));
    setDist(cached || null);
  }, [userId, ratingCount]);

  useEffect(() => {
    if (!open || dist || ratingCount <= 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('p2p_ratings')
          .select('stars')
          .eq('ratee_id', userId)
          .limit(1000);
        if (cancelled) return;
        if (error || !data) {
          setDist({ ...EMPTY_DIST });
          return;
        }
        const acc: Distribution = { ...EMPTY_DIST };
        (data as Array<{ stars: number }>).forEach((r) => {
          const s = Math.max(1, Math.min(5, Math.round(Number(r.stars) || 0))) as 1 | 2 | 3 | 4 | 5;
          acc[s] += 1;
        });
        // Cache by (userId, ratingCount): when a new rating arrives the
        // ratingCount changes and we automatically re-fetch instead of
        // showing the stale distribution.
        distCache.set(cacheKey(userId, ratingCount), acc);
        setDist(acc);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dist, ratingCount, userId]);

  const stars = Math.max(0, Math.min(5, ratingAvg));
  const full = Math.floor(stars);
  const frac = stars - full;

  const renderStars = (small: boolean) => {
    const cls = small ? 'w-3 h-3' : 'w-4 h-4';
    return (
      <span className="inline-flex">
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = i < full;
          const isHalf = !filled && i === full && frac >= 0.25 && frac < 0.75;
          return (
            <span key={i} className={`relative inline-block ${cls}`}>
              <Star className={`${cls} text-gray-600 absolute inset-0`} />
              {filled && <Star className={`${cls} text-amber-400 fill-amber-400 absolute inset-0`} />}
              {isHalf && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                  <Star className={`${cls} text-amber-400 fill-amber-400`} />
                </span>
              )}
            </span>
          );
        })}
      </span>
    );
  };

  const tooltip =
    open && coords
      ? createPortal(
          <div
            role="tooltip"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: 288, zIndex: 10000 }}
            className="rounded-xl border border-white/10 bg-space-900/95 backdrop-blur-sm p-3 shadow-2xl text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              {renderStars(false)}
              <span className="text-sm font-semibold text-white">{ratingAvg.toFixed(1)} de 5</span>
            </div>
            <div className="text-[11px] text-gray-400 mb-2">
              {ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'}
            </div>
            <div className="flex flex-col gap-1">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = dist ? dist[n as 1 | 2 | 3 | 4 | 5] : 0;
                const pct = ratingCount > 0 ? Math.round((count / ratingCount) * 100) : 0;
                return (
                  <div key={n} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px]">
                    <span className="text-gray-300">{n} estrellas</span>
                    <span className="h-2 w-full rounded bg-white/10 overflow-hidden">
                      <span
                        className="block h-full bg-amber-400"
                        style={{ width: `${pct}%`, transition: 'width .2s' }}
                      />
                    </span>
                    <span className="text-gray-400 tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
            {loading && <div className="mt-2 text-[10px] text-gray-500">Cargando…</div>}
            {!loading && ratingCount === 0 && (
              <div className="mt-2 text-[10px] text-gray-500">Este vendedor aún no tiene calificaciones.</div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex items-center gap-1 text-[10px] text-gray-400 flex-wrap cursor-help"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
      >
        {renderStars(true)}
        {ratingCount > 0 ? (
          <span className="text-amber-300">{ratingAvg.toFixed(1)} ({ratingCount})</span>
        ) : (
          <span className="text-gray-500">sin valoraciones</span>
        )}
        <span className="text-gray-500">· {totalOrders} ops · {successRate.toFixed(0)}%</span>
        {isBanned && <span className="text-red-400">· bloqueado</span>}
      </span>
      {tooltip}
    </>
  );
}
