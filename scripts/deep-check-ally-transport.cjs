const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Buscar validaciones en secure_send_fleet y validate_fleet_mission
  const { rows: sendFleet } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'secure_send_fleet' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') ORDER BY oid DESC LIMIT 1`);
  const { rows: validateFleet } = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'validate_fleet_mission' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') ORDER BY oid DESC LIMIT 1`);

  const sendSrc = sendFleet[0]?.prosrc || '';
  const validateSrc = validateFleet[0]?.prosrc || '';

  // Buscar palabras clave
  const keywords = ['alliance', 'aliado', 'ally', 'transport', 'colonia', 'colony', 'planet', 'user_id', 'target_user_id', 'prohibit', 'block', 'same user', 'misma persona', 'misma cuenta'];
  function findLines(src) {
    return keywords.flatMap(k => src.split('\n').filter(line => line.toLowerCase().includes(k)).map(line => ({ keyword: k, line })));
  }

  const sendLines = findLines(sendSrc);
  const validateLines = findLines(validateSrc);

  console.log('=== secure_send_fleet - palabras clave ===');
  sendLines.forEach(({ keyword, line }) => console.log(`[${keyword}] ${line.trim()}`));
  console.log('\n=== validate_fleet_mission - palabras clave ===');
  validateLines.forEach(({ keyword, line }) => console.log(`[${keyword}] ${line.trim()}`));

  // Buscar triggers o restricciones en la base
  const { rows: triggers } = await c.query(`SELECT event_object_table, trigger_name, action_statement FROM information_schema.triggers WHERE action_statement ILIKE '%fleet%' OR action_statement ILIKE '%resource%'`);
  if (triggers.length > 0) {
    console.log('\n=== Triggers relacionados ===');
    triggers.forEach(t => console.log(`${t.trigger_name} on ${t.event_object_table}: ${t.action_statement}`));
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
