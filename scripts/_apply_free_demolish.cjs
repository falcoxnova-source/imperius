const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();

  await c.query(`UPDATE game_settings SET value = '0' WHERE key IN ('fxu_abandon_colony_fee','fxu_demolish_fee')`);
  await c.query(`INSERT INTO game_settings (key, value, description) SELECT 'fxu_abandon_colony_fee','0','FXU charged for abandoning a colony' WHERE NOT EXISTS (SELECT 1 FROM game_settings WHERE key='fxu_abandon_colony_fee')`);
  await c.query(`INSERT INTO game_settings (key, value, description) SELECT 'fxu_demolish_fee','0','FXU charged for demolishing a building' WHERE NOT EXISTS (SELECT 1 FROM game_settings WHERE key='fxu_demolish_fee')`);

  const abandonFn = `CREATE OR REPLACE FUNCTION public.secure_abandon_colony(p_planet_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user_id uuid; v_planet record; v_homeworld_id uuid;
  v_active_builds integer; v_active_shipyard integer; v_active_research integer;
  v_active_fleets integer; v_incoming_fleets integer;
  v_fxu_fee numeric; v_user_fxu numeric; v_admin_id uuid; v_is_plus boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF is_user_in_vacation_mode(v_user_id) THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while in vacation mode'); END IF;
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND owner_id = v_user_id;
  IF v_planet IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not yours'); END IF;
  SELECT homeworld_id INTO v_homeworld_id FROM profiles WHERE id = v_user_id;
  IF v_planet.id = v_homeworld_id THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon your homeworld'); END IF;
  SELECT COUNT(*) INTO v_active_builds FROM building_queue WHERE planet_id = p_planet_id AND status IN ('in_progress','pending');
  IF v_active_builds > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active building construction. Cancel it first.'); END IF;
  SELECT COUNT(*) INTO v_active_shipyard FROM shipyard_queue WHERE planet_id = p_planet_id AND status IN ('in_progress','pending');
  IF v_active_shipyard > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active shipyard production. Cancel it first.'); END IF;
  SELECT COUNT(*) INTO v_active_research FROM research_queue WHERE user_id = v_user_id AND status IN ('in_progress','pending');
  IF v_active_research > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active research. Cancel research first.'); END IF;
  SELECT COUNT(*) INTO v_active_fleets FROM fleets WHERE user_id = v_user_id AND source_planet_id = p_planet_id AND status IN ('traveling','returning');
  IF v_active_fleets > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active fleets. Recall all fleets first.'); END IF;
  SELECT COUNT(*) INTO v_incoming_fleets FROM fleets WHERE destination_planet_id = p_planet_id AND status = 'traveling';
  IF v_incoming_fleets > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while fleets are heading to it. Wait until they arrive.'); END IF;

  SELECT COALESCE(value::numeric, 0) INTO v_fxu_fee FROM game_settings WHERE key = 'fxu_abandon_colony_fee';
  IF v_fxu_fee IS NULL THEN v_fxu_fee := 0; END IF;
  v_is_plus := is_user_plus(auth.uid());
  IF v_is_plus AND v_fxu_fee > 0 THEN v_fxu_fee := v_fxu_fee * 0.50; END IF;

  IF v_fxu_fee > 0 THEN
    SELECT COALESCE(fxu_balance,0) INTO v_user_fxu FROM profiles WHERE id = auth.uid();
    IF v_user_fxu < v_fxu_fee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU. Required: ' || v_fxu_fee::text || ', Available: ' || v_user_fxu::text);
    END IF;
    PERFORM _internal_set_fxu_context();
    UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = v_user_id;
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
      UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id;
    END IF;
    PERFORM record_admin_revenue('colony_abandon', v_fxu_fee, 'Abandon colony: ' || v_planet.name, v_user_id, p_planet_id);
  END IF;

  DELETE FROM planet_buildings WHERE planet_id = p_planet_id;
  DELETE FROM planet_defenses WHERE planet_id = p_planet_id;
  DELETE FROM planet_ships WHERE planet_id = p_planet_id;

  UPDATE planets SET owner_id = NULL, name = 'Abandoned Colony', metal = 500, crystal = 500, deuterium = 0,
    solar_energy = 0, used_energy = 0, max_fields = 163, used_fields = 0,
    metal_per_hour = 0, crystal_per_hour = 0, deuterium_per_hour = 0,
    is_homeworld = false, last_resource_update = now(), image = 'abandoned'
  WHERE id = p_planet_id;
  PERFORM update_user_points(v_user_id);
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_fee);
END;
$function$`;

  const demolishFn = `CREATE OR REPLACE FUNCTION public.secure_demolish_building(p_planet_id uuid, p_building_type_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_planet planets%ROWTYPE; v_building planet_buildings%ROWTYPE; v_building_type building_types%ROWTYPE;
  v_queue_count integer; v_current_level integer;
  v_refund_metal bigint; v_refund_crystal bigint; v_refund_deuterium bigint;
  v_fields_decrease integer := 0; v_fxu_fee numeric; v_user_fxu numeric; v_admin_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF is_user_in_vacation_mode(auth.uid()) THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while in vacation mode'); END IF;

  SELECT COALESCE(value::numeric, 0) INTO v_fxu_fee FROM game_settings WHERE key = 'fxu_demolish_fee';
  IF v_fxu_fee IS NULL THEN v_fxu_fee := 0; END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned'); END IF;
  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Building type not found'); END IF;
  SELECT * INTO v_building FROM planet_buildings WHERE planet_id = p_planet_id AND building_type_id = p_building_type_id;
  IF NOT FOUND OR COALESCE(v_building.level,0) <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Building not found or already at level 0'); END IF;
  v_current_level := v_building.level;
  SELECT COUNT(*) INTO v_queue_count FROM building_queue WHERE planet_id = p_planet_id;
  IF v_queue_count > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while construction queue is active'); END IF;
  IF v_building.is_upgrading THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot demolish while building is upgrading'); END IF;

  IF v_fxu_fee > 0 THEN
    SELECT COALESCE(fxu_balance,0) INTO v_user_fxu FROM profiles WHERE id = auth.uid();
    IF v_user_fxu < v_fxu_fee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU. Required: ' || v_fxu_fee::text || ', Available: ' || v_user_fxu::text);
    END IF;
    PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);
    UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = auth.uid();
    v_admin_id := get_admin_account_id();
    IF v_admin_id IS NOT NULL THEN UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id; END IF;
  END IF;

  v_refund_metal := FLOOR(v_building_type.base_metal * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);
  v_refund_crystal := FLOOR(v_building_type.base_crystal * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);
  v_refund_deuterium := FLOOR(v_building_type.base_deuterium * POWER(v_building_type.cost_factor, v_current_level - 1) * 0.5);

  UPDATE planet_buildings SET level = v_current_level - 1 WHERE id = v_building.id;
  UPDATE planet_resources SET metal = metal + v_refund_metal, crystal = crystal + v_refund_crystal,
    deuterium = deuterium + v_refund_deuterium, last_update = now() WHERE planet_id = p_planet_id;

  IF v_building_type.code = 'lunar_base' THEN
    v_fields_decrease := 3;
    UPDATE planets SET fields_used = GREATEST(0, fields_used - 1), fields_max = GREATEST(1, fields_max - v_fields_decrease) WHERE id = p_planet_id;
  ELSIF v_building_type.code = 'terraformer' THEN
    v_fields_decrease := terraformer_field_bonus(v_current_level) - terraformer_field_bonus(v_current_level - 1);
    UPDATE planets SET fields_used = GREATEST(0, fields_used - 1), fields_max = GREATEST(1, fields_max - v_fields_decrease) WHERE id = p_planet_id;
  ELSE
    UPDATE planets SET fields_used = GREATEST(0, fields_used - 1) WHERE id = p_planet_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_level', v_current_level - 1,
    'refund_metal', v_refund_metal, 'refund_crystal', v_refund_crystal,
    'refund_deuterium', v_refund_deuterium, 'fxu_charged', v_fxu_fee);
END;
$function$`;

  await c.query(abandonFn);
  await c.query(demolishFn);
  console.log('Functions updated.');
  const r = await c.query(`SELECT key, value FROM game_settings WHERE key IN ('fxu_abandon_colony_fee','fxu_demolish_fee')`);
  console.log('Settings:', r.rows);
  await c.end();
})().catch(e=>{console.error(e.message); process.exit(1);});
