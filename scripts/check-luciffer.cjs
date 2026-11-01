const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

(async()=>{
  await c.connect();
  const {rows} = await c.query(`
    SELECT 
      p.username,
      p.points_total,
      get_user_lifetime_fxu_spent(p.id) as fxu_spent,
      get_user_market_earnings(p.id) as fxu_earned,
      calculate_running_fxu_credit(p.id) as fxu_credit,
      calculate_fxu_weekly_limit(p.id) as fxu_limit,
      calculate_monthly_market_limit(p.id) as resource_limit
    FROM profiles p
    WHERE p.username ILIKE '%lucif%'
  `);
  for(const r of rows){
    console.log('=== ' + r.username + ' ===');
    console.log('Puntos ranking:     ' + Number(r.points_total).toLocaleString());
    console.log('');
    console.log('LIMITE 1 - Recursos (por puntos, semanal):');
    console.log('  Metal:            ' + Number(r.resource_limit).toLocaleString() + ' unidades');
    console.log('  Cristal:          ' + Number(r.resource_limit).toLocaleString() + ' unidades');
    console.log('  Deuterio:         ' + Number(r.resource_limit).toLocaleString() + ' unidades');
    console.log('  (al precio que quiera)');
    console.log('');
    console.log('LIMITE 2 - Credito FXU (por inversion):');
    console.log('  Gastado empresa:  ' + Number(r.fxu_spent).toLocaleString() + ' FXU');
    console.log('  Recuperado:       ' + Number(r.fxu_earned).toLocaleString() + ' FXU');
    console.log('  Credito restante: ' + Number(r.fxu_credit).toLocaleString() + ' FXU');
    console.log('  FXU limit:        ' + Number(r.fxu_limit).toLocaleString() + ' FXU');
  }
  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
