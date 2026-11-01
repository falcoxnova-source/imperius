const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function investigate() {
  await c.connect();

  // 1. Find Ronaldo's recent battles
  console.log('=== BATTLE REPORTS (Ronaldo) ===');
  const battles = await c.query(`
    SELECT br.id, br.attacker_id, br.defender_id, br.coordinates, br.result, br.rounds,
           br.attacker_losses_metal, br.attacker_losses_crystal,
           br.defender_losses_metal, br.defender_losses_crystal,
           br.debris_metal, br.debris_crystal,
           br.loot_metal, br.loot_crystal, br.loot_deuterium,
           br.created_at,
           pa.username as attacker_name, pd.username as defender_name
    FROM battle_reports br
    LEFT JOIN profiles pa ON br.attacker_id = pa.id
    LEFT JOIN profiles pd ON br.defender_id = pd.id
    WHERE pa.username ILIKE '%ronaldo%' OR pd.username ILIKE '%ronaldo%'
    ORDER BY br.created_at DESC LIMIT 5
  `);
  console.table(battles.rows.map(r => ({
    id: r.id,
    attacker: r.attacker_name,
    defender: r.defender_name,
    coords: r.coordinates,
    result: r.result,
    rounds: r.rounds,
    atk_loss_m: r.attacker_losses_metal,
    def_loss_m: r.defender_losses_metal,
    debris_m: r.debris_metal,
    debris_c: r.debris_crystal,
    loot_m: r.loot_metal,
    created: r.created_at
  })));

  if (battles.rows.length > 0) {
    const lastBattle = battles.rows[0];
    
    // 2. Check report_data for combat details
    console.log('\n=== LAST BATTLE REPORT DATA ===');
    const reportData = await c.query(`
      SELECT report_data->'attacker_remaining' as attacker_remaining,
             report_data->'defender_remaining' as defender_remaining,
             report_data->'destroyed_defenses' as destroyed_defenses,
             report_data->>'result' as result
      FROM battle_reports
      WHERE id = $1
    `, [lastBattle.id]);
    
    if (reportData.rows[0]) {
      const rd = reportData.rows[0];
      if (rd.attacker_remaining) {
        console.log('\nAttacker Remaining:');
        const atkRem = typeof rd.attacker_remaining === 'string' ? JSON.parse(rd.attacker_remaining) : rd.attacker_remaining;
        atkRem.forEach(u => {
          if (u.initial_quantity !== u.quantity) {
            console.log(`  ${u.name}: ${u.quantity}/${u.initial_quantity} (lost ${u.initial_quantity - u.quantity}) fleet_id=${u.fleet_id || 'N/A'}`);
          }
        });
      }
      if (rd.defender_remaining) {
        console.log('\nDefender Remaining (defenses):');
        const defRem = typeof rd.defender_remaining === 'string' ? JSON.parse(rd.defender_remaining) : rd.defender_remaining;
        defRem.filter(u => u.is_defense).forEach(u => {
          console.log(`  ${u.name}: ${u.quantity}/${u.initial_quantity} type_id=${u.type_id}`);
        });
      }
      if (rd.destroyed_defenses) {
        console.log('\nDestroyed Defenses:');
        const dd = typeof rd.destroyed_defenses === 'string' ? JSON.parse(rd.destroyed_defenses) : rd.destroyed_defenses;
        console.log(JSON.stringify(dd, null, 2));
      }
    }

    // 3. Check attacker's current fleets (returning or completed)
    console.log('\n=== RONALDO FLEETS (recent) ===');
    const fleets = await c.query(`
      SELECT f.id, f.mission_type, f.is_returning, f.is_completed, f.is_acs, f.acs_id,
             f.arrival_time, f.return_time,
             f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
             f.created_at
      FROM fleets f
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC LIMIT 10
    `, [lastBattle.attacker_id]);
    console.table(fleets.rows);

    // 4. Check defender's planet defenses
    console.log('\n=== DEFENDER PLANET DEFENSES ===');
    const defenses = await c.query(`
      SELECT dt.name, pd.quantity, dt.id as type_id
      FROM planet_defenses pd
      JOIN defense_types dt ON pd.defense_type_id = dt.id
      WHERE pd.planet_id = $1 AND pd.quantity > 0
      ORDER BY dt.name
    `, [lastBattle.planet_id]);
    console.table(defenses.rows);

    // 5. Check if it was ACS
    if (lastBattle.attacker_id) {
      const acsCheck = await c.query(`
        SELECT af.id, af.status, af.is_active, af.current_participants, af.arrival_time, af.created_at,
               ap.fleet_id, ap.user_id, pr.username
        FROM acs_fleets af
        JOIN acs_participants ap ON af.id = ap.acs_id
        LEFT JOIN profiles pr ON ap.user_id = pr.id
        WHERE af.created_at >= NOW() - INTERVAL '3 days'
        ORDER BY af.created_at DESC LIMIT 20
      `);
      if (acsCheck.rows.length > 0) {
        console.log('\n=== RECENT ACS FLEETS ===');
        console.table(acsCheck.rows);
      }
    }
  }

  await c.end();
}

investigate().catch(e => { console.error(e); process.exit(1); });
