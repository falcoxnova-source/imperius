const { Client } = require('pg');
const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};
(async()=>{
  const c = new Client(cfg); await c.connect();
  try {
    await c.query(`
      INSERT INTO p2p_payment_methods (code,name,country_code,currency_code,method_type,requires_account,is_enabled,sort_order,notes)
      VALUES ('cu_tarjeta_clasica','Tarjeta Clásica (CUP)','CU','CUP','bank_transfer',true,true,30,'Tarjeta Clásica Cuba')
      ON CONFLICT (code) DO UPDATE SET is_enabled=true, name=EXCLUDED.name, notes=EXCLUDED.notes
    `);
    const r = await c.query(`SELECT code,name,currency_code FROM p2p_payment_methods WHERE currency_code IN ('CUP','MLC') AND is_enabled=true ORDER BY currency_code,sort_order`);
    console.table(r.rows);
    console.log('✅ Tarjeta Clásica añadida');
  } finally { await c.end(); }
})();
