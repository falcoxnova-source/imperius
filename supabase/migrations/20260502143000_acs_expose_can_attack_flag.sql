-- =====================================================================
-- FIX: ACS no debe permitir unirse cuando hay proteccion de novato
-- entre el atacante (que se quiere unir) y el objetivo del ACS.
--
-- Problema reportado:
--   - Un aliado pequeño (que SI puede atacar a un novato) crea ACS.
--   - Un jugador grande podria intentar unirse y de ahi atacar al novato.
--   - O al reves: un novato podria unirse a un ACS que va contra un
--     enemigo mucho mas fuerte que el.
--
-- Estado actual:
--   - join_acs_with_fleet y join_acs_attack YA llaman check_noob_protection
--     y bloquean correctamente.
--   - PERO get_available_acs_attacks no expone esa info, asi que el
--     boton de "Unirse" se ve activo y el jugador solo se entera del
--     bloqueo despues de intentar.
--
-- Fix:
--   - Añadir can_attack, can_attack_reason, target_owner_username y
--     target_owner_points al payload de get_available_acs_attacks
--     para que el frontend pueda deshabilitar el boton y mostrar
--     una alerta clara antes del intento.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_available_acs_attacks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_alliance_id uuid;
  v_user_id uuid;
  v_acs_list jsonb;
BEGIN
  v_user_id := auth.uid();

  SELECT am.alliance_id INTO v_user_alliance_id
  FROM alliance_members am
  WHERE am.user_id = v_user_id;

  IF v_user_alliance_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'arrival_time')), '[]'::jsonb)
  INTO v_acs_list
  FROM (
    SELECT jsonb_build_object(
      'acs_id', af.id,
      'name', af.name,
      'creator_username', pr.username,
      'creator_id', af.creator_id,
      'target_coords', format('[%s:%s:%s]', af.target_galaxy, af.target_system, af.target_position),
      'target_galaxy', af.target_galaxy,
      'target_system', af.target_system,
      'target_position', af.target_position,
      'arrival_time', af.arrival_time,
      'current_participants', COALESCE(af.current_participants, 1),
      'max_participants', af.max_fleets,
      'is_creator', (af.creator_id = v_user_id),
      'already_joined', EXISTS(
        SELECT 1 FROM acs_participants ap2
        WHERE ap2.acs_id = af.id AND ap2.user_id = v_user_id
      ),
      'participant_names', COALESCE(
        (SELECT jsonb_agg(pp.username ORDER BY ap3.joined_at)
         FROM acs_participants ap3
         JOIN profiles pp ON ap3.user_id = pp.id
         WHERE ap3.acs_id = af.id),
        '[]'::jsonb
      ),
      'target_owner_username', tgt.username,
      'target_owner_points', tgt.points_total,
      'can_attack', COALESCE(prot.can_attack, true),
      'can_attack_reason', prot.reason
    ) AS row_data
    FROM acs_fleets af
    JOIN profiles pr ON af.creator_id = pr.id
    -- Resolver dueño del planeta objetivo (si existe)
    LEFT JOIN LATERAL (
      SELECT p.user_id, pf.username, pf.points_total
      FROM planets p
      LEFT JOIN profiles pf ON pf.id = p.user_id
      WHERE p.galaxy = af.target_galaxy
        AND p.solar_system = af.target_system
        AND p.position = af.target_position
        AND NOT p.is_destroyed
      LIMIT 1
    ) tgt ON true
    -- Verificar proteccion contra el dueño del objetivo (si lo hay)
    LEFT JOIN LATERAL (
      SELECT
        (chk->>'can_attack')::boolean AS can_attack,
        chk->>'reason' AS reason
      FROM (
        SELECT CASE
          WHEN tgt.user_id IS NULL OR tgt.user_id = v_user_id THEN
            jsonb_build_object('can_attack', true, 'reason', NULL)
          ELSE
            check_noob_protection(v_user_id, tgt.user_id)
        END AS chk
      ) inner_chk
    ) prot ON true
    WHERE af.alliance_id = v_user_alliance_id
      AND af.is_active = true
      AND af.status = 'waiting'
      AND af.arrival_time > NOW()
  ) sub;

  RETURN v_acs_list;
END;
$function$;
