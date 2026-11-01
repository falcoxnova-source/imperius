const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function q(sql, params = []) {
  return client.query(sql, params);
}

(async () => {
  await client.connect();

  const activeBots = await q(`
    SELECT username, email, created_at, points_total
    FROM profiles
    WHERE is_bot = true
    ORDER BY points_total DESC, created_at DESC
  `);

  const orphanActiveFleets = await q(`
    SELECT f.id, f.user_id, f.mission_type, f.departure_time, f.arrival_time,
           f.origin_planet_id, f.target_galaxy, f.target_system, f.target_position,
           f.is_completed, f.is_returning
    FROM fleets f
    LEFT JOIN profiles p ON p.id = f.user_id
    WHERE p.id IS NULL AND f.is_completed = false
    ORDER BY f.departure_time DESC
    LIMIT 50
  `);

  const orphanAllFleets = await q(`
    SELECT COUNT(*)::int AS n
    FROM fleets f
    LEFT JOIN profiles p ON p.id = f.user_id
    WHERE p.id IS NULL
  `);

  const orphanEspionageMessages = await q(`
    SELECT COUNT(*)::int AS n
    FROM messages m
    LEFT JOIN profiles s ON s.id = m.sender_id
    WHERE m.message_type = 'espionage'
      AND m.sender_id IS NOT NULL
      AND s.id IS NULL
  `);

  const orphanBattleReports = await q(`
    SELECT COUNT(*)::int AS n
    FROM battle_reports br
    LEFT JOIN profiles a ON a.id = br.attacker_id
    LEFT JOIN profiles d ON d.id = br.defender_id
    WHERE (br.attacker_id IS NOT NULL AND a.id IS NULL)
       OR (br.defender_id IS NOT NULL AND d.id IS NULL)
  `);

  const activeBotFleets = await q(`
    SELECT p.username, p.email, f.mission_type, COUNT(*)::int AS n
    FROM fleets f
    JOIN profiles p ON p.id = f.user_id
    WHERE p.is_bot = true AND f.is_completed = false
    GROUP BY p.username, p.email, f.mission_type
    ORDER BY n DESC, p.username ASC
  `);

  const falcoxBots = await q(`
    SELECT username, email, points_total
    FROM profiles
    WHERE is_bot = true AND email LIKE '%@falcox.local'
    ORDER BY points_total DESC, username ASC
  `);

  const oldBots = await q(`
    SELECT username, email, points_total
    FROM profiles
    WHERE is_bot = true AND email LIKE '%@falcoxnova.local'
    ORDER BY points_total DESC, username ASC
  `);

  const suspiciousNames = await q(`
    SELECT username, email, is_bot, points_total
    FROM profiles
    WHERE lower(username) IN ('bravoxs92', 'ivozar44')
    ORDER BY username
  `);

  console.log('='.repeat(80));
  console.log('DIAGNOSTICO NPC ELIMINADOS / ACTIVIDAD RESIDUAL');
  console.log('='.repeat(80));

  console.log(`\nBots activos en profiles: ${activeBots.rowCount}`);
  console.log(`- Bots antiguos @falcoxnova.local: ${oldBots.rowCount}`);
  console.log(`- Bots actuales @falcox.local: ${falcoxBots.rowCount}`);

  if (falcoxBots.rowCount > 0) {
    console.log('\nBots @falcox.local activos:');
    falcoxBots.rows.forEach(r => {
      console.log(`  - ${r.username} | ${r.email} | ${r.points_total} pts`);
    });
  }

  console.log(`\nFlotas huérfanas activas (user_id sin profile): ${orphanActiveFleets.rowCount}`);
  if (orphanActiveFleets.rowCount > 0) {
    orphanActiveFleets.rows.forEach(r => {
      console.log(`  - fleet ${r.id} | user=${r.user_id} | ${r.mission_type} | completed=${r.is_completed} returning=${r.is_returning} | target=${r.target_galaxy}:${r.target_system}:${r.target_position}`);
    });
  }

  console.log(`\nFlotas huérfanas totales (activas + históricas): ${orphanAllFleets.rows[0].n}`);
  console.log(`Mensajes de espionaje huérfanos: ${orphanEspionageMessages.rows[0].n}`);
  console.log(`Battle reports huérfanos: ${orphanBattleReports.rows[0].n}`);

  console.log('\nActividad actual de bots activos (flotas no completadas):');
  if (activeBotFleets.rowCount === 0) {
    console.log('  - Ninguna');
  } else {
    activeBotFleets.rows.forEach(r => {
      console.log(`  - ${r.username} | ${r.email} | ${r.mission_type} | ${r.n}`);
    });
  }

  console.log('\nUsuarios sospechosos buscados por nombre:');
  if (suspiciousNames.rowCount === 0) {
    console.log('  - No existen perfiles con username Bravoxs92 o Ivozar44');
  } else {
    suspiciousNames.rows.forEach(r => {
      console.log(`  - ${r.username} | ${r.email} | is_bot=${r.is_bot} | ${r.points_total} pts`);
    });
  }

  await client.end();
})();
