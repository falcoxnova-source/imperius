/*
  # Get ACS participant details with ship composition

  1. New Function
    - `get_acs_participant_details(p_acs_id uuid)`: Returns detailed info about each participant in an ACS
      - Participant username
      - Ships they contributed (name, code, quantity, image)
      - Only accessible by members of the same alliance

  2. Security
    - Validates user is authenticated
    - Validates user belongs to the same alliance as the ACS
*/

CREATE OR REPLACE FUNCTION get_acs_participant_details(p_acs_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_user_alliance_id uuid;
  v_acs_alliance_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT am.alliance_id INTO v_user_alliance_id
  FROM alliance_members am
  WHERE am.user_id = v_user_id;

  SELECT af.alliance_id INTO v_acs_alliance_id
  FROM acs_fleets af
  WHERE af.id = p_acs_id;

  IF v_acs_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACS no encontrado');
  END IF;

  IF v_user_alliance_id IS DISTINCT FROM v_acs_alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No perteneces a esta alianza');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'participants', COALESCE(jsonb_agg(
      jsonb_build_object(
        'username', sub.username,
        'user_id', sub.user_id,
        'is_creator', sub.is_creator,
        'ships', sub.ships
      ) ORDER BY sub.joined_at
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      pr.username,
      ap.user_id,
      ap.joined_at,
      (ap.user_id = (SELECT creator_id FROM acs_fleets WHERE id = p_acs_id)) AS is_creator,
      COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'name', st.name,
            'code', st.code,
            'quantity', fs.quantity,
            'image_url', st.image_url
          ) ORDER BY st.name
        )
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = ap.fleet_id),
        '[]'::jsonb
      ) AS ships
    FROM acs_participants ap
    JOIN profiles pr ON ap.user_id = pr.id
    WHERE ap.acs_id = p_acs_id
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object('success', true, 'participants', '[]'::jsonb));
END;
$$;
