const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();

  console.log('1/5 Adding arrival_notified column to fleets...');
  await c.query(`ALTER TABLE fleets ADD COLUMN IF NOT EXISTS arrival_notified boolean DEFAULT false`);
  console.log('   ✅ Column added');

  console.log('2/5 Backfilling existing stationed deploy fleets (treat as notified)...');
  const bf = await c.query(`
    UPDATE fleets
    SET arrival_notified = true
    WHERE mission_type = 'deploy'
      AND NOT is_returning
      AND NOT is_completed
      AND arrival_time <= NOW()
      AND arrival_notified = false
  `);
  console.log(`   ✅ Backfilled ${bf.rowCount} fleets`);

  console.log('3/5 Patching process_fleet_arrival (deploy-to-ally branch) with guard...');
  // Get current function body
  const cur = await c.query(`SELECT pg_get_functiondef(p.oid) AS src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='process_fleet_arrival' LIMIT 1`);
  if (cur.rows.length === 0) { console.log('⚠️ process_fleet_arrival not found'); await c.end(); return; }
  let src = cur.rows[0].src;
  // Normalize line endings (Windows script may have \r\n, DB source uses \n)
  src = src.replace(/\r\n/g, '\n');

  // Patch 1: Add flag-based guard right before the ACS check (unique anchor)
  const anchor1 = [
    `IF fleet_record.is_acs AND fleet_record.acs_id IS NOT NULL AND NOT fleet_record.is_returning THEN`
  ].join('\n');
  const insert1 = [
    `-- [FIX SPAM] Guard para deploy a planeta aliado: si ya se notifico la llegada,`,
    `-- saltar reprocesamiento (evita spam de "Flota Estacionada" cada minuto).`,
    `IF fleet_record.mission_type = 'deploy'`,
    `   AND NOT fleet_record.is_returning`,
    `   AND NOT fleet_record.is_completed`,
    `   AND COALESCE(fleet_record.arrival_notified, false) = true THEN`,
    `  RETURN;`,
    `END IF;`,
    ``,
    anchor1
  ].join('\n');

  if (!src.includes(anchor1)) {
    console.log('⚠️ Anchor1 not found. Aborting.');
    await c.end();
    return;
  }
  if (src.includes('[FIX SPAM] Guard para deploy')) {
    console.log('   ℹ️ Guard already present, skipping patch 1');
  } else {
    src = src.replace(anchor1, insert1);
  }

  // Patch 2: In deploy-to-ally branch, mark arrival_notified=true before sending messages
  const anchor2 = [
    `INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)`,
    `VALUES (NULL, fleet_record.user_id, 'Flota Estacionada',`
  ].join('\n');
  const insert2 = [
    `-- [FIX SPAM] Marcar flota como notificada ANTES de insertar mensaje`,
    `-- para que el guard superior bloquee reprocesamientos.`,
    `UPDATE fleets SET arrival_notified = true WHERE id = p_fleet_id;`,
    ``,
    anchor2
  ].join('\n');

  if (!src.includes(anchor2)) {
    console.log('⚠️ Anchor2 (Flota Estacionada insert) not found. Aborting.');
    await c.end();
    return;
  }
  if (src.includes('[FIX SPAM] Marcar flota como notificada')) {
    console.log('   ℹ️ Mark-notified already present, skipping patch 2');
  } else {
    src = src.replace(anchor2, insert2);
  }

  await c.query(src);
  console.log('   ✅ process_fleet_arrival patched');

  console.log('4/5 Cleaning duplicate Flota Estacionada/Aliada spam (keep 1 per user+coords+hour)...');
  const clean = await c.query(`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY recipient_id, subject, substring(body from 'en \\[([0-9:]+)\\]')
          ORDER BY created_at ASC
        ) as rn
      FROM messages
      WHERE subject IN ('Flota Estacionada', 'Flota Aliada Estacionada')
        AND created_at >= NOW() - interval '7 days'
    )
    DELETE FROM messages WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `);
  console.log(`   ✅ Deleted ${clean.rowCount} duplicate messages`);

  console.log('5/5 Verifying...');
  const chk = await c.query(`
    SELECT recipient_id, subject, COUNT(*) as cnt
    FROM messages
    WHERE subject IN ('Flota Estacionada', 'Flota Aliada Estacionada')
      AND created_at >= NOW() - interval '48 hours'
    GROUP BY recipient_id, subject
    HAVING COUNT(*) > 2
    ORDER BY cnt DESC
    LIMIT 5
  `);
  if (chk.rows.length === 0) {
    console.log('   ✅ No more spam groups');
  } else {
    console.log('   ℹ️ Remaining >2 groups:');
    console.table(chk.rows);
  }

  await c.end();
  console.log('\n🎉 Fix applied successfully!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
