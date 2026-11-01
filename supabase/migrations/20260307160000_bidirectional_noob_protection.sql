/*
  # Bidirectional noob protection

  ## Problem
  A player under noob protection (e.g. 2000 pts) is protected from big players
  (e.g. 8000 pts), but the small player CAN attack the big one because
  8000 < 2000*5 = 10000 (the 5:1 ratio check doesn't trigger).

  ## Fix
  If the attacker is under the noob limit AND the defender is above it,
  block the attack with "Jugador demasiado fuerte".
  This is the exact MIRROR of the existing rule:
    big can't attack small → small can't attack big either.

  ## What it changes
  - check_noob_protection: adds 1 new IF block (mirror condition)
  - No table changes, no column changes, no other function changes
*/

CREATE OR REPLACE FUNCTION check_noob_protection(p_attacker_id uuid, p_defender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_attacker_points integer;
  v_defender_points integer;
  v_noob_limit integer;
  v_attacker_vacation boolean;
  v_defender_vacation boolean;
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

  -- NEW: Noob cannot attack big player (mirror rule)
  IF v_attacker_points <= v_noob_limit AND v_defender_points > v_noob_limit THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador es demasiado fuerte'
    );
  END IF;

  -- Attacker is 5x stronger than defender
  IF v_attacker_points > v_defender_points * 5 AND v_defender_points > 0 THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador es demasiado debil (ratio 5:1)'
    );
  END IF;

  -- Defender is 5x stronger than attacker
  IF v_defender_points > v_attacker_points * 5 AND v_defender_points > v_noob_limit THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador es demasiado fuerte (ratio 1:5)'
    );
  END IF;

  RETURN jsonb_build_object('can_attack', true, 'reason', null);
END;
$$;
