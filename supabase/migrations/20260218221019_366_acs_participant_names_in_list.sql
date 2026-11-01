/*
  # Show ACS participant names in available attacks list

  1. Changes
    - Updated `get_available_acs_attacks` function to include an array of participant usernames
    - Joins `acs_participants` with `profiles` to get the names of all users who joined each ACS

  2. Notes
    - The creator is always shown separately, participants list only includes those who joined via acs_participants
*/

CREATE OR REPLACE FUNCTION get_available_acs_attacks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      'already_joined', EXISTS(SELECT 1 FROM acs_participants ap2 WHERE ap2.acs_id = af.id AND ap2.user_id = v_user_id),
      'participant_names', COALESCE(
        (SELECT jsonb_agg(pp.username ORDER BY ap3.joined_at)
         FROM acs_participants ap3
         JOIN profiles pp ON ap3.user_id = pp.id
         WHERE ap3.acs_id = af.id),
        '[]'::jsonb
      )
    ) AS row_data
    FROM acs_fleets af
    JOIN profiles pr ON af.creator_id = pr.id
    WHERE af.alliance_id = v_user_alliance_id
    AND af.is_active = true
    AND af.status = 'waiting'
    AND af.arrival_time > NOW()
  ) sub;

  RETURN v_acs_list;
END;
$$;
