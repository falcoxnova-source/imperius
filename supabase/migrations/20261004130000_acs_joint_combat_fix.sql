-- [ACSJOINT1] ACS normal (planetas que NO son Fortaleza/Tesoro): combate CONJUNTO.
-- Bug: process_user_pending_fleets (heartbeat) y accelerate_acs llamaban a
-- process_fleet_arrival por cada flota del ACS y cada una peleaba SOLA contra el
-- defensor (la primera recibia todo el dano). Luego check_pending_acs_attacks
-- volvia a resolver el ACS con las supervivientes (doble combate).
-- Fix: una flota ACS que llega a un planeta normal delega en el procesador ACS
-- ya existente (process_acs_fleet_arrival, el mismo que usa process_all_pending_fleets).
-- Si el ACS ya no existe/esta cerrado y la flota sigue en vuelo, se mantiene el
-- comportamiento anterior (combate individual) para no dejar flotas atascadas.
DO $mig$
DECLARE
  v_def text;
  v_anchor text := E'    IF v_all_acs_fleets_arrived THEN RETURN; END IF;\n  END IF;\n';
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.process_fleet_arrival(uuid)'::regprocedure) INTO v_def;

  IF position('[ACSJOINT1]' IN v_def) > 0 THEN
    RAISE NOTICE 'ACSJOINT1 ya aplicado';
    RETURN;
  END IF;

  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'ACSJOINT1: ancla no encontrada o no unica';
  END IF;

  v_new := v_anchor || $blk$
  -- [ACSJOINT1] ACS contra planeta normal: combate CONJUNTO de todas las flotas
  -- del ACS (nunca una a una). Delegado en process_acs_fleet_arrival.
  IF fleet_record.is_acs = true AND fleet_record.acs_id IS NOT NULL
     AND NOT fleet_record.is_returning AND fleet_record.arrival_time <= NOW()
     AND fleet_record.mission_type = 'attack'
     AND NOT (fleet_record.target_system = 250 AND fleet_record.target_position IN (8, 9)) THEN
    PERFORM public.process_acs_fleet_arrival(fleet_record.acs_id);
    -- Resuelto por el ACS (esta flota ya regresa/termino) o lo esta resolviendo
    -- otra sesion / aun no es la hora del ACS -> no combatir individualmente.
    IF NOT EXISTS (SELECT 1 FROM fleets f WHERE f.id = p_fleet_id AND f.is_completed = false AND f.is_returning = false)
       OR EXISTS (SELECT 1 FROM acs_fleets af WHERE af.id = fleet_record.acs_id AND af.is_active = true AND af.status IN ('waiting', 'in_combat')) THEN
      RETURN;
    END IF;
    -- ACS inexistente/cerrado y la flota sigue en vuelo: flujo individual (legado).
  END IF;
$blk$;

  v_def := replace(v_def, v_anchor, v_new);
  EXECUTE v_def;
END
$mig$;
