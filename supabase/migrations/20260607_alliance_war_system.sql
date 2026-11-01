-- =====================================================================
-- ⚔️ SISTEMA DE GUERRAS DE ALIANZAS
-- =====================================================================

-- =====================================================================
-- TABLES
-- =====================================================================

-- Main war table
CREATE TABLE IF NOT EXISTS alliance_wars (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  war_type text NOT NULL DEFAULT 'weekly' CHECK (war_type IN ('weekly','monthly','special')),
  entry_fee_fxu integer NOT NULL DEFAULT 5000 CHECK (entry_fee_fxu > 0),
  total_pool_fxu integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','active','completed','cancelled')),
  duration_hours integer NOT NULL DEFAULT 168,
  start_time timestamptz,
  end_time timestamptz,
  winner_alliance_id uuid,
  created_by uuid NOT NULL REFERENCES profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Alliances entered in a war
CREATE TABLE IF NOT EXISTS alliance_war_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES alliance_wars(id) ON DELETE CASCADE,
  alliance_id uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  leader_id uuid NOT NULL REFERENCES profiles(id),
  paid_fee integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (war_id, alliance_id)
);

-- Live scores per alliance per war
CREATE TABLE IF NOT EXISTS alliance_war_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES alliance_wars(id) ON DELETE CASCADE,
  alliance_id uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  total_score integer NOT NULL DEFAULT 0,
  battle_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (war_id, alliance_id)
);

-- Battle log
CREATE TABLE IF NOT EXISTS alliance_war_battle_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  war_id uuid NOT NULL REFERENCES alliance_wars(id) ON DELETE CASCADE,
  attacker_id uuid NOT NULL REFERENCES profiles(id),
  attacker_alliance_id uuid NOT NULL REFERENCES alliances(id),
  defender_alliance_id uuid NOT NULL REFERENCES alliances(id),
  resources_destroyed bigint NOT NULL DEFAULT 0 CHECK (resources_destroyed > 0),
  points integer NOT NULL DEFAULT 0,
  reported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Reserve pool for future events
CREATE TABLE IF NOT EXISTS alliance_war_reserve_pool (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  amount_fxu numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Permanent hall of fame
CREATE TABLE IF NOT EXISTS alliance_war_hall_of_fame (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  alliance_id uuid REFERENCES alliances(id) ON DELETE SET NULL,
  alliance_name text,
  alliance_tag text,
  total_wins integer NOT NULL DEFAULT 0,
  total_wars integer NOT NULL DEFAULT 0,
  total_fxu_won numeric NOT NULL DEFAULT 0,
  last_win_at timestamptz,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_aw_hof_wins ON alliance_war_hall_of_fame(total_wins DESC);
CREATE INDEX IF NOT EXISTS idx_aw_hof_fxu ON alliance_war_hall_of_fame(total_fxu_won DESC);

-- Insert reserve pool row if not exists
INSERT INTO alliance_war_reserve_pool (id, amount_fxu) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 0)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- 1. Admin creates a war
CREATE OR REPLACE FUNCTION create_alliance_war(
  p_title text,
  p_entry_fee_fxu integer,
  p_war_type text DEFAULT 'weekly',
  p_duration_hours integer DEFAULT 168
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_war_id uuid;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;

  IF p_entry_fee_fxu <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La tarifa debe ser mayor a 0');
  END IF;

  INSERT INTO alliance_wars (title, war_type, entry_fee_fxu, status, duration_hours, created_by)
  VALUES (p_title, p_war_type, p_entry_fee_fxu, 'open', p_duration_hours, v_admin_id)
  RETURNING id INTO v_war_id;

  RETURN jsonb_build_object('success', true, 'war_id', v_war_id, 'message', 'Guerra creada');
END;
$$;

-- 2. Alliance leader joins a war (pays entry fee)
CREATE OR REPLACE FUNCTION join_alliance_war(p_war_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_war alliance_wars%ROWTYPE;
  v_member alliance_members%ROWTYPE;
  v_alliance alliances%ROWTYPE;
  v_fxu numeric;
  v_admin_id uuid;
  v_admin_amount integer;
  v_pool_amount integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_war FROM alliance_wars WHERE id = p_war_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Guerra no encontrada');
  END IF;

  IF v_war.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La guerra no está abierta para inscripciones');
  END IF;

  -- Check user is leader of an alliance
  SELECT * INTO v_member FROM alliance_members WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No perteneces a ninguna alianza');
  END IF;

  IF v_member.rank_level < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo el líder de la alianza puede inscribirla');
  END IF;

  -- Check alliance not already enrolled
  IF EXISTS (SELECT 1 FROM alliance_war_entries WHERE war_id = p_war_id AND alliance_id = v_member.alliance_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu alianza ya está inscrita en esta guerra');
  END IF;

  SELECT * INTO v_alliance FROM alliances WHERE id = v_member.alliance_id;

  -- Check FXU balance
  SELECT COALESCE(fxu_balance, 0) INTO v_fxu FROM profiles WHERE id = v_user_id;
  IF v_fxu < v_war.entry_fee_fxu THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas ' || v_war.entry_fee_fxu || ' FXU, tienes ' || v_fxu || ' FXU');
  END IF;

  -- Charge leader's FXU
  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_war.entry_fee_fxu WHERE id = v_user_id;

  -- Split entry fee: 50% to pool, 25% admin, 25% reserve
  v_admin_amount := FLOOR(v_war.entry_fee_fxu * 0.50);  -- 50% to war pool
  v_pool_amount := v_war.entry_fee_fxu - v_admin_amount;  -- rest split admin/reserve later

  -- Add to war pool
  UPDATE alliance_wars SET total_pool_fxu = total_pool_fxu + v_war.entry_fee_fxu WHERE id = p_war_id;

  -- Register entry
  INSERT INTO alliance_war_entries (war_id, alliance_id, leader_id, paid_fee)
  VALUES (p_war_id, v_alliance.id, v_user_id, v_war.entry_fee_fxu);

  -- Initialize score at 0
  INSERT INTO alliance_war_scores (war_id, alliance_id, total_score, battle_count)
  VALUES (p_war_id, v_alliance.id, 0, 0)
  ON CONFLICT (war_id, alliance_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Alianza ' || v_alliance.name || ' inscrita en la guerra',
    'fee_paid', v_war.entry_fee_fxu,
    'total_pool', v_war.total_pool_fxu + v_war.entry_fee_fxu
  );
END;
$$;

-- 3. Admin starts the war (changes status to active, sets times)
CREATE OR REPLACE FUNCTION start_alliance_war(p_war_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_war alliance_wars%ROWTYPE;
  v_entry_count integer;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;

  SELECT * INTO v_war FROM alliance_wars WHERE id = p_war_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Guerra no encontrada');
  END IF;

  IF v_war.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La guerra no está en estado abierto');
  END IF;

  SELECT COUNT(*) INTO v_entry_count FROM alliance_war_entries WHERE war_id = p_war_id;
  IF v_entry_count < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Se necesitan al menos 2 alianzas para iniciar');
  END IF;

  UPDATE alliance_wars 
  SET status = 'active', 
      start_time = now(), 
      end_time = now() + (v_war.duration_hours || ' hours')::interval
  WHERE id = p_war_id;

  RETURN jsonb_build_object('success', true, 'message', '¡Guerra iniciada!', 'end_time', now() + (v_war.duration_hours || ' hours')::interval);
END;
$$;

-- 4. Alliance member reports battle damage
CREATE OR REPLACE FUNCTION report_war_battle(
  p_war_id uuid,
  p_enemy_alliance_id uuid,
  p_resources_destroyed bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_war alliance_wars%ROWTYPE;
  v_member alliance_members%ROWTYPE;
  v_points integer;
  v_enemy_entry boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_war FROM alliance_wars WHERE id = p_war_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Guerra no encontrada');
  END IF;

  IF v_war.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La guerra no está activa');
  END IF;

  IF p_resources_destroyed <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes reportar al menos 1 recurso destruido');
  END IF;

  -- Check user belongs to an alliance enrolled in this war
  SELECT * INTO v_member FROM alliance_members WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No perteneces a ninguna alianza');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM alliance_war_entries WHERE war_id = p_war_id AND alliance_id = v_member.alliance_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu alianza no está inscrita en esta guerra');
  END IF;

  -- Can't attack your own alliance
  IF v_member.alliance_id = p_enemy_alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar a tu propia alianza');
  END IF;

  -- Enemy must be enrolled in this war
  SELECT EXISTS (
    SELECT 1 FROM alliance_war_entries WHERE war_id = p_war_id AND alliance_id = p_enemy_alliance_id
  ) INTO v_enemy_entry;
  IF NOT v_enemy_entry THEN
    RETURN jsonb_build_object('success', false, 'error', 'La alianza enemiga no participa en esta guerra');
  END IF;

  -- Calculate points: 1 point per 1000 resources
  v_points := FLOOR(p_resources_destroyed / 1000)::integer;
  IF v_points < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mínimo 1,000 recursos para sumar 1 punto');
  END IF;

  -- Log the battle
  INSERT INTO alliance_war_battle_log (war_id, attacker_id, attacker_alliance_id, defender_alliance_id, resources_destroyed, points)
  VALUES (p_war_id, v_user_id, v_member.alliance_id, p_enemy_alliance_id, p_resources_destroyed, v_points);

  -- Update live score
  INSERT INTO alliance_war_scores (war_id, alliance_id, total_score, battle_count)
  VALUES (p_war_id, v_member.alliance_id, v_points, 1)
  ON CONFLICT (war_id, alliance_id)
  DO UPDATE SET 
    total_score = alliance_war_scores.total_score + v_points,
    battle_count = alliance_war_scores.battle_count + 1,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'points', v_points,
    'alliance_id', v_member.alliance_id,
    'enemy_alliance_id', p_enemy_alliance_id,
    'message', '¡Batalla reportada! +' || v_points || ' pts'
  );
END;
$$;

-- 5. Resolve war (auto or manual)
CREATE OR REPLACE FUNCTION resolve_alliance_war(p_war_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_war alliance_wars%ROWTYPE;
  v_winner record;
  v_member record;
  v_leader_fee integer;
  v_winner_share integer;
  v_admin_share integer;
  v_reserve_share integer;
  v_remainder integer;
  v_member_count integer;
  v_per_member integer;
  v_admin_id_oldest uuid;
  v_leader_id uuid;
  v_hof record;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores');
  END IF;

  SELECT * INTO v_war FROM alliance_wars WHERE id = p_war_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Guerra no encontrada');
  END IF;

  IF v_war.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'La guerra no está activa');
  END IF;

  -- Find winner (highest score, tiebreaker = most battles)
  SELECT aws.alliance_id, a.name as alliance_name, a.tag as alliance_tag, aws.total_score, aws.battle_count
  INTO v_winner
  FROM alliance_war_scores aws
  JOIN alliances a ON a.id = aws.alliance_id
  WHERE aws.war_id = p_war_id
  ORDER BY aws.total_score DESC, aws.battle_count DESC
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE alliance_wars SET status = 'cancelled', resolved_at = now() WHERE id = p_war_id;
    RETURN jsonb_build_object('success', false, 'error', 'Sin puntuaciones — guerra cancelada');
  END IF;

  -- Calculate payouts (pozo total)
  v_winner_share := FLOOR(v_war.total_pool_fxu * 0.70);  -- 70% winner
  v_admin_share := FLOOR(v_war.total_pool_fxu * 0.15);   -- 15% admin
  v_reserve_share := v_war.total_pool_fxu - v_winner_share - v_admin_share; -- 15% reserve

  -- Get entry fee paid by winner's leader
  SELECT COALESCE(paid_fee, 0) INTO v_leader_fee
  FROM alliance_war_entries
  WHERE war_id = p_war_id AND alliance_id = v_winner.alliance_id;

  -- Get winner's leader
  SELECT leader_id INTO v_leader_id FROM alliances WHERE id = v_winner.alliance_id;

  -- Leader recovers entry fee first
  IF v_leader_id IS NOT NULL AND v_leader_fee > 0 AND v_leader_fee <= v_winner_share THEN
    PERFORM _internal_set_fxu_context();
    UPDATE profiles SET fxu_balance = fxu_balance + v_leader_fee WHERE id = v_leader_id;
    v_remainder := v_winner_share - v_leader_fee;
  ELSE
    v_remainder := v_winner_share;
  END IF;

  -- Rest divided equally among all members
  SELECT COUNT(*) INTO v_member_count FROM alliance_members WHERE alliance_id = v_winner.alliance_id;
  IF v_member_count > 0 AND v_remainder > 0 THEN
    v_per_member := FLOOR(v_remainder / v_member_count);
    FOR v_member IN
      SELECT user_id FROM alliance_members WHERE alliance_id = v_winner.alliance_id
    LOOP
      UPDATE profiles SET fxu_balance = fxu_balance + v_per_member WHERE id = v_member.user_id;
    END LOOP;
  END IF;

  -- 15% to admin
  IF v_admin_share > 0 THEN
    SELECT id INTO v_admin_id_oldest FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id_oldest IS NOT NULL THEN
      PERFORM _internal_set_fxu_context();
      UPDATE profiles SET fxu_balance = fxu_balance + v_admin_share WHERE id = v_admin_id_oldest;
    END IF;
    PERFORM record_admin_revenue('alliance_war', v_admin_share, 'War admin share: ' || v_war.title, v_winner.alliance_id, NULL);
  END IF;

  -- 15% to reserve pool
  IF v_reserve_share > 0 THEN
    UPDATE alliance_war_reserve_pool SET amount_fxu = amount_fxu + v_reserve_share, updated_at = now()
    WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  -- Mark war as completed
  UPDATE alliance_wars 
  SET status = 'completed', 
      winner_alliance_id = v_winner.alliance_id, 
      resolved_at = now() 
  WHERE id = p_war_id;

  -- Update Hall of Fame
  SELECT * INTO v_hof FROM alliance_war_hall_of_fame WHERE alliance_id = v_winner.alliance_id;
  IF NOT FOUND THEN
    INSERT INTO alliance_war_hall_of_fame (alliance_id, alliance_name, alliance_tag, total_wins, total_wars, total_fxu_won, last_win_at)
    VALUES (v_winner.alliance_id, v_winner.alliance_name, v_winner.alliance_tag, 1, 1, v_winner_share, now());
  ELSE
    UPDATE alliance_war_hall_of_fame
    SET total_wins = total_wins + 1,
        total_wars = total_wars + 1,
        total_fxu_won = total_fxu_won + v_winner_share,
        last_win_at = now(),
        alliance_name = v_winner.alliance_name,
        alliance_tag = v_winner.alliance_tag
    WHERE alliance_id = v_winner.alliance_id;
  END IF;

  -- Update total_wars counter for losers
  UPDATE alliance_war_hall_of_fame SET total_wars = total_wars + 1
  FROM alliance_war_entries awe
  WHERE alliance_war_hall_of_fame.alliance_id = awe.alliance_id
    AND awe.war_id = p_war_id
    AND awe.alliance_id != v_winner.alliance_id;

  RETURN jsonb_build_object(
    'success', true,
    'winner_alliance', v_winner.alliance_name,
    'winner_score', v_winner.total_score,
    'winner_share', v_winner_share,
    'leader_refund', v_leader_fee,
    'per_member', v_per_member,
    'admin_share', v_admin_share,
    'reserve_share', v_reserve_share
  );
END;
$$;

-- 6. Get wars list (with auto-resolve)
CREATE OR REPLACE FUNCTION get_alliance_wars(p_filter text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war record;
  v_result jsonb;
BEGIN
  -- Auto-resolve any active wars past end_time
  FOR v_war IN
    SELECT id FROM alliance_wars WHERE status = 'active' AND end_time <= now()
  LOOP
    BEGIN
      -- We need auth.uid() context for resolve function
      -- Auto-resolve bypass: directly run the logic
      PERFORM auto_resolve_single_war(v_war.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Auto-resolve failed for war %: %', v_war.id, SQLERRM;
    END;
  END LOOP;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', aw.id,
      'title', aw.title,
      'war_type', aw.war_type,
      'entry_fee_fxu', aw.entry_fee_fxu,
      'total_pool_fxu', aw.total_pool_fxu,
      'status', aw.status,
      'start_time', aw.start_time,
      'end_time', aw.end_time,
      'winner_alliance_id', aw.winner_alliance_id,
      'entry_count', (SELECT COUNT(*) FROM alliance_war_entries awe WHERE awe.war_id = aw.id),
      'scores', (
        SELECT jsonb_agg(jsonb_build_object(
          'alliance_id', aws.alliance_id,
          'alliance_name', a.name,
          'alliance_tag', a.tag,
          'total_score', aws.total_score,
          'battle_count', aws.battle_count
        ) ORDER BY aws.total_score DESC)
        FROM alliance_war_scores aws
        JOIN alliances a ON a.id = aws.alliance_id
        WHERE aws.war_id = aw.id
      ),
      'created_at', aw.created_at,
      'resolved_at', aw.resolved_at
    ) ORDER BY aw.created_at DESC
  ) INTO v_result
  FROM alliance_wars aw
  WHERE CASE
    WHEN p_filter = 'active' THEN aw.status = 'active'
    WHEN p_filter = 'open' THEN aw.status = 'open'
    WHEN p_filter = 'completed' THEN aw.status = 'completed'
    ELSE true
  END;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Helper: auto-resolve a single war (no auth check)
CREATE OR REPLACE FUNCTION auto_resolve_single_war(p_war_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_war alliance_wars%ROWTYPE;
  v_winner record;
  v_member record;
  v_leader_fee integer;
  v_winner_share integer;
  v_admin_share integer;
  v_reserve_share integer;
  v_remainder integer;
  v_member_count integer;
  v_per_member integer;
  v_admin_id uuid;
  v_leader_id uuid;
  v_hof record;
BEGIN
  SELECT * INTO v_war FROM alliance_wars WHERE id = p_war_id AND status = 'active' AND end_time <= now();
  IF NOT FOUND THEN RETURN; END IF;

  SELECT aws.alliance_id, a.name as alliance_name, a.tag as alliance_tag, aws.total_score, aws.battle_count
  INTO v_winner
  FROM alliance_war_scores aws
  JOIN alliances a ON a.id = aws.alliance_id
  WHERE aws.war_id = p_war_id
  ORDER BY aws.total_score DESC, aws.battle_count DESC
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE alliance_wars SET status = 'cancelled', resolved_at = now() WHERE id = p_war_id;
    RETURN;
  END IF;

  v_winner_share := FLOOR(v_war.total_pool_fxu * 0.70);
  v_admin_share := FLOOR(v_war.total_pool_fxu * 0.15);
  v_reserve_share := v_war.total_pool_fxu - v_winner_share - v_admin_share;

  SELECT COALESCE(paid_fee, 0) INTO v_leader_fee
  FROM alliance_war_entries WHERE war_id = p_war_id AND alliance_id = v_winner.alliance_id;

  SELECT leader_id INTO v_leader_id FROM alliances WHERE id = v_winner.alliance_id;

  IF v_leader_id IS NOT NULL AND v_leader_fee > 0 AND v_leader_fee <= v_winner_share THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_leader_fee WHERE id = v_leader_id;
    v_remainder := v_winner_share - v_leader_fee;
  ELSE
    v_remainder := v_winner_share;
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM alliance_members WHERE alliance_id = v_winner.alliance_id;
  IF v_member_count > 0 AND v_remainder > 0 THEN
    v_per_member := FLOOR(v_remainder / v_member_count);
    FOR v_member IN SELECT user_id FROM alliance_members WHERE alliance_id = v_winner.alliance_id LOOP
      UPDATE profiles SET fxu_balance = fxu_balance + v_per_member WHERE id = v_member.user_id;
    END LOOP;
  END IF;

  IF v_admin_share > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_admin_share WHERE id = v_admin_id;
    END IF;
    PERFORM record_admin_revenue('alliance_war', v_admin_share, 'War auto-resolve: ' || v_war.title, v_winner.alliance_id, NULL);
  END IF;

  IF v_reserve_share > 0 THEN
    UPDATE alliance_war_reserve_pool SET amount_fxu = amount_fxu + v_reserve_share, updated_at = now()
    WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  UPDATE alliance_wars SET status = 'completed', winner_alliance_id = v_winner.alliance_id, resolved_at = now() WHERE id = p_war_id;

  SELECT * INTO v_hof FROM alliance_war_hall_of_fame WHERE alliance_id = v_winner.alliance_id;
  IF NOT FOUND THEN
    INSERT INTO alliance_war_hall_of_fame (alliance_id, alliance_name, alliance_tag, total_wins, total_wars, total_fxu_won, last_win_at)
    VALUES (v_winner.alliance_id, v_winner.alliance_name, v_winner.alliance_tag, 1, 1, v_winner_share, now());
  ELSE
    UPDATE alliance_war_hall_of_fame
    SET total_wins = total_wins + 1, total_wars = total_wars + 1, total_fxu_won = total_fxu_won + v_winner_share,
        last_win_at = now(), alliance_name = v_winner.alliance_name, alliance_tag = v_winner.alliance_tag
    WHERE alliance_id = v_winner.alliance_id;
  END IF;

  UPDATE alliance_war_hall_of_fame SET total_wars = total_wars + 1
  FROM alliance_war_entries awe
  WHERE alliance_war_hall_of_fame.alliance_id = awe.alliance_id AND awe.war_id = p_war_id AND awe.alliance_id != v_winner.alliance_id;
END;
$$;

-- 7. Get war hall of fame
CREATE OR REPLACE FUNCTION get_war_hall_of_fame()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'rank', ROW_NUMBER() OVER (ORDER BY total_wins DESC, total_fxu_won DESC),
      'alliance_name', alliance_name,
      'alliance_tag', alliance_tag,
      'total_wins', total_wins,
      'total_wars', total_wars,
      'total_fxu_won', total_fxu_won,
      'last_win_at', last_win_at
    )
  ) INTO v_result
  FROM alliance_war_hall_of_fame
  ORDER BY total_wins DESC, total_fxu_won DESC
  LIMIT 50;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- =====================================================================
-- RLS POLICIES
-- =====================================================================

ALTER TABLE alliance_wars ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_war_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_war_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_war_battle_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_war_reserve_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_war_hall_of_fame ENABLE ROW LEVEL SECURITY;

-- Wars: anyone can view
CREATE POLICY "Anyone can view alliance wars" ON alliance_wars FOR SELECT USING (true);

-- Entries: anyone can view
CREATE POLICY "Anyone can view war entries" ON alliance_war_entries FOR SELECT USING (true);

-- Scores: anyone can view
CREATE POLICY "Anyone can view war scores" ON alliance_war_scores FOR SELECT USING (true);

-- Battle log: anyone can view
CREATE POLICY "Anyone can view war battle log" ON alliance_war_battle_log FOR SELECT USING (true);

-- Reserve pool: anyone can view
CREATE POLICY "Anyone can view reserve pool" ON alliance_war_reserve_pool FOR SELECT USING (true);

-- Hall of fame: anyone can view
CREATE POLICY "Anyone can view war hall of fame" ON alliance_war_hall_of_fame FOR SELECT USING (true);

-- =====================================================================
-- CRON JOB: Check for auto-resolve every hour
-- =====================================================================
