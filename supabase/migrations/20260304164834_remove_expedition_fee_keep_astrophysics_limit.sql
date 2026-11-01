/*
  # Remove expedition fee - Keep astrophysics-based limit (XNova style)

  1. Changes
    - Modified `charge_expedition_fee` to never charge FXU
    - Expeditions are now unlimited within astrophysics level cap
    - Astrophysics limit formula remains: max = FLOOR(SQRT(astrophysics_level))
    - Set `expedition_extra_fee_fxu` game setting to 0
  
  2. Important Notes
    - All expeditions are now free (no FXU cost for extra expeditions)
    - The only limit is based on astrophysics research level (like original XNova)
    - Revenue type 'expedition_fee' preserved for historical records
*/

-- Set expedition fee to 0 in game_settings
UPDATE game_settings
SET value = '0'
WHERE key = 'expedition_extra_fee_fxu';

-- Replace charge_expedition_fee to never charge, only validate astrophysics limit
CREATE OR REPLACE FUNCTION charge_expedition_fee(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active_expeditions integer;
  v_astrophysics_level integer;
  v_max_expeditions integer;
BEGIN
  SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

  v_astrophysics_level := COALESCE(v_astrophysics_level, 0);

  IF v_astrophysics_level < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Necesitas investigar Astrofisica para enviar expediciones'
    );
  END IF;

  v_max_expeditions := GREATEST(1, FLOOR(SQRT(v_astrophysics_level::numeric)));

  v_active_expeditions := get_active_expedition_count(p_user_id);

  IF v_active_expeditions >= v_max_expeditions THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Has alcanzado el maximo de expediciones simultaneas (%s). Investiga Astrofisica para desbloquear mas.', v_max_expeditions),
      'required_fee', 0,
      'current_balance', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'charged', false,
    'fee', 0,
    'expedition_number', v_active_expeditions + 1,
    'message', 'Expedicion gratuita'
  );
END;
$$;
