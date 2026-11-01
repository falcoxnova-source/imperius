/**
 * BlueprintPurchaseConfirm - Ventana de confirmacion antes de comprar un plano
 *
 * Evita compras accidentales: el jugador debe confirmar explicitamente.
 * Se usa en el Hangar (naves) y en Defensa (defensas).
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Coins, Gift, PackagePlus, ScrollText, X } from 'lucide-react';
import { GameMedia } from '../ui/GameMedia';
import { formatNumber } from '../../lib/utils';

type Accent = 'orange' | 'pink';

const ACCENT: Record<Accent, {
  border: string;
  glow: string;
  headerBg: string;
  text: string;
  iconBg: string;
  confirmBtn: string;
  ring: string;
  line: string;
}> = {
  orange: {
    border: 'border-cyber-orange/50',
    glow: 'shadow-[0_0_60px_-12px_rgba(249,115,22,0.55)]',
    headerBg: 'from-cyber-orange/25 via-cyber-orange/5 to-transparent',
    text: 'text-cyber-orange',
    iconBg: 'bg-cyber-orange/15 border-cyber-orange/40',
    confirmBtn: 'from-cyber-orange to-amber-500 hover:from-amber-400 hover:to-cyber-orange shadow-[0_0_25px_-6px_rgba(249,115,22,0.9)]',
    ring: 'ring-cyber-orange/30',
    line: 'via-cyber-orange',
  },
  pink: {
    border: 'border-cyber-pink/50',
    glow: 'shadow-[0_0_60px_-12px_rgba(236,72,153,0.55)]',
    headerBg: 'from-cyber-pink/25 via-cyber-pink/5 to-transparent',
    text: 'text-cyber-pink',
    iconBg: 'bg-cyber-pink/15 border-cyber-pink/40',
    confirmBtn: 'from-cyber-pink to-fuchsia-500 hover:from-fuchsia-400 hover:to-cyber-pink shadow-[0_0_25px_-6px_rgba(236,72,153,0.9)]',
    ring: 'ring-cyber-pink/30',
    line: 'via-cyber-pink',
  },
};

interface BlueprintPurchaseConfirmProps {
  /** Nombre ya traducido de la nave o defensa */
  name: string;
  /** Coste estimado en TUNG (null si todavia no se puede calcular) */
  costTung: number | null;
  /** Imagen de la nave/defensa (opcional) */
  imageUrl?: string | null;
  /** Planos que ya tiene en el inventario */
  currentQuantity?: number;
  /** Recursos de fabricacion que se entregan junto con el plano */
  includedResources?: { metal: number; crystal: number; deuterium: number } | null;
  /** Planeta donde se depositaran los recursos */
  targetPlanetName?: string | null;
  /** Color del tema: naranja para el Hangar, rosa para Defensa */
  accent?: Accent;
  onConfirm: () => void;
  onCancel: () => void;
  /** [GIFTITEMS1] Si se pasa, muestra la opcion de regalar el plano a un amigo */
  onGift?: () => void;
}

export function BlueprintPurchaseConfirm({
  name,
  costTung,
  imageUrl = null,
  currentQuantity = 0,
  includedResources = null,
  targetPlanetName = null,
  accent = 'orange',
  onConfirm,
  onCancel,
  onGift,
}: BlueprintPurchaseConfirmProps) {
  const a = ACCENT[accent];
  const hasResources =
    !!includedResources &&
    includedResources.metal + includedResources.crystal + includedResources.deuterium > 0;

  // Cerrar con la tecla Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Evita que la pagina de fondo se desplace mientras el modal esta abierto (movil)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Portal a <body> para que ningun contenedor con transform/backdrop-blur recorte el modal
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative flex flex-col w-full max-w-md max-h-[94vh] supports-[height:100dvh]:max-h-[94dvh] bg-space-800 rounded-2xl border-2 ${a.border} ${a.glow} overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Linea de energia superior */}
        <div className={`h-[3px] w-full flex-shrink-0 bg-gradient-to-r from-transparent ${a.line} to-transparent`} />

        {/* Esquinas tipo HUD */}
        <span className={`pointer-events-none absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 ${a.border} rounded-tl-md`} />
        <span className={`pointer-events-none absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 ${a.border} rounded-tr-md`} />
        <span className={`pointer-events-none absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 ${a.border} rounded-bl-md`} />
        <span className={`pointer-events-none absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 ${a.border} rounded-br-md`} />

        {/* Cabecera */}
        <div className={`relative flex-shrink-0 bg-gradient-to-r ${a.headerBg} px-4 sm:px-5 py-3 sm:py-4 border-b border-space-600`}>
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            className="absolute top-2 right-2 sm:top-3 sm:right-3 p-2 rounded-lg text-gray-500 hover:text-white hover:bg-space-700 transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className={`p-2 sm:p-2.5 rounded-xl border ${a.iconBg} ${a.text} animate-pulse-slow`}>
              <ScrollText className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-orbitron text-base sm:text-lg text-white tracking-wider uppercase">
                Confirmar compra
              </h3>
              <p className={`text-[11px] sm:text-xs ${a.text} tracking-[0.2em] uppercase`}>
                Plano de construccion
              </p>
            </div>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3 sm:space-y-4">
          {/* Nave / defensa */}
          <div className={`flex items-center gap-3 p-3 rounded-xl bg-space-900/60 border border-space-600 ring-1 ${a.ring}`}>
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-gradient-to-br from-space-700 to-space-900 flex items-center justify-center flex-shrink-0">
              {imageUrl ? (
                <GameMedia src={imageUrl} alt={name} className="w-full h-full object-cover" />
              ) : (
                <ScrollText className={`w-7 h-7 ${a.text}`} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-500 uppercase tracking-[0.15em]">Plano de</p>
              <p className="font-orbitron text-white text-sm sm:text-base leading-tight break-words">{name}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                En inventario: <span className="text-white font-semibold">{formatNumber(currentQuantity)}</span>
              </p>
            </div>
          </div>

          {/* Coste */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3 rounded-xl bg-space-900/60 border border-space-600">
            <span className="text-xs text-gray-400 uppercase tracking-[0.15em]">Coste</span>
            <span className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-cyber-yellow" />
              <span className="font-orbitron text-xl sm:text-2xl text-cyber-yellow leading-none">
                {costTung != null ? formatNumber(costTung) : '—'}
              </span>
              <span className="text-cyber-yellow/70 font-orbitron text-sm">TUNG</span>
            </span>
          </div>

          {/* Recursos incluidos con el plano */}
          {hasResources && (
            <div className="rounded-xl bg-cyber-green/5 border border-cyber-green/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-4 h-4 text-cyber-green flex-shrink-0" />
                <span className="text-[11px] sm:text-xs font-orbitron text-cyber-green uppercase tracking-[0.15em]">
                  Incluye los recursos
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Al comprar este plano se depositan automaticamente en
                {targetPlanetName ? (
                  <span className="text-white font-semibold"> {targetPlanetName} </span>
                ) : (
                  ' tu planeta '
                )}
                los recursos exactos que cuesta fabricar la unidad. No tienes que reunirlos tu.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-space-900/70 border border-space-600 px-2 py-1.5 text-center">
                  <p className="text-[9px] text-gray-500 uppercase tracking-wider">Metal</p>
                  <p className="font-orbitron text-xs sm:text-sm text-gray-100 leading-tight">
                    {formatNumber(includedResources!.metal)}
                  </p>
                </div>
                <div className="rounded-lg bg-space-900/70 border border-space-600 px-2 py-1.5 text-center">
                  <p className="text-[9px] text-gray-500 uppercase tracking-wider">Cristal</p>
                  <p className="font-orbitron text-xs sm:text-sm text-cyan-200 leading-tight">
                    {formatNumber(includedResources!.crystal)}
                  </p>
                </div>
                <div className="rounded-lg bg-space-900/70 border border-space-600 px-2 py-1.5 text-center">
                  <p className="text-[9px] text-gray-500 uppercase tracking-wider">Deuterio</p>
                  <p className="font-orbitron text-xs sm:text-sm text-emerald-200 leading-tight">
                    {formatNumber(includedResources!.deuterium)}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-snug">
                El plano se gasta al encolar la unidad y solo exige Barraca Nv1. El tiempo de
                construccion sigue dependiendo de tu Barraca, Nanobots y velocidad del universo.
              </p>
            </div>
          )}

          {/* Aviso */}
          <div className="flex items-start gap-2 text-[11px] sm:text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>El TUNG se descontara de tu saldo al instante. Esta accion no se puede deshacer.</p>
          </div>

          {/* Botones */}
          <div className="flex gap-2 sm:gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl font-orbitron text-xs sm:text-sm uppercase tracking-wider bg-space-700 border border-space-500 text-gray-300 hover:bg-space-600 hover:text-white transition-colors"
            >
              No
            </button>
            <button
              onClick={onConfirm}
              className={`flex-[2] sm:flex-1 py-3 rounded-xl font-orbitron text-xs sm:text-sm uppercase tracking-wider whitespace-nowrap text-white bg-gradient-to-r ${a.confirmBtn} transition-all hover:scale-[1.03] active:scale-95 flex items-center justify-center gap-2`}
            >
              <Check className="w-4 h-4" />
              Si, comprar
            </button>
          </div>
          {onGift && (
            <button
              onClick={onGift}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-pink-500/10 border border-pink-500/40 text-pink-200 hover:bg-pink-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <Gift className="w-4 h-4" />
              Regalar a un amigo
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
