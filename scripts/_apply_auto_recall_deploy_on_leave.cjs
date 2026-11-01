const { Client } = require('pg');

const SQL = `
CREATE OR REPLACE FUNCTION _recall_user_deploys_from_alliance(
  p_user_id uuid,
  p_alliance_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_now timestamptz := now();
  v_count integer := 0;
BEGIN
  WITH recalled AS (
    UPDATE fleets f
    SET is_returning = true,
        arrival_time = v_now,
        return_time = v_now + GREATEST(
          EXTRACT(EPOCH FROM (f.arrival_time - f.departure_time)),
          10
        ) * interval '1 second'
    FROM planets p
    JOIN alliance_members am ON am.user_id = p.user_id
    WHERE f.user_id = p_user_id
      AND f.mission_type = 'deploy'
      AND f.is_completed = false
      AND f.is_returning = false
      AND f.arrival_time <= v_now
      AND f.target_galaxy = p.galaxy
      AND f.target_system = p.solar_system
      AND f.target_position = p.position
      AND p.user_id <> p_user_id
      AND am.alliance_id = p_alliance_id
    RETURNING f.id
  )
  SELECT COUNT(*) INTO v_count FROM recalled;

  RETURN v_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION _recall_user_deploys_from_alliance(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION leave_alliance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_membership record;
  v_member_count int;
  v_recalled int := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT am.*, a.leader_id, a.id as alliance_id, a.name as alliance_name
  INTO v_membership
  FROM alliance_members am
  JOIN alliances a ON am.alliance_id = a.id
  WHERE am.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No estas en una alianza');
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM alliance_members
  WHERE alliance_id = v_membership.alliance_id;

  IF v_membership.leader_id = v_user_id THEN
    IF v_member_count > 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Debes transferir el liderazgo antes de salir');
    END IF;
  END IF;

  v_recalled := _recall_user_deploys_from_alliance(v_user_id, v_membership.alliance_id);

  DELETE FROM alliance_members WHERE user_id = v_user_id AND alliance_id = v_membership.alliance_id;

  DELETE FROM alliance_applications
  WHERE user_id = v_user_id AND alliance_id = v_membership.alliance_id;

  IF v_member_count = 1 THEN
    DELETE FROM alliance_applications WHERE alliance_id = v_membership.alliance_id;
    DELETE FROM alliance_diplomacy WHERE alliance_id = v_membership.alliance_id OR target_alliance_id = v_membership.alliance_id;
    DELETE FROM alliances WHERE id = v_membership.alliance_id;

    RETURN jsonb_build_object('success', true, 'message', 'Alianza disuelta', 'fleets_recalled', v_recalled);
  ELSE
    UPDATE alliances
    SET member_count = member_count - 1
    WHERE id = v_membership.alliance_id;

    RETURN jsonb_build_object('success', true, 'message', 'Has salido de la alianza', 'fleets_recalled', v_recalled);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION kick_alliance_member(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_membership record;
  v_target_membership record;
  v_alliance record;
  v_is_leader boolean;
  v_recalled int := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_user_membership
  FROM alliance_members
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No estas en una alianza');
  END IF;

  IF NOT COALESCE(v_user_membership.can_kick, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permiso para expulsar miembros');
  END IF;

  SELECT * INTO v_target_membership
  FROM alliance_members
  WHERE id = p_member_id AND alliance_id = v_user_membership.alliance_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Miembro no encontrado');
  END IF;

  IF v_target_membership.user_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsarte a ti mismo');
  END IF;

  SELECT * INTO v_alliance
  FROM alliances
  WHERE id = v_user_membership.alliance_id;

  v_is_leader := (v_user_id = v_alliance.leader_id);

  IF v_target_membership.user_id = v_alliance.leader_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsar al lider');
  END IF;

  IF NOT v_is_leader AND v_target_membership.rank_level >= v_user_membership.rank_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes expulsar a alguien de mayor o igual rango');
  END IF;

  v_recalled := _recall_user_deploys_from_alliance(v_target_membership.user_id, v_user_membership.alliance_id);

  DELETE FROM alliance_members WHERE id = p_member_id;

  DELETE FROM alliance_applications
  WHERE user_id = v_target_membership.user_id AND alliance_id = v_user_membership.alliance_id;

  UPDATE alliances
  SET member_count = member_count - 1
  WHERE id = v_user_membership.alliance_id;

  INSERT INTO messages (recipient_id, subject, body, message_type)
  VALUES (
    v_target_membership.user_id,
    'Has sido expulsado de ' || v_alliance.name,
    'Has sido expulsado de la alianza [' || v_alliance.tag || '] ' || v_alliance.name || '.',
    'alliance'
  );

  RETURN jsonb_build_object('success', true, 'message', 'Miembro expulsado', 'fleets_recalled', v_recalled);
END;
$$;
`;

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  await c.query(SQL);
  console.log('Auto-recall on alliance leave/kick installed.');
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
