/**
 * Sugerencia #12: Ocultar Records
 * 
 * 1. Agrega columna hide_records BOOLEAN DEFAULT false a profiles
 * 2. Actualiza get_universe_records() para filtrar jugadores con hide_records = true
 */

const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('✅ Conectado a la base de datos');

  // ========================================
  // PASO 1: Agregar columna hide_records
  // ========================================
  console.log('\n📋 Paso 1: Agregar columna hide_records a profiles...');
  
  // Verificar si ya existe
  const { rows: colCheck } = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'hide_records'
  `);

  if (colCheck.length > 0) {
    console.log('  ⚠️ La columna hide_records ya existe, saltando...');
  } else {
    await client.query(`
      ALTER TABLE profiles 
      ADD COLUMN hide_records BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('  ✅ Columna hide_records agregada (DEFAULT false)');
  }

  // ========================================
  // PASO 2: Actualizar get_universe_records()
  // ========================================
  console.log('\n📋 Paso 2: Actualizar get_universe_records() con filtro hide_records...');

  await client.query(`
    CREATE OR REPLACE FUNCTION get_universe_records()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_buildings jsonb;
      v_research jsonb;
      v_ships jsonb;
      v_defense jsonb;
    BEGIN
      -- Records de edificios: nivel más alto de cada tipo
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      INTO v_buildings
      FROM (
        SELECT DISTINCT ON (bt.id)
          bt.id AS item_id,
          bt.name AS item_name,
          bt.image_url AS item_image,
          pb.level AS value,
          p.name AS planet_name,
          pr.username
        FROM building_types bt
        JOIN planet_buildings pb ON pb.building_type_id = bt.id AND pb.level > 0
        JOIN planets p ON p.id = pb.planet_id AND p.is_destroyed = false
        JOIN profiles pr ON pr.id = p.user_id AND pr.is_banned = false AND pr.hide_records = false
        ORDER BY bt.id, pb.level DESC
      ) r;

      -- Records de investigación: nivel más alto de cada tecnología
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      INTO v_research
      FROM (
        SELECT DISTINCT ON (tt.id)
          tt.id AS item_id,
          tt.name AS item_name,
          tt.image_url AS item_image,
          ut.level AS value,
          pr.username
        FROM technology_types tt
        JOIN user_technologies ut ON ut.technology_type_id = tt.id AND ut.level > 0
        JOIN profiles pr ON pr.id = ut.user_id AND pr.is_banned = false AND pr.hide_records = false
        ORDER BY tt.id, ut.level DESC
      ) r;

      -- Records de naves: mayor cantidad de cada tipo en un solo planeta
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      INTO v_ships
      FROM (
        SELECT DISTINCT ON (st.id)
          st.id AS item_id,
          st.name AS item_name,
          st.image_url AS item_image,
          ps.quantity AS value,
          p.name AS planet_name,
          pr.username
        FROM ship_types st
        JOIN planet_ships ps ON ps.ship_type_id = st.id AND ps.quantity > 0
        JOIN planets p ON p.id = ps.planet_id AND p.is_destroyed = false
        JOIN profiles pr ON pr.id = p.user_id AND pr.is_banned = false AND pr.hide_records = false
        ORDER BY st.id, ps.quantity DESC
      ) r;

      -- Records de defensas: mayor cantidad de cada tipo en un solo planeta
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      INTO v_defense
      FROM (
        SELECT DISTINCT ON (dt.id)
          dt.id AS item_id,
          dt.name AS item_name,
          dt.image_url AS item_image,
          pd.quantity AS value,
          p.name AS planet_name,
          pr.username
        FROM defense_types dt
        JOIN planet_defenses pd ON pd.defense_type_id = dt.id AND pd.quantity > 0
        JOIN planets p ON p.id = pd.planet_id AND p.is_destroyed = false
        JOIN profiles pr ON pr.id = p.user_id AND pr.is_banned = false AND pr.hide_records = false
        ORDER BY dt.id, pd.quantity DESC
      ) r;

      RETURN jsonb_build_object(
        'buildings', v_buildings,
        'research', v_research,
        'ships', v_ships,
        'defense', v_defense
      );
    END;
    $$;
  `);
  console.log('  ✅ Función get_universe_records() actualizada con filtro hide_records');

  // ========================================
  // VERIFICACIÓN
  // ========================================
  console.log('\n📋 Verificación...');
  
  const { rows: verify } = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'hide_records'
  `);
  console.log('  Columna:', verify[0]);

  const { rows: fnCheck } = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'get_universe_records'
  `);
  const hasFilter = fnCheck[0]?.prosrc?.includes('hide_records');
  console.log('  Función tiene filtro hide_records:', hasFilter ? '✅ SÍ' : '❌ NO');

  await client.end();
  console.log('\n🎉 Todo listo! Sugerencia #12 implementada en la base de datos.');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
