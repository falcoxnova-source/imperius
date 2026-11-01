const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

(async()=>{
  await c.connect();
  const admin = await c.query(`SELECT id, fxu_balance FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1`);
  console.log('Balance antes:', parseFloat(admin.rows[0].fxu_balance).toFixed(2), 'FXU');
  
  await c.query(`DO $$ BEGIN PERFORM _internal_set_fxu_context(); UPDATE profiles SET fxu_balance = 0 WHERE id = '${admin.rows[0].id}'; END $$;`);
  
  const after = await c.query(`SELECT fxu_balance FROM profiles WHERE id = $1`, [admin.rows[0].id]);
  console.log('Balance después:', parseFloat(after.rows[0].fxu_balance).toFixed(2), 'FXU');
  console.log('✅ Listo');
  await c.end();
})();
