import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSfxMuted, onSfxMuteChange, setSfxMuted, unlockSfx } from '../../lib/sfx';

/** Botón de sonido on/off; además desbloquea el audio en el primer gesto del usuario. */
export function SoundToggle({ className = '' }: { className?: string }) {
  const [muted, setMuted] = useState(isSfxMuted);

  useEffect(() => onSfxMuteChange(setMuted), []);
  useEffect(() => {
    const u = () => unlockSfx();
    window.addEventListener('pointerdown', u);
    window.addEventListener('keydown', u);
    return () => { window.removeEventListener('pointerdown', u); window.removeEventListener('keydown', u); };
  }, []);

  const label = muted ? 'Activar sonido' : 'Silenciar';
  return (
    <button type="button" onClick={() => setSfxMuted(!muted)} title={label} aria-label={label} aria-pressed={!muted}
      className={`shrink-0 p-2 rounded-lg border hover:bg-slate-700 ${muted ? 'bg-slate-900/70 border-slate-700 text-slate-500' : 'bg-sky-900/40 border-sky-400/40 text-sky-300'} ${className}`}>
      {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
    </button>
  );
}
