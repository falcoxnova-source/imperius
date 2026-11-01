const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  // Get dark@gmail.com user ID
  const u = await c.query(`SELECT id FROM profiles WHERE username ILIKE '%dark%' OR email ILIKE '%dark%' LIMIT 5`);
  console.log('Users matching dark:', u.rows);

  // Get recent battle messages for all users - check for unusual formats
  const r = await c.query(`
    SELECT id, recipient_id, subject, substring(body,1,200) as preview, created_at
    FROM messages 
    WHERE message_type='battle' 
    AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC LIMIT 20
  `);
  console.log('\n=== Recent battle messages (last 24h) ===');
  for (const row of r.rows) {
    const startsWithFlota = row.preview.startsWith('Tu flota');
    const startsWithPlaneta = row.preview.startsWith('Tu planeta');
    const hasMissile = row.preview.includes('misiles');
    const hasUnidadesDefensor = row.preview.includes('Unidades Defensor') || row.preview.includes('FUERZAS DEFENSORAS');
    console.log(`\n[${row.created_at}] To: ${row.recipient_id.substr(0,8)}`);
    console.log(`  Subject: ${row.subject}`);
    console.log(`  StartsWith: ${startsWithFlota ? 'TU FLOTA' : startsWithPlaneta ? 'TU PLANETA' : 'OTHER: ' + row.preview.substr(0,40)}`);
    console.log(`  Missile: ${hasMissile}`);
  }

  // Check for messages that DON'T start with "Tu flota" or "Tu planeta" and aren't missiles
  const r2 = await c.query(`
    SELECT id, subject, substring(body,1,300) as preview
    FROM messages 
    WHERE message_type='battle' 
    AND body NOT LIKE 'Tu flota%' 
    AND body NOT LIKE 'Tu planeta%'
    AND body NOT LIKE 'Has lanzado%'
    AND body NOT LIKE 'Combate ACS%'
    ORDER BY created_at DESC LIMIT 5
  `);
  console.log('\n\n=== UNUSUAL battle messages (not standard format) ===');
  for (const row of r2.rows) {
    console.log(`\n${row.subject}: ${row.preview}`);
  }

  c.end();
}).catch(e => { console.error(e); c.end(); });
