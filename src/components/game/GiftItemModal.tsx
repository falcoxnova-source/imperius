import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Loader2, Users, X, Coins, AlertTriangle, CheckCircle, User as UserIcon, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatNumber } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { GameMedia } from '../ui/GameMedia';

/**
 * [GIFTITEMS1] Modal para comprar un articulo y regalarlo a un amigo o aliado.
 * Todo el cobro, reparto y entrega ocurre en la RPC `gift_shop_item`
 * (el servidor valida destinatario, precio vivo, saldo y limites).
 */

export type GiftKind = 'blueprint' | 'supply_box' | 'instant_unit' | 'officer';

interface Props {
  open: boolean;
  onClose: () => void;
  kind: GiftKind;
  code: string;
  itemName: string;
  imageUrl?: string | null;
  maxQty: number;
  /** Coste estimado en TUNG para una cantidad dada (null si el precio no esta disponible) */
  estimateCost: (qty: number) => number | null;
  /** Solo para kind='officer': '7d' | '30d' | '90d' (RPC `gift_officer`) */
  duration?: string;
  onSuccess?: (message: string) => void;
}

interface Ally {
  user_id: string;
  username: string;
}

const DELIVERY_NOTE: Record<GiftKind, string> = {
  blueprint: 'El plano llega a su inventario de planos.',
  supply_box: 'Los recursos se depositan en su ciudad principal.',
  instant_unit: 'Las unidades se entregan al instante en su ciudad principal.',
  officer: 'El oficial se activa al instante en su cuenta.',
};

export function GiftItemModal({ open, onClose, kind, code, itemName, imageUrl, maxQty, estimateCost, duration, onSuccess }: Props) {
  const { profile, user, refreshProfile } = useAuthStore();
  const balance = Number(profile?.tung_balance ?? profile?.fxu_balance ?? 0);

  const [username, setUsername] = useState('');
  const [qtyRaw, setQtyRaw] = useState('1');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [allies, setAllies] = useState<Ally[]>([]);
  const inFlight = useRef(false);

  // Reinicia el formulario cada vez que se abre
  useEffect(() => {
    if (!open) return;
    setUsername('');
    setQtyRaw('1');
    setConfirm(false);
    setError(null);
    setDone(null);
  }, [open, code, kind]);

  // Companeros de alianza como seleccion rapida
  useEffect(() => {
    if (!open || !profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: me } = await supabase
        .from('alliance_members')
        .select('alliance_id')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (!me?.alliance_id) {
        if (!cancelled) setAllies([]);
        return;
      }
      const { data } = await supabase
        .from('alliance_members')
        .select('user_id, profile:profiles(username)')
        .eq('alliance_id', me.alliance_id);
      if (cancelled) return;
      const list = ((data || []) as any[])
        .filter((m) => m.user_id !== profile.id && m.profile?.username)
        .map((m) => ({ user_id: m.user_id as string, username: m.profile.username as string }))
        .sort((a, b) => a.username.localeCompare(b.username));
      setAllies(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, profile?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inFlight.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Evita que la pagina de fondo se desplace mientras el modal esta abierto (movil)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const parsed = Math.floor(Number(qtyRaw));
  const qty = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, Math.max(1, maxQty)) : 1;
  const cost = estimateCost(qty);
  const name = username.trim();
  const isEmail = name.includes('@');
  const isSelf =
    (!!profile?.username && name.toLowerCase() === profile.username.toLowerCase()) ||
    (!!user?.email && name.toLowerCase() === user.email.toLowerCase());
  const canAfford = cost !== null && balance >= cost;
  const canContinue = name.length > 0 && name.length <= (isEmail ? 254 : 64) && !isSelf && cost !== null && canAfford && !sending;

  const send = async () => {
    if (inFlight.current || !canContinue) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const { data, error: rpcError } =
        kind === 'officer'
          ? await supabase.rpc('gift_officer', {
              p_recipient_username: name,
              p_officer_type_id: code,
              p_duration: duration,
            })
          : await supabase.rpc('gift_shop_item', {
              p_recipient_username: name,
              p_kind: kind,
              p_code: code,
              p_quantity: qty,
            });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'No se pudo enviar el regalo');
      const msg = data.message || `Regalo enviado a ${name}`;
      setDone(msg);
      onSuccess?.(msg);
      await refreshProfile();
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar el regalo');
      setConfirm(false);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  // Portal a <body>: los contenedores con backdrop-blur/overflow-hidden (card-glass)
  // atrapan a los elementos `fixed` y el modal quedaria recortado dentro de la tarjeta.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={() => !inFlight.current && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex w-full max-w-md flex-col max-h-[92vh] supports-[height:100dvh]:max-h-[92dvh] sm:max-h-[90vh] sm:supports-[height:100dvh]:max-h-[90dvh] rounded-t-2xl sm:rounded-xl border border-pink-500/40 bg-gradient-to-br from-space-800 to-space-900 shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-space-600 p-3 sm:p-4">
          <div className="rounded-lg bg-pink-500/15 p-2">
            <Gift className="h-6 w-6 text-pink-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-orbitron text-base text-white">Regalar a un amigo</h3>
            <p className="truncate text-xs text-gray-400">{itemName}</p>
          </div>
          <button
            onClick={() => !inFlight.current && onClose()}
            className="rounded-lg p-2 text-gray-400 hover:bg-space-700 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {imageUrl && (
            <div className="h-24 sm:h-28 overflow-hidden rounded-lg border border-space-600 bg-space-900">
              <GameMedia src={imageUrl} alt={itemName} className="h-full w-full object-contain" />
            </div>
          )}

          {done ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-green-500 bg-green-500/15 px-3 py-3 text-sm text-green-300">
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 break-words">{done}</span>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-pink-500/20 py-2.5 font-semibold text-pink-200 border border-pink-500/50 hover:bg-pink-500/30"
              >
                Listo
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs text-gray-400">¿A quién se lo regalas?</label>
                <div className="mb-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <div className="flex items-center gap-1.5 rounded-md border border-space-600 bg-space-900/60 px-2 py-1.5 text-[11px] leading-tight text-gray-300">
                    <UserIcon className="h-3.5 w-3.5 shrink-0 text-pink-300" />
                    <span>Su <b className="text-white">nombre de usuario</b> del juego</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md border border-space-600 bg-space-900/60 px-2 py-1.5 text-[11px] leading-tight text-gray-300">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-pink-300" />
                    <span>o el <b className="text-white">correo (Gmail)</b> con el que se registró</span>
                  </div>
                </div>
                <input
                  type="text"
                  value={username}
                  maxLength={254}
                  disabled={sending || confirm}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  placeholder="Ej: MiAmigo123 o amigo@gmail.com"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-space-600 bg-space-900 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-white focus:border-pink-400 focus:outline-none disabled:opacity-60"
                />
                {isSelf && <p className="mt-1 text-xs text-amber-300">No puedes regalarte a ti mismo.</p>}
              </div>

              {allies.length > 0 && !confirm && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1 text-xs text-gray-400">
                    <Users className="h-3.5 w-3.5" /> Tus aliados
                  </p>
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {allies.map((a) => (
                      <button
                        key={a.user_id}
                        type="button"
                        disabled={sending}
                        onClick={() => {
                          setUsername(a.username);
                          setError(null);
                        }}
                        className={`max-w-full truncate rounded-full border px-3 py-1.5 sm:px-2.5 sm:py-1 text-xs transition-all ${
                          name === a.username
                            ? 'border-pink-400 bg-pink-500/25 text-pink-100'
                            : 'border-space-600 bg-space-700 text-gray-300 hover:border-pink-400/60'
                        }`}
                      >
                        {a.username}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {maxQty > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="whitespace-nowrap text-xs text-gray-400">Cantidad (máx {formatNumber(maxQty)})</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxQty}
                    value={qtyRaw}
                    disabled={sending || confirm}
                    onChange={(e) => setQtyRaw(e.target.value)}
                    className="min-w-[6rem] flex-1 rounded-lg border border-space-600 bg-space-900 px-3 py-2 sm:py-1.5 text-base sm:text-sm text-white focus:border-pink-400 focus:outline-none disabled:opacity-60"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-space-800/60 px-3 py-2">
                <span className="text-xs text-gray-400">Pagas tú</span>
                <span className="flex items-center gap-1 font-orbitron font-semibold text-cyber-yellow">
                  <Coins className="h-4 w-4" />
                  {cost !== null ? `${formatNumber(cost)} TUNG` : '—'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Tu saldo: {formatNumber(balance)} TUNG · {DELIVERY_NOTE[kind]} Recibirá un mensaje con tu nombre.
              </p>
              {cost !== null && !canAfford && (
                <p className="flex items-center gap-1 text-xs text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> TUNG insuficiente
                </p>
              )}

              {error && (
                <div className="break-words rounded-lg border border-red-500 bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</div>
              )}

              {!confirm ? (
                <button
                  disabled={!canContinue}
                  onClick={() => setConfirm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-pink-500/50 bg-gradient-to-r from-pink-500/20 to-amber-500/20 py-2.5 font-semibold text-pink-200 transition-all hover:from-pink-500/30 hover:to-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Gift className="h-4 w-4" /> Continuar
                </button>
              ) : (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="break-words text-sm text-amber-100">
                    ¿Regalar <b>{kind === 'officer' ? itemName : `${qty}x ${itemName}`}</b> a <b>{name}</b> por <b>{cost !== null ? formatNumber(cost) : '—'} TUNG</b>?
                    Este pago no se puede deshacer.
                  </p>
                  <p className="text-[11px] text-gray-400">El precio final se calcula al cambio del momento.</p>
                  <div className="flex flex-col-reverse gap-2 min-[360px]:flex-row">
                    <button
                      disabled={sending}
                      onClick={send}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-pink-500/30 py-2 font-semibold text-pink-100 border border-pink-400/60 hover:bg-pink-500/40 disabled:opacity-60"
                    >
                      {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : 'Sí, regalar'}
                    </button>
                    <button
                      disabled={sending}
                      onClick={() => setConfirm(false)}
                      className="flex-1 rounded-lg bg-space-700 py-2 text-gray-300 hover:bg-space-600 disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
