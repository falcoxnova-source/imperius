const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Several interpretations of "Deuda" (debt owed to users)
  const q1 = await c.query(`
    SELECT
      COALESCE(SUM(fxu_balance), 0)::numeric(20,2)  AS fxu_all,
      COALESCE(SUM(usdt_balance), 0)::numeric(20,4) AS usdt_all,
      COUNT(*) FILTER (WHERE fxu_balance > 0)       AS users_fxu,
      COUNT(*) FILTER (WHERE usdt_balance > 0)      AS users_usdt
    FROM profiles`);
  console.log('Suma TOTAL en profiles (incluye admin/bots):', q1.rows[0]);

  // Excluding admin
  const q2 = await c.query(`
    SELECT
      COALESCE(SUM(fxu_balance), 0)::numeric(20,2)  AS fxu_no_admin,
      COALESCE(SUM(usdt_balance), 0)::numeric(20,4) AS usdt_no_admin
    FROM profiles
    WHERE COALESCE(is_admin, false) = false`);
  console.log('Excluyendo is_admin=true:', q2.rows[0]);

  // Excluding bots (if column exists)
  const colCheck = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('is_bot','is_admin')`);
  console.log('columnas detectadas:', colCheck.rows.map(r => r.column_name));

  const q3 = await c.query(`
    SELECT
      COALESCE(SUM(fxu_balance), 0)::numeric(20,2)  AS fxu_humans,
      COALESCE(SUM(usdt_balance), 0)::numeric(20,4) AS usdt_humans
    FROM profiles
    WHERE COALESCE(is_admin, false) = false
      AND COALESCE(is_bot, false) = false`);
  console.log('Excluyendo admin + bots (humanos reales):', q3.rows[0]);

  // Even stricter: exclude admin + bots + disabled
  const q4 = await c.query(`
    SELECT
      COALESCE(SUM(fxu_balance), 0)::numeric(20,2)  AS fxu,
      COALESCE(SUM(usdt_balance), 0)::numeric(20,4) AS usdt
    FROM profiles
    WHERE COALESCE(is_admin, false) = false
      AND COALESCE(is_bot, false) = false
      AND COALESCE(is_deleted, false) = false`);
  console.log('Excluyendo admin + bots + deleted:', q4.rows[0]);

  // Check panel formula candidates — maybe admin excluded AND something else
  // 2,180,411.32 FXU and 267.99 USDT
  // Maybe USDT panel includes "pending withdrawals" or locked bids
  const q5 = await c.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND (table_name ILIKE '%pending%' OR table_name ILIKE '%lock%' OR table_name ILIKE '%escrow%' OR table_name ILIKE '%order%' OR table_name ILIKE '%bid%' OR table_name ILIKE '%listing%')
     ORDER BY table_name`);
  console.log('\ntablas relacionadas candidatas:', q5.rows.map(r => r.table_name));

  await c.end();
})();
