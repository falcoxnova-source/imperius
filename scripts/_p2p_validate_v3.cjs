const { Client } = require('pg');

const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

const U_SELLER = 'ec4e0d03-2c15-4bce-b741-150d71e3e7da';
const U_BUYER  = '1974ffcb-d11e-4f8d-a6e0-0944fc8af33d';

async function asUser(c, uid) {
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid]);
}

async function snapshot(c, label) {
  const { rows } = await c.query(`
    SELECT
      (SELECT fxu_balance::numeric(30,8)  FROM profiles WHERE id=$1) AS seller_fxu,
      (SELECT usdt_balance::numeric(30,8) FROM profiles WHERE id=$1) AS seller_usdt,
      (SELECT fxu_balance::numeric(30,8)  FROM profiles WHERE id=$2) AS buyer_fxu,
      (SELECT usdt_balance::numeric(30,8) FROM profiles WHERE id=$2) AS buyer_usdt,
      (SELECT fxu_balance::numeric(30,8)  FROM profiles WHERE is_admin=true ORDER BY created_at ASC LIMIT 1) AS admin_fxu,
      (SELECT fxu_balance::numeric(30,8)  FROM profiles WHERE id=(SELECT referred_by FROM profiles WHERE id=$1)) AS ref_fxu,
      (SELECT balance::numeric(30,8)      FROM jackpot LIMIT 1) AS jackpot
  `, [U_SELLER, U_BUYER]);
  console.log(`\n📸 ${label}`);
  console.table(rows[0]);
  return rows[0];
}

function delta(before, after) {
  const d = {};
  for (const k of Object.keys(before)) {
    const v = +(Number(after[k] || 0) - Number(before[k] || 0)).toFixed(8);
    if (Math.abs(v) > 1e-10) d[k] = v;
  }
  return d;
}

(async () => {
  const c = new Client(cfg);
  await c.connect();
  try {
    const pmUsdt = (await c.query(`SELECT id FROM p2p_payment_methods WHERE code='internal_usdt' AND is_enabled=true`)).rows[0].id;

    // Limpiar/validar sin in-flight
    const inFlight = await c.query(`SELECT count(*)::int AS c FROM p2p_orders WHERE status IN ('pending_payment','paid','disputed')`);
    if (inFlight.rows[0].c > 0) {
      throw new Error('Hay ordenes in-flight, abortando validación limpia.');
    }

    // A) SELL
    console.log('\n========== A) SELL ==========' );
    const a0 = await snapshot(c, 'A0 inicial');

    await asUser(c, U_SELLER);
    const offerA = (await c.query(`
      SELECT p2p_create_offer('SELL','FXU','USDT',0.01::numeric,20::numeric,5::numeric,20::numeric,ARRAY[$1]::int[],'v3 test A','XX',30) AS id
    `, [pmUsdt])).rows[0].id;

    await asUser(c, U_BUYER);
    const orderA = (await c.query(`SELECT p2p_accept_offer($1::uuid,20::numeric,$2::int,'{}'::jsonb) AS id`, [offerA, pmUsdt])).rows[0].id;

    const aAccept = await snapshot(c, 'A aceptada (escrow taker)');
    console.log('Δ A aceptación (esperado buyer_usdt -0.2):');
    console.table(delta(a0, aAccept));

    await c.query(`SELECT p2p_mark_paid($1::uuid)`, [orderA]);
    await asUser(c, U_SELLER);
    await c.query(`SELECT p2p_release_order($1::uuid)`, [orderA]);

    const a1 = await snapshot(c, 'A1 final');
    console.log('Δ A final (esperado seller -20 FXU +0.2 USDT; buyer +19.8 FXU -0.2 USDT; admin +0.1 FXU; ref +0.01 FXU; jackpot +0.09 FXU)');
    console.table(delta(a0, a1));

    // B) BUY sin referrer
    console.log('\n========== B) BUY sin referrer ==========' );
    const origRef = (await c.query(`SELECT referred_by FROM profiles WHERE id=$1`, [U_SELLER])).rows[0].referred_by;
    await c.query(`UPDATE profiles SET referred_by=NULL WHERE id=$1`, [U_SELLER]);

    try {
      const b0 = await snapshot(c, 'B0 inicial');

      await asUser(c, U_BUYER);
      const offerB = (await c.query(`
        SELECT p2p_create_offer('BUY','FXU','USDT',0.01::numeric,20::numeric,5::numeric,20::numeric,ARRAY[$1]::int[],'v3 test B','XX',30) AS id
      `, [pmUsdt])).rows[0].id;

      await asUser(c, U_SELLER);
      const orderB = (await c.query(`SELECT p2p_accept_offer($1::uuid,20::numeric,$2::int,'{}'::jsonb) AS id`, [offerB, pmUsdt])).rows[0].id;

      const bAccept = await snapshot(c, 'B aceptada (escrow taker)');
      console.log('Δ B aceptación (esperado seller_fxu -20 y buyer_usdt -0.2 desde create):');
      console.table(delta(b0, bAccept));

      await asUser(c, U_BUYER);
      await c.query(`SELECT p2p_mark_paid($1::uuid)`, [orderB]);
      await c.query(`SELECT p2p_release_order($1::uuid)`, [orderB]);

      const b1 = await snapshot(c, 'B1 final');
      console.log('Δ B final (esperado seller -20 FXU +0.2 USDT; buyer +19.8 FXU -0.2 USDT; admin +0.1 FXU; jackpot +0.1 FXU; ref 0)');
      console.table(delta(b0, b1));
    } finally {
      await c.query(`UPDATE profiles SET referred_by=$2 WHERE id=$1`, [U_SELLER, origRef]);
    }

    console.log('\n✅ Validación v3 completada');
  } catch (e) {
    console.error('❌', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
