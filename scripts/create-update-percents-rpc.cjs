const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Conectado a la base de datos');
  
  // Crear función RPC para actualizar porcentajes
  const createFunction = `
    CREATE OR REPLACE FUNCTION admin_update_pool_percents(
      p_expedition_percent INTEGER,
      p_monthly_percent INTEGER,
      p_plus_percent INTEGER,
      p_destruction_percent INTEGER
    )
    RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_user_id UUID;
      v_is_admin BOOLEAN;
      v_total INTEGER;
    BEGIN
      -- Obtener usuario actual
      v_user_id := auth.uid();
      
      IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No autenticado');
      END IF;
      
      -- Verificar si es admin
      SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
      
      IF NOT v_is_admin THEN
        RETURN json_build_object('success', false, 'error', 'No tienes permisos de administrador');
      END IF;
      
      -- Validar que la suma sea 80
      v_total := p_expedition_percent + p_monthly_percent + p_plus_percent + p_destruction_percent;
      
      IF v_total != 80 THEN
        RETURN json_build_object('success', false, 'error', 'La suma de los porcentajes debe ser 80%');
      END IF;
      
      -- Validar que ninguno sea negativo
      IF p_expedition_percent < 0 OR p_monthly_percent < 0 OR p_plus_percent < 0 OR p_destruction_percent < 0 THEN
        RETURN json_build_object('success', false, 'error', 'Los porcentajes no pueden ser negativos');
      END IF;
      
      -- Actualizar los porcentajes
      UPDATE jackpot_pools
      SET 
        expedition_percent = p_expedition_percent,
        monthly_percent = p_monthly_percent,
        plus_percent = p_plus_percent,
        destruction_percent = p_destruction_percent,
        updated_at = NOW()
      WHERE id = 1;
      
      RETURN json_build_object(
        'success', true,
        'expedition_percent', p_expedition_percent,
        'monthly_percent', p_monthly_percent,
        'plus_percent', p_plus_percent,
        'destruction_percent', p_destruction_percent
      );
    END;
    $$;
  `;
  
  await client.query(createFunction);
  console.log('✅ Función admin_update_pool_percents creada');
  
  // Verificar que funciona
  const result = await client.query(`
    SELECT * FROM jackpot_pools WHERE id = 1
  `);
  console.log('Estado actual de los pools:', result.rows[0]);
  
  await client.end();
  console.log('✅ Listo!');
}

main().catch(console.error);
