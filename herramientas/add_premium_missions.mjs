import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Add cost_fxu column
await c.query("ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS cost_fxu numeric NOT NULL DEFAULT 0");
await c.query("ALTER TABLE daily_missions DROP CONSTRAINT IF EXISTS daily_missions_mission_type_check");
await c.query("ALTER TABLE daily_missions ADD CONSTRAINT daily_missions_mission_type_check CHECK (mission_type IN ('attack','spy','expedition','build','research','collect_metal','collect_crystal','collect_deuterium','premium'))");

// Insert premium missions
await c.query(`
  INSERT INTO daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, cost_fxu)
  VALUES
    ('premium_prod_15_24h', 'premium', 1, 'production_bonus', 15, 24, 'Impulso Minero', '+15% produccion 24h', 'TrendingUp', 300),
    ('premium_speed_15_24h', 'premium', 1, 'speed_bonus', 15, 24, 'Turbo Construccion', '+15% velocidad 24h', 'Zap', 300),
    ('premium_prod_20_48h', 'premium', 1, 'production_bonus', 20, 48, 'Fiebre del Oro', '+20% produccion 48h', 'TrendingUp', 600),
    ('premium_speed_20_48h', 'premium', 1, 'speed_bonus', 20, 48, 'Aceleracion Tech', '+20% velocidad 48h', 'Zap', 600),
    ('premium_prod_25_72h', 'premium', 1, 'production_bonus', 25, 72, 'Magnate Industrial', '+25% produccion 72h', 'TrendingUp', 1500),
    ('premium_speed_25_72h', 'premium', 1, 'speed_bonus', 25, 72, 'Velocidad Luz', '+25% velocidad 72h', 'Zap', 1500),
    ('premium_prod_30_72h', 'premium', 1, 'production_bonus', 30, 72, 'Titan Galactico', '+30% produccion 72h', 'Crown', 3000),
    ('premium_speed_30_72h', 'premium', 1, 'speed_bonus', 30, 72, 'Dominio Total', '+30% velocidad 72h', 'Crown', 3000)
  ON CONFLICT (code) DO NOTHING
`);

console.log('Columnas y misiones premium insertadas');

// Create purchase function
await c.query(`
  CREATE OR REPLACE FUNCTION purchase_daily_mission_bonus(p_user_id uuid, p_mission_id integer)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_mission record;
    v_fxu_balance numeric;
    v_bonus_id uuid;
  BEGIN
    SELECT * INTO v_mission
    FROM daily_missions
    WHERE id = p_mission_id AND mission_type = 'premium' AND is_active = true;

    IF v_mission IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Mision premium no encontrada');
    END IF;

    SELECT fxu_balance INTO v_fxu_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_fxu_balance < v_mission.cost_fxu THEN
      RETURN jsonb_build_object('success', false, 'error', 'FXU insuficientes. Necesitas ' || v_mission.cost_fxu || ' FXU');
    END IF;

    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    UPDATE profiles SET fxu_balance = fxu_balance - v_mission.cost_fxu WHERE id = p_user_id;

    INSERT INTO user_active_bonuses (user_id, mission_id, bonus_type, bonus_value, expires_at)
    VALUES (p_user_id, p_mission_id, v_mission.reward_type, v_mission.reward_value, now() + (v_mission.reward_duration_hours || ' hours')::interval)
    RETURNING id INTO v_bonus_id;

    RETURN jsonb_build_object(
      'success', true,
      'bonus_type', v_mission.reward_type,
      'bonus_value', v_mission.reward_value,
      'expires_at', now() + (v_mission.reward_duration_hours || ' hours')::interval,
      'cost_fxu', v_mission.cost_fxu
    );
  END;
  $$;

  GRANT EXECUTE ON FUNCTION purchase_daily_mission_bonus(uuid, integer) TO authenticated;
`);
console.log('purchase_daily_mission_bonus creada');

// Update get_user_daily_missions to include premium missions
await c.query(`
  CREATE OR REPLACE FUNCTION get_user_daily_missions(p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_result jsonb;
  BEGIN
    PERFORM assign_daily_missions(p_user_id);

    -- Free missions (assigned)
    SELECT jsonb_agg(jsonb_build_object(
      'id', udm.id,
      'mission_id', dm.id,
      'code', dm.code,
      'title', dm.title_es,
      'description', dm.desc_es,
      'mission_type', dm.mission_type,
      'target_count', dm.target_count,
      'progress', udm.progress,
      'completed', udm.completed,
      'claimed', udm.claimed,
      'reward_type', dm.reward_type,
      'reward_value', dm.reward_value,
      'reward_duration_hours', dm.reward_duration_hours,
      'icon', dm.icon,
      'expires_at', udm.expires_at,
      'cost_fxu', dm.cost_fxu,
      'is_premium', false
    ) ORDER BY udm.completed ASC, udm.claimed ASC, dm.id)
    INTO v_result
    FROM user_daily_missions udm
    JOIN daily_missions dm ON dm.id = udm.mission_id
    WHERE udm.user_id = p_user_id AND udm.expires_at > now();

    RETURN COALESCE(v_result, '[]'::jsonb);
  END;
  $$;

  GRANT EXECUTE ON FUNCTION get_user_daily_missions(uuid) TO authenticated;
`);
console.log('get_user_daily_missions actualizada');

// Create get_premium_missions function
await c.query(`
  CREATE OR REPLACE FUNCTION get_premium_missions()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_result jsonb;
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'id', dm.id,
      'code', dm.code,
      'title', dm.title_es,
      'description', dm.desc_es,
      'mission_type', dm.mission_type,
      'reward_type', dm.reward_type,
      'reward_value', dm.reward_value,
      'reward_duration_hours', dm.reward_duration_hours,
      'icon', dm.icon,
      'cost_fxu', dm.cost_fxu,
      'is_premium', true
    ) ORDER BY dm.cost_fxu ASC, dm.id)
    INTO v_result
    FROM daily_missions dm
    WHERE dm.mission_type = 'premium' AND dm.is_active = true;

    RETURN COALESCE(v_result, '[]'::jsonb);
  END;
  $$;

  GRANT EXECUTE ON FUNCTION get_premium_missions() TO authenticated;
`);
console.log('get_premium_missions creada');

// RPC to get user's active bonuses with expiry
await c.query(`
  CREATE OR REPLACE FUNCTION get_user_active_bonuses(p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_result jsonb;
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'id', uab.id,
      'bonus_type', uab.bonus_type,
      'bonus_value', uab.bonus_value,
      'expires_at', uab.expires_at,
      'title', dm.title_es,
      'icon', dm.icon
    ) ORDER BY uab.expires_at ASC)
    INTO v_result
    FROM user_active_bonuses uab
    LEFT JOIN daily_missions dm ON dm.id = uab.mission_id
    WHERE uab.user_id = p_user_id AND uab.expires_at > now();

    RETURN COALESCE(v_result, '[]'::jsonb);
  END;
  $$;
  GRANT EXECUTE ON FUNCTION get_user_active_bonuses(uuid) TO authenticated;
`);
console.log('get_user_active_bonuses creada');

// Verify
const missions = await c.query("SELECT id, code, cost_fxu, reward_type, reward_value, reward_duration_hours FROM daily_missions WHERE mission_type = 'premium' ORDER BY id");
console.log(`\nMisiones premium (${missions.rows.length}):`);
missions.rows.forEach(m => console.log(`  ${m.code}: ${m.cost_fxu} FXU → ${m.reward_type} +${m.reward_value}% ${m.reward_duration_hours}h`));

await c.end();
