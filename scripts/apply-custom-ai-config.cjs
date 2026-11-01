const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('Connected');

  // 1. Create ai_planet_custom_orders table
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_planet_custom_orders (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      planet_id uuid NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      buildings jsonb NOT NULL DEFAULT '{}'::jsonb,
      ships jsonb NOT NULL DEFAULT '{}'::jsonb,
      defenses jsonb NOT NULL DEFAULT '{}'::jsonb,
      research jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(planet_id)
    );
  `);
  console.log('✅ Table ai_planet_custom_orders created');

  // 2. Add 'custom' to autopilot_role enum if not already
  // The autopilot_role is a text column, so we just need to handle it in the UI/backend
  // Check current constraint
  const constraintCheck = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'planets'::regclass
    AND conname LIKE '%autopilot_role%'
  `);
  
  if (constraintCheck.rows.length > 0) {
    for (const row of constraintCheck.rows) {
      console.log('Found constraint:', row.conname, row.def);
      if (!row.def.includes('custom')) {
        await client.query(`ALTER TABLE planets DROP CONSTRAINT "${row.conname}"`);
        await client.query(`ALTER TABLE planets ADD CONSTRAINT "${row.conname}" CHECK (autopilot_role IN ('balanced', 'miner', 'military', 'research', 'colonizer', 'custom'))`);
        console.log('✅ Updated constraint to include custom');
      } else {
        console.log('✅ Constraint already includes custom');
      }
    }
  } else {
    console.log('No constraint on autopilot_role (text column, no check needed)');
  }

  // 3. RLS for ai_planet_custom_orders
  await client.query(`ALTER TABLE ai_planet_custom_orders ENABLE ROW LEVEL SECURITY`);
  
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_planet_custom_orders' AND policyname = 'Users can manage own orders') THEN
        CREATE POLICY "Users can manage own orders" ON ai_planet_custom_orders
          FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      END IF;
    END $$;
  `);
  console.log('✅ RLS enabled');

  // 4. RPC to save custom orders
  await client.query(`
    CREATE OR REPLACE FUNCTION save_ai_custom_orders(
      p_planet_id uuid,
      p_buildings jsonb DEFAULT '{}'::jsonb,
      p_ships jsonb DEFAULT '{}'::jsonb,
      p_defenses jsonb DEFAULT '{}'::jsonb,
      p_research jsonb DEFAULT '{}'::jsonb
    ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_user_id uuid := auth.uid();
      v_planet planets%ROWTYPE;
    BEGIN
      SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
      END IF;

      INSERT INTO ai_planet_custom_orders (planet_id, user_id, buildings, ships, defenses, research, updated_at)
      VALUES (p_planet_id, v_user_id, p_buildings, p_ships, p_defenses, p_research, now())
      ON CONFLICT (planet_id) DO UPDATE SET
        buildings = EXCLUDED.buildings,
        ships = EXCLUDED.ships,
        defenses = EXCLUDED.defenses,
        research = EXCLUDED.research,
        updated_at = now();

      RETURN jsonb_build_object('success', true);
    END;
    $fn$;
  `);
  console.log('✅ RPC save_ai_custom_orders created');

  // 5. RPC to get custom orders
  await client.query(`
    CREATE OR REPLACE FUNCTION get_ai_custom_orders(p_planet_id uuid)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_user_id uuid := auth.uid();
      v_orders ai_planet_custom_orders%ROWTYPE;
    BEGIN
      SELECT * INTO v_orders FROM ai_planet_custom_orders
      WHERE planet_id = p_planet_id AND user_id = v_user_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('buildings', '{}'::jsonb, 'ships', '{}'::jsonb, 'defenses', '{}'::jsonb, 'research', '{}'::jsonb);
      END IF;

      RETURN jsonb_build_object(
        'buildings', v_orders.buildings,
        'ships', v_orders.ships,
        'defenses', v_orders.defenses,
        'research', v_orders.research
      );
    END;
    $fn$;
  `);
  console.log('✅ RPC get_ai_custom_orders created');

  // 6. Update set_planet_autopilot_role to accept 'custom'
  await client.query(`
    CREATE OR REPLACE FUNCTION set_planet_autopilot_role(p_planet_id uuid, p_role text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE
      v_user_id uuid := auth.uid();
    BEGIN
      IF p_role NOT IN ('balanced', 'miner', 'military', 'research', 'colonizer', 'custom') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
      END IF;

      UPDATE planets SET autopilot_role = p_role WHERE id = p_planet_id AND user_id = v_user_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
      END IF;

      RETURN jsonb_build_object('success', true, 'role', p_role);
    END;
    $fn$;
  `);
  console.log('✅ RPC set_planet_autopilot_role updated with custom');

  await client.end();
  console.log('✅ All done!');
}

main().catch(e => { console.error(e); process.exit(1); });
