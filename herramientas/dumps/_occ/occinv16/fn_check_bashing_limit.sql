CREATE OR REPLACE FUNCTION public.check_bashing_limit(p_attacker_id uuid, p_defender_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attack_count integer;
  v_bashing_enabled boolean;
  v_max_attacks integer := 3;
  v_alliance_id uuid;
  v_is_alliance boolean := false;
BEGIN
  -- Nunca aplica a uno mismo
  IF p_attacker_id IS NULL OR p_defender_id IS NULL OR p_attacker_id = p_defender_id THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  SELECT (value = 'true') INTO v_bashing_enabled
  FROM game_settings WHERE key = 'bashing_protection';

  IF NOT COALESCE(v_bashing_enabled, false) THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Alianza del atacante (si pertenece a una)
  SELECT alliance_id INTO v_alliance_id
  FROM alliance_members WHERE user_id = p_attacker_id LIMIT 1;
  v_is_alliance := v_alliance_id IS NOT NULL;

  -- Cuenta ataques COMPLETADOS (battle_reports, ultimas 24h) + ataques EN VUELO (fleets)
  -- del CONJUNTO atacante (alianza completa o solo el atacante) contra ESTE defensor.
  SELECT COUNT(*) INTO v_attack_count
  FROM (
    -- Ataques ya resueltos y registrados
    SELECT br.created_at AS ts
    FROM battle_reports br
    WHERE br.defender_id = p_defender_id
      AND br.battle_type = 'attack'
      AND br.created_at > NOW() - INTERVAL '24 hours'
      AND (
        (v_is_alliance AND br.attacker_id IN (SELECT user_id FROM alliance_members WHERE alliance_id = v_alliance_id))
        OR (NOT v_is_alliance AND br.attacker_id = p_attacker_id)
      )
    UNION ALL
    -- Ataques en vuelo, aun no aterrizados (todavia no estan en battle_reports)
    SELECT f.departure_time AS ts
    FROM fleets f
    WHERE f.mission_type IN ('attack', 'destroy')
      AND f.is_completed = false
      AND f.is_returning = false
      AND f.departure_time > NOW() - INTERVAL '24 hours'
      AND (
        (v_is_alliance AND f.user_id IN (SELECT user_id FROM alliance_members WHERE alliance_id = v_alliance_id))
        OR (NOT v_is_alliance AND f.user_id = p_attacker_id)
      )
      AND EXISTS (
        SELECT 1 FROM planets p
        WHERE p.galaxy = f.target_galaxy
          AND p.solar_system = f.target_system
          AND p.position = f.target_position
          AND p.user_id = p_defender_id
          AND NOT p.is_destroyed
      )
  ) combined;

  IF v_attack_count >= v_max_attacks THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', CASE WHEN v_is_alliance
        THEN format('Tu alianza ya atacó %s veces a este jugador en las últimas 24 horas (%s/%s). Debes esperar para poder atacarlo de nuevo.', v_max_attacks, v_attack_count, v_max_attacks)
        ELSE format('Ya atacaste %s veces a este jugador en las últimas 24 horas (%s/%s). Debes esperar para poder atacarlo de nuevo.', v_max_attacks, v_attack_count, v_max_attacks)
      END,
      'count', v_attack_count,
      'max', v_max_attacks,
      'is_alliance', v_is_alliance
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'count', v_attack_count,
    'max', v_max_attacks,
    'is_alliance', v_is_alliance
  );
END;
$function$

