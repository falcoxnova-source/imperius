import { Client } from 'pg';
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// Eliminar la version duplicada (OID 606434) que tiene los mismos params en distinto orden
const dropSql = `
DROP FUNCTION IF EXISTS public.secure_send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text,
  p_fleet_ships jsonb,
  p_cargo_metal bigint,
  p_cargo_crystal bigint,
  p_cargo_deuterium bigint,
  p_speed_percent integer,
  p_target_type text
);
`;
console.log('Ejecutando DROP de version duplicada...');
await client.query(dropSql);
console.log('OK. Verificando estado final...');

const r = await client.query(`
  SELECT
    p.oid,
    pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'secure_send_fleet'
  ORDER BY p.oid
`);
console.log('Versiones restantes:', r.rows.length);
r.rows.forEach((row, i) => {
  console.log(`[${i+1}] OID ${row.oid}: ${row.args}`);
});

await client.end();
