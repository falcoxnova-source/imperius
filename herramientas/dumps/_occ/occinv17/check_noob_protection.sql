CREATE OR REPLACE FUNCTION public.check_noob_protection(p_attacker_id uuid, p_defender_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_attacker_points integer;
  v_defender_points integer;
  v_noob_limit integer;
  v_protection_ratio numeric;
  v_attacker_vacation boolean;
  v_defender_vacation boolean;
  -- [PATCH ALLYNOATK]
  v_att_alliance uuid;
  v_def_alliance uuid;
BEGIN
  SELECT points_total, vacation_mode INTO v_attacker_points, v_attacker_vacation
  FROM public.profiles WHERE id = p_attacker_id;

  SELECT points_total, vacation_mode INTO v_defender_points, v_defender_vacation
  FROM public.profiles WHERE id = p_defender_id;

  SELECT value::integer INTO v_noob_limit
  FROM public.game_settings WHERE key = 'newbie_protection_points';

  IF v_noob_limit IS NULL THEN
    v_noob_limit := 5000;
  END IF;

  -- Read protection ratio from admin settings (default 5 if not set). Numeric para permitir decimales.
  SELECT value::numeric INTO v_protection_ratio
  FROM public.game_settings WHERE key = 'protection_ratio';

  IF v_protection_ratio IS NULL OR v_protection_ratio < 1 THEN
    v_protection_ratio := 5;
  END IF;

  -- [PATCH ALLYNOATK] Miembros de la misma alianza no pueden agredirse entre si
  IF p_attacker_id IS DISTINCT FROM p_defender_id THEN
    SELECT alliance_id INTO v_att_alliance FROM public.alliance_members WHERE user_id = p_attacker_id;
    IF v_att_alliance IS NOT NULL THEN
      SELECT alliance_id INTO v_def_alliance FROM public.alliance_members WHERE user_id = p_defender_id;
      IF v_def_alliance = v_att_alliance THEN
        RETURN jsonb_build_object(
          'can_attack', false,
          'same_alliance', true,
          'reason', 'Es de tu misma alianza: no puedes atacarle ni espiarle'
        );
      END IF;
    END IF;
  END IF;

  -- Vacation mode checks
  IF v_attacker_vacation THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'No puedes atacar en modo vacaciones'
    );
  END IF;

  IF v_defender_vacation THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador esta en modo vacaciones'
    );
  END IF;

  -- Big player cannot attack noob
  IF v_defender_points <= v_noob_limit AND v_attacker_points > v_noob_limit THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador esta bajo proteccion de novatos'
    );
  END IF;

  -- Noob cannot attack big player (mirror rule)
  IF v_attacker_points <= v_noob_limit AND v_defender_points > v_noob_limit THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador es demasiado fuerte'
    );
  END IF;

  -- Attacker is Nx stronger than defender (uses admin-configured ratio)
  IF v_attacker_points > v_defender_points * v_protection_ratio AND v_defender_points > 0 THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', format('El jugador es demasiado debil (ratio %s:1)', v_protection_ratio)
    );
  END IF;

  -- Defender is Nx stronger than attacker (SIMETRICO: mismo criterio que arriba)
  IF v_defender_points > v_attacker_points * v_protection_ratio AND v_attacker_points > 0 THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', format('El jugador es demasiado fuerte (ratio 1:%s)', v_protection_ratio)
    );
  END IF;

  RETURN jsonb_build_object('can_attack', true, 'reason', null);
END;
$function$

