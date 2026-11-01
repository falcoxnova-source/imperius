const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Comparando process_fleet_arrival...\n');

  // Get current function from DB
  const result = await client.query(`
    SELECT prosrc
    FROM pg_proc
    WHERE proname = 'process_fleet_arrival'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);

  if (result.rows.length === 0) {
    console.log('Function not found in DB!');
    await client.end();
    return;
  }

  const dbSource = result.rows[0].prosrc;
  console.log('Longitud en BD:', dbSource.length, 'caracteres');
  
  // Check for key features
  console.log('\n=== Características en BD ===');
  console.log('- battle_reports INSERT:', dbSource.includes('INSERT INTO battle_reports') ? '✅ SÍ' : '❌ NO');
  console.log('- target_type filter:', dbSource.includes("fleet_record.target_type, 'planet'") ? '✅ SÍ' : '❌ NO');
  console.log('- format_unit_report:', dbSource.includes('format_unit_report') ? '✅ SÍ' : '❌ NO');
  console.log('- building damage:', dbSource.includes('v_building_damage_text') ? '✅ SÍ' : '❌ NO');
  console.log('- moon creation:', dbSource.includes('check_moon_creation') ? '✅ SÍ' : '❌ NO');
  console.log('- defense rebuild 70%:', dbSource.includes('0.7') ? '✅ SÍ' : '❌ NO');
  console.log('- allied fleet messages:', dbSource.includes('Flota Aliada Estacionada') ? '✅ SÍ' : '❌ NO');
  console.log('- ACS delegation:', dbSource.includes('process_acs_fleet_arrival') ? '✅ SÍ' : '❌ NO');

  // Show first 200 lines
  console.log('\n=== Primeras líneas del código en BD ===');
  const lines = dbSource.split('\n').slice(0, 50);
  lines.forEach((line, i) => console.log(`${(i+1).toString().padStart(3)}: ${line}`));

  await client.end();
}

main().catch(console.error);
