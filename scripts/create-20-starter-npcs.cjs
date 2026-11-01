// Crea 20 NPCs nuevos que empiezan desde 0 como jugadores recién registrados.
// - is_bot = true
// - email @falcox.local (para poder identificarlos/borrarlos)
// - Planeta principal con recursos iniciales (500 metal, 500 crystal, 0 deut)
// - SIN edificios pre-construidos, SIN naves, SIN defensas, SIN tecnologías
// - 0 puntos (ranking al final)
// - El bot_ai_tick() se encargará de hacerlos crecer orgánicamente
//
// Uso:
//   node scripts/create-20-starter-npcs.cjs           -> simulación
//   node scripts/create-20-starter-npcs.cjs --execute -> crear de verdad

const { Client } = require('pg');
const crypto = require('crypto');

const EXECUTE = process.argv.includes('--execute');
const TOTAL_NPCS = 20;

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

// Generador de nombres estilo space-fantasy
const PREFIXES = ['Ari','Nox','Zan','Kai','Lio','Nev','Sor','Tan','Vex','Zoe','Bra','Tyr','Neo','Axe','Dra','Mir','Ory','Xen'];
const SUFFIXES = ['dor','ven','rak','mir','sol','kyo','nyx','ton','vos','ger','ion','lyn','zar','fer','tor','ris','kan','hex','dra','pax'];

function genUsername(existing) {
  for (let i = 0; i < 100; i++) {
    const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    const n = Math.random() < 0.5 ? '' : String(Math.floor(Math.random() * 90) + 10);
    const u = p + s + n;
    if (!existing.has(u)) {
      existing.add(u);
      return u;
    }
  }
  return 'Bot' + Date.now() + Math.floor(Math.random() * 1000);
}

async function findFreeSlot() {
  // Busca un slot libre en galaxias 1-3 (pobladas), sistema 1-499, posición 4-12
  for (let tries = 0; tries < 100; tries++) {
    const galaxy = 1 + Math.floor(Math.random() * 3);
    const solar = 1 + Math.floor(Math.random() * 499);
    const pos = 4 + Math.floor(Math.random() * 9); // 4-12
    const res = await client.query(
      `SELECT 1 FROM planets WHERE galaxy=$1 AND solar_system=$2 AND position=$3 LIMIT 1`,
      [galaxy, solar, pos]
    );
    if (res.rowCount === 0) return { galaxy, solar_system: solar, position: pos };
  }
  throw new Error('No se encontró slot libre tras 100 intentos');
}

async function createOneNpc(username) {
  const userId = crypto.randomUUID();
  const email = `${username.toLowerCase()}_${crypto.randomBytes(3).toString('hex')}@falcox.local`;
  const slot = await findFreeSlot();

  await client.query('BEGIN');
  try {
    // Deshabilitar triggers para evitar efectos laterales
    await client.query(`SET LOCAL session_replication_role = 'replica'`);

    // 1. auth.users
    await client.query(`
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous
      ) VALUES (
        $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        $2, crypt($3, gen_salt('bf')), now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb, false, false, false
      )
    `, [userId, email, crypto.randomBytes(16).toString('hex')]);

    // 2. profiles - empieza desde 0
    await client.query(`
      INSERT INTO profiles (
        id, username, email, is_bot, email_verified,
        points_total, points_buildings, points_research, points_fleet, points_defense,
        dark_matter, fxu_balance, usdt_balance,
        battles_won, battles_draw, battles_lost,
        last_activity, created_at, updated_at
      ) VALUES (
        $1, $2, $3, true, true,
        0, 0, 0, 0, 0,
        0, 0, 0,
        0, 0, 0,
        now(), now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        is_bot = true,
        points_total = 0, points_buildings = 0, points_research = 0,
        points_fleet = 0, points_defense = 0
    `, [userId, username, email]);

    // 3. Planeta principal (solo uno, como jugador nuevo)
    const planetId = crypto.randomUUID();
    await client.query(`
      INSERT INTO planets (
        id, user_id, name, galaxy, solar_system, position,
        planet_type, diameter, fields_used, fields_max, temp_min, temp_max,
        is_main_planet, is_destroyed, last_update, created_at
      ) VALUES (
        $1, $2, 'Planeta Principal', $3, $4, $5,
        'planet', 12800, 0, 163, -30, 40,
        true, false, now(), now()
      )
    `, [planetId, userId, slot.galaxy, slot.solar_system, slot.position]);

    // 4. Recursos iniciales estándar (igual que jugadores nuevos)
    await client.query(`
      INSERT INTO planet_resources (
        planet_id, metal, crystal, deuterium, energy_used, energy_max,
        metal_per_hour, crystal_per_hour, deuterium_per_hour,
        metal_storage, crystal_storage, deuterium_storage,
        last_update,
        metal_mine_percent, crystal_mine_percent, deuterium_synth_percent,
        solar_plant_percent, fusion_reactor_percent, solar_satellite_percent
      ) VALUES (
        $1, 500, 500, 0, 0, 0,
        0, 0, 0,
        10000, 10000, 10000,
        now(),
        100, 100, 100, 100, 100, 100
      )
    `, [planetId]);

    await client.query('COMMIT');
    return { userId, username, email, planetId, slot };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  await client.connect();
  console.log('='.repeat(70));
  console.log(EXECUTE ? '🔴 MODO EJECUCIÓN' : '🟢 MODO SIMULACIÓN');
  console.log(`Objetivo: crear ${TOTAL_NPCS} NPCs starter (desde 0, como jugadores nuevos)`);
  console.log('='.repeat(70));

  // Cargar usernames existentes
  const existingRes = await client.query(`SELECT username FROM profiles`);
  const existing = new Set(existingRes.rows.map(r => r.username));
  console.log(`Usernames existentes: ${existing.size}`);

  // Generar los 20 nombres
  const usernames = [];
  for (let i = 0; i < TOTAL_NPCS; i++) usernames.push(genUsername(existing));
  console.log('\nNombres generados:');
  usernames.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));

  if (!EXECUTE) {
    console.log('\n' + '='.repeat(70));
    console.log('MODO SIMULACIÓN. Para crear: node scripts/create-20-starter-npcs.cjs --execute');
    console.log('='.repeat(70));
    await client.end();
    return;
  }

  console.log('\n🚀 Creando NPCs...\n');
  let ok = 0, fail = 0;
  for (const username of usernames) {
    try {
      const r = await createOneNpc(username);
      ok++;
      console.log(`  ✅ ${r.username} @ G${r.slot.galaxy}:${r.slot.solar_system}:${r.slot.position}`);
    } catch (e) {
      fail++;
      console.log(`  ❌ ${username}: ${e.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Creados: ${ok} / ${TOTAL_NPCS}`);
  if (fail > 0) console.log(`❌ Fallidos: ${fail}`);
  console.log('='.repeat(70));

  // Verificación
  const verif = await client.query(`
    SELECT COUNT(*)::int AS n FROM profiles
    WHERE is_bot = true AND email LIKE '%@falcox.local'
  `);
  console.log(`\n📊 NPCs @falcox.local en DB: ${verif.rows[0].n}`);
  console.log(`📊 Bots totales: ${(await client.query(`SELECT COUNT(*)::int AS n FROM profiles WHERE is_bot=true`)).rows[0].n}`);

  await client.end();
}

main().catch(async (e) => {
  console.error('Error fatal:', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
