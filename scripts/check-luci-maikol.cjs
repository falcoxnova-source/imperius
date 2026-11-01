const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, database:'postgres', user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', ssl:{rejectUnauthorized:false} });

(async()=>{
  await c.connect();
  const r = await c.query(`
    SELECT p.username,
      COALESCE(p.points_total,0) as points,
      get_user_lifetime_fxu_spent(p.id) as total_spent,
      get_user_market_earnings(p.id) as total_earned,
      calculate_running_fxu_credit(p.id) as fxu_credit,
      calculate_fxu_weekly_limit(p.id) as fxu_limit,
      calculate_monthly_market_limit(p.id) as resource_limit
    FROM profiles p
    WHERE LOWER(p.username) LIKE '%luciffer%' OR LOWER(p.username) LIKE '%maikol%'
  `);
  for(const u of r.rows){
    console.log('=== ' + u.username + ' ===');
    console.log('  Puntos ranking:      ' + Number(u.points).toLocaleString());
    console.log('  Limite unidades:     ' + Number(u.resource_limit).toLocaleString() + ' por recurso/semana');
    console.log('  ---');
    console.log('  Gastado (siempre):   ' + Number(u.total_spent).toLocaleString() + ' FXU');
    console.log('  Ganado (historico):  ' + Number(u.total_earned).toLocaleString() + ' FXU');
    console.log('  Credito FXU:         ' + Number(u.fxu_credit).toLocaleString() + ' FXU');
    console.log('  Limite FXU semanal:  ' + Number(u.fxu_limit).toLocaleString() + ' FXU');
    console.log('');
  }
  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
