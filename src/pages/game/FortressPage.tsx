import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Castle, Users, Swords, Loader2, ChevronDown, ChevronUp, Rocket, ArrowLeftRight, Send, Zap, AlertTriangle, Gem, LogOut } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { AllianceFortress } from '../../types/game';

export function FortressPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { fortresses, selectedFortress, fetchAllFortresses, fetchFortressInfo, recallFromFortress,
          treasurePlanets, fetchAllTreasurePlanets, abandonStronghold } = useGameStore();
  const [isLoading, setIsLoading] = useState(true);
  const [expandedGalaxy, setExpandedGalaxy] = useState<number | null>(null);
  const [recallingGalaxy, setRecallingGalaxy] = useState<number | null>(null);
  const [userAllianceId, setUserAllianceId] = useState<string | null>(null);
  // Abandono voluntario (solo lider/fundador)
  const [isLeader, setIsLeader] = useState(false);
  const [abandonTarget, setAbandonTarget] = useState<number | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  // [FTFLAG1] Si el admin desactiva el limite, la regla de exclusion no aplica
  const [strongholdLimitEnabled, setStrongholdLimitEnabled] = useState(true);

  useEffect(() => { loadFortresses(); }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('stronghold_limit_enabled').then(({ data, error }) => {
      if (cancelled || error) return;
      setStrongholdLimitEnabled(data !== false);
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch user's alliance + si es lider/fundador
  useEffect(() => {
    if (!profile?.id) { setUserAllianceId(null); setIsLeader(false); return; }
    let cancelled = false;
    (async () => {
      const { data: member } = await supabase
        .from('alliance_members').select('alliance_id').eq('user_id', profile.id).maybeSingle();
      if (cancelled) return;
      const aid = member?.alliance_id || null;
      setUserAllianceId(aid);
      if (!aid) { setIsLeader(false); return; }
      const { data: alli } = await supabase
        .from('alliances').select('leader_id, founder_id').eq('id', aid).maybeSingle();
      if (cancelled) return;
      setIsLeader(!!alli && (alli.leader_id === profile.id || alli.founder_id === profile.id));
    })().catch(() => { if (!cancelled) { setUserAllianceId(null); setIsLeader(false); } });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const loadFortresses = async () => {
    setIsLoading(true);
    await Promise.all([fetchAllFortresses(), fetchAllTreasurePlanets()]);
    setIsLoading(false);
  };

  // Lo que ya controla mi alianza (para explicar por que no puedo capturar)
  const myFortress = userAllianceId ? fortresses.find((f) => f.owner_alliance_id === userAllianceId) : undefined;
  const myTreasure = userAllianceId ? treasurePlanets.find((t) => t.owner_alliance_id === userAllianceId) : undefined;

  // Abandonar la fortaleza de la alianza
  const handleAbandon = useCallback(async (galaxy: number) => {
    if (abandoning) return;
    setAbandoning(true);
    setAbandonError(null);
    try {
      const res = await abandonStronghold('fortress', galaxy);
      if (res?.success) {
        setAbandonTarget(null);
        setExpandedGalaxy(null);
        await Promise.all([fetchAllFortresses(), fetchAllTreasurePlanets()]);
      } else {
        setAbandonError(res?.error || 'No se pudo abandonar la fortaleza');
      }
    } finally {
      setAbandoning(false);
    }
  }, [abandoning, abandonStronghold, fetchAllFortresses, fetchAllTreasurePlanets]);

  const toggleGalaxy = async (galaxy: number) => {
    if (expandedGalaxy === galaxy) { setExpandedGalaxy(null); return; }
    setExpandedGalaxy(galaxy);
    await fetchFortressInfo(galaxy);
  };

  // Redirect to FleetPage with fortress coordinates
  const attackFortress = (galaxy: number) => {
    navigate(`/game/fleet?galaxy=${galaxy}&system=250&position=8&mission=attack`);
  };

  // Deploy/reinforce fortress
  const deployToFortress = (galaxy: number) => {
    navigate(`/game/fleet?galaxy=${galaxy}&system=250&position=8&mission=deploy`);
  };

  // Recall ships from fortress
  const handleRecall = useCallback(async (galaxy: number) => {
    if (!selectedFortress || recallingGalaxy) return;
    const myContributor = selectedFortress.contributors?.find((c: any) => c.user_id === profile?.id);
    if (!myContributor || !myContributor.ships_detail || myContributor.ships_detail.length === 0) return;
    
    setRecallingGalaxy(galaxy);
    try {
      const ships = myContributor.ships_detail.map((s: any) => ({
        ship_type_id: s.ship_type_id,
        quantity: s.quantity,
      }));
      await recallFromFortress(galaxy, ships);
      // Refresh fortress info
      await fetchFortressInfo(galaxy);
    } catch (e) {
      console.error('Error recalling ships:', e);
    } finally {
      setRecallingGalaxy(null);
    }
  }, [selectedFortress, recallingGalaxy, profile?.id, recallFromFortress, fetchFortressInfo]);

  const getFortressStatus = (fortress: AllianceFortress) => {
    if (!fortress.owner_alliance_id) return { label: 'Sin dueño', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' };
    const hours = fortress.captured_at ? Math.floor((Date.now() - new Date(fortress.captured_at).getTime()) / 3600000) : 0;
    return { label: fortress.owner_alliance_tag || '???', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', hours };
  };

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-4 px-2 py-4">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 via-slate-800/90 to-slate-900 border border-slate-700/50 p-5">
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-purple-500/20 border border-amber-500/20"><Castle className="w-6 h-6 text-amber-400" /></div>
          <div><h2 className="text-lg font-bold text-white">Fortalezas Galácticas</h2><p className="text-xs text-slate-400">Envía una flota de ataque normal a [Galaxia, 250:8] para conquistar</p></div>
        </div>
      </div>

      <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
        <p className="text-sm text-cyan-300">
          💡 Para atacar una fortaleza, usa la <strong>página de Flotas</strong> normal. Selecciona tus naves y envíalas a las coordenadas de la fortaleza [Galaxia, 250:8] con misión <strong>Atacar</strong>. El sistema de vuelo usa la misma lógica de distancia, velocidad de naves y deuterio que cualquier ataque normal.
        </p>
      </div>

      {/* Regla de exclusión mutua Fortaleza <-> Planeta del Tesoro */}
      {strongholdLimitEnabled && (
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-200">
            Tu alianza puede controlar <strong>una Fortaleza</strong> <u>o</u> el <strong>Planeta del Tesoro</strong>, nunca las dos cosas.
            Atacar siempre está permitido, pero para <strong>capturar</strong> debes abandonar antes lo que ya controlas.
          </p>
        </div>
        {myTreasure && (
          <div className="mt-2 flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-2">
            <Gem className="w-3.5 h-3.5 shrink-0" />
            <span>Tu alianza controla el <strong>Planeta del Tesoro</strong> de la Galaxia {myTreasure.galaxy}. No podrás capturar ninguna Fortaleza hasta abandonarlo.</span>
          </div>
        )}
        {myFortress && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
            <Castle className="w-3.5 h-3.5 shrink-0" />
            <span>Tu alianza controla la <strong>Fortaleza</strong> de la Galaxia {myFortress.galaxy}. No podrás capturar otra Fortaleza ni el Planeta del Tesoro hasta abandonarla.</span>
          </div>
        )}
      </div>
      )}

      <div className="space-y-3">
        {fortresses.length === 0 ? (
          <div className="text-center py-10 text-slate-500"><Castle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No hay fortalezas disponibles</p></div>
        ) : fortresses.map((fortress) => {
          const status = getFortressStatus(fortress);
          const isExpanded = expandedGalaxy === fortress.galaxy;
          const detail = isExpanded ? selectedFortress : null;
          return (
            <div key={fortress.galaxy}>
              <div onClick={() => toggleGalaxy(fortress.galaxy)} className={`relative overflow-hidden rounded-xl border transition-all cursor-pointer ${status.border} ${status.bg} hover:brightness-110`}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${fortress.owner_alliance_id ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700/50 text-slate-400'}`}><Castle className="w-5 h-5" /></div>
                    <div>
                      <div className="flex items-center gap-2"><h3 className="font-semibold text-white text-sm">Galaxia {fortress.galaxy}</h3><span className="text-[10px] text-slate-500">[{fortress.system}:{fortress.position}]</span></div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs font-medium ${status.color}`}>{fortress.owner_alliance_name || 'Sin dueño'}</span>
                        {fortress.owner_alliance_tag && <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded font-semibold">[{fortress.owner_alliance_tag}]</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-xs text-slate-300"><Shield className="w-3 h-3" /><span className="font-mono font-bold">{(fortress.total_ships || 0).toLocaleString()}</span></div>
                      <div className="flex items-center gap-1 text-[10px] text-amber-400/70"><Zap className="w-3 h-3" /><span className="font-mono">{((fortress as any).total_combat_power || 0).toLocaleString()} ⚔</span></div>
                      {status.hours !== undefined && status.hours > 0 && <div className="text-[10px] text-slate-500">{status.hours}h en control</div>}
                    </div>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400 rotate-180" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                  </div>
                </div>
                {isExpanded && detail && (() => {
                  const myContributor = detail.contributors?.find((c: any) => c.user_id === profile?.id);
                  const myShips = myContributor?.total_ships || 0;
                  return (
                  <div className="px-4 pb-4 border-t border-slate-700/30 pt-3">
                    {/* Total Power Bar */}
                    <div className="mb-3 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 flex items-center justify-between">
                      <span className="text-[11px] text-amber-300/80 font-semibold">⚔ Poder Total</span>
                      <span className="text-sm font-bold text-amber-400 font-mono">{(detail.total_combat_power || 0).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div><h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Swords className="w-3 h-3" /> Flota Defensora</h4>
                        {detail.ships && detail.ships.length > 0 ? <div className="space-y-1 max-h-32 overflow-y-auto">{detail.ships.map((s: any) => <div key={s.ship_type_id} className="flex justify-between text-xs bg-slate-800/50 rounded px-2 py-1"><span className="text-slate-300">{s.ship_name}</span><div className="flex items-center gap-2"><span className="text-slate-400 font-mono">{s.total_quantity.toLocaleString()}</span><span className="text-[10px] text-amber-500/70">{((s.combat_power || 0)).toLocaleString()}⚔</span></div></div>)}</div> : <p className="text-xs text-slate-500">Sin naves</p>}
                      </div>
                      <div><h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> Contribuidores</h4>
                        {detail.contributors && detail.contributors.length > 0 ? <div className="space-y-1 max-h-32 overflow-y-auto">{detail.contributors.map((c: any) => <div key={c.user_id} className={`flex justify-between text-xs rounded px-2 py-1 ${c.user_id === profile?.id ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-slate-800/50'}`}><span className="text-slate-300 truncate mr-2">{c.username} {c.user_id === profile?.id ? '(tú)' : ''}</span><span className="text-slate-400 font-mono shrink-0">{c.total_ships.toLocaleString()} naves {(c.combat_power || 0) > 0 ? `· ${(c.combat_power || 0).toLocaleString()}⚔` : ''}</span></div>)}</div> : <p className="text-xs text-slate-500">Sin contribuidores</p>}
                      </div>
                    </div>

                    {/* My ships section with breakdown */}
                    {myShips > 0 && myContributor?.ships_detail && (
                      <div className="mb-3 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <p className="text-xs text-cyan-300 font-semibold">Tus naves en esta fortaleza</p>
                            <p className="text-[10px] text-slate-400">{myShips.toLocaleString()} naves · Poder: {(myContributor.combat_power || 0).toLocaleString()}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRecall(fortress.galaxy); }}
                            disabled={recallingGalaxy === fortress.galaxy}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {recallingGalaxy === fortress.galaxy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                            )}
                            Recoger Todo
                          </button>
                        </div>
                        {/* Ship breakdown */}
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {myContributor.ships_detail.map((s: any) => (
                            <div key={s.ship_type_id} className="flex justify-between items-center text-[11px] bg-slate-800/50 rounded px-2 py-1">
                              <span className="text-slate-300">{s.ship_name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-cyan-400 font-mono">x{s.quantity.toLocaleString()}</span>
                                <span className="text-[10px] text-slate-500">⚔{(s.weapon_power || 0) * s.quantity}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons - depends on alliance ownership */}
                    <div className="flex gap-2">
                      {(() => {
                        const isMyAlliance = userAllianceId && fortress.owner_alliance_id === userAllianceId;
                        if (isMyAlliance) {
                          // My alliance owns this fortress: reinforce (+ abandon si soy líder)
                          return (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); deployToFortress(fortress.galaxy); }}
                                className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-500/25"
                              >
                                <Send className="w-4 h-4" /> Enviar Refuerzos
                              </button>
                              {isLeader && (
                                <button onClick={(e) => { e.stopPropagation(); setAbandonError(null); setAbandonTarget(fortress.galaxy); }}
                                  className="py-2.5 px-3 text-sm font-bold rounded-lg transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30"
                                  title="Abandonar la fortaleza para poder capturar el Planeta del Tesoro"
                                >
                                  <LogOut className="w-4 h-4" /> Abandonar
                                </button>
                              )}
                            </>
                          );
                        }
                        if (fortress.owner_alliance_id) {
                          // Another alliance owns it: attack only
                          return (
                            <button onClick={(e) => { e.stopPropagation(); attackFortress(fortress.galaxy); }}
                              className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-red-500/25"
                            >
                              <Rocket className="w-4 h-4" /> Atacar
                            </button>
                          );
                        }
                        // Unclaimed: capture
                        return (
                          <button onClick={(e) => { e.stopPropagation(); attackFortress(fortress.galaxy); }}
                            className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-amber-500/25"
                          >
                            <Rocket className="w-4 h-4" /> Capturar
                          </button>
                        );
                      })()}
                    </div>
                    {/* Aviso de por qué no se podría capturar esta fortaleza */}
                    {strongholdLimitEnabled && fortress.owner_alliance_id !== userAllianceId && (myTreasure || (myFortress && myFortress.galaxy !== fortress.galaxy)) && (
                      <p className="text-[10px] text-amber-400/90 text-center mt-1.5 flex items-center justify-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Puedes atacar, pero NO capturar: tu alianza ya controla {myTreasure ? 'el Planeta del Tesoro' : 'una Fortaleza'}.
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500 text-center mt-1.5">Usa la página de Flotas para enviar ataques o refuerzos a [Galaxia {fortress.galaxy}, 250:8]</p>
                  </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de confirmación de abandono */}
      {abandonTarget !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => { if (!abandoning) setAbandonTarget(null); }}>
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-red-500/40 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-base font-bold text-white">Abandonar la Fortaleza</h3>
            </div>
            <p className="text-sm text-slate-300 mb-3">
              Tu alianza dejará de controlar la Fortaleza de la <strong>Galaxia {abandonTarget}</strong> [{abandonTarget}:250:8] y quedará libre para cualquier otra alianza.
            </p>
            <ul className="text-xs text-slate-400 space-y-1 mb-3 list-disc list-inside">
              <li>Todas las naves estacionadas <strong>regresan a los planetas principales</strong> de sus dueños.</li>
              <li>Tu alianza dejará de recibir el reparto de la Fortaleza.</li>
              <li>Después podrás capturar el <strong>Planeta del Tesoro</strong>.</li>
            </ul>
            <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
              Esta acción es <strong>irreversible</strong>. Para recuperarla tendrías que volver a conquistarla.
            </p>
            {abandonError && <p className="text-xs text-red-400 mb-3">{abandonError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setAbandonTarget(null)}
                disabled={abandoning}
                className="flex-1 py-2.5 text-sm font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleAbandon(abandonTarget)}
                disabled={abandoning}
                className="flex-1 py-2.5 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {abandoning ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                Sí, abandonar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
