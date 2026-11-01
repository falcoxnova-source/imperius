// Retoma orden B stuck (pending_payment) y completa flujo
const { Client } = require('pg');
const cfg = { host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}};
const U_SELLER = 'ec4e0d03-2c15-4bce-b741-150d71e3e7da';
const U_BUYER  = '1974ffcb-d11e-4f8d-a6e0-0944fc8af33d';

async function asUser(c, uid) { await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid]); }

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
  console.log(`\n📸 ${label}`); console.table(rows[0]); return rows[0];
}
function delta(b, a) { const d={}; for (const k of Object.keys(b)) { const v=+(Number(a[k]||0)-Number(b[k]||0)).toFixed(8); if (Math.abs(v)>1e-10) d[k]=v; } return d; }

(async () => {
  const c = new Client(cfg); await c.connect();
  try {
    // Buscar orden B stuck
    const stuck = await c.query(`
      SELECT o.id, o.status, o.asset_amount, o.fiat_amount, o.fee_asset, o.offer_id
      FROM p2p_orders o
      JOIN p2p_offers of ON of.id=o.offer_id
      WHERE of.side='buy' AND o.buyer_id=$1 AND o.seller_id=$2 AND o.status='pending_payment'
      ORDER BY o.created_at DESC LIMIT 1
    `, [U_BUYER, U_SELLER]);

    if (stuck.rows.length === 0) { console.log('No hay orden B stuck'); process.exit(0); }
    const orderB = stuck.rows[0].id;
    console.log('Orden B stuck:', stuck.rows[0]);

    // Temporal: quitar referrer del seller para test sin-referrer
    const origRef = (await c.query(`SELECT referred_by FROM profiles WHERE id=$1`, [U_SELLER])).rows[0].referred_by;
    await c.query(`UPDATE profiles SET referred_by=NULL WHERE id=$1`, [U_SELLER]);
    console.log(`Referrer removido (original=${origRef})`);

    try {
      const snapB0 = await snapshot(c, 'B0 (antes de mark_paid + release)');

      // En BUY, buyer (offer owner) marca paid y luego libera
      await asUser(c, U_BUYER);
      await c.query(`SELECT p2p_mark_paid($1::uuid)`, [orderB]);
      console.log('B: buyer marcó como pagado');
      await c.query(`SELECT p2p_release_order($1::uuid)`, [orderB]);
      console.log('B: buyer liberó');

      const snapB1 = await snapshot(c, 'B1 final');
      console.log('\nΔ Escenario B (esperado: seller -50 FXU +0.5 USDT; buyer +49.5 FXU -0.5 USDT; admin +0.25 FXU; ref_fxu=null; jackpot +0.25 FXU):');
      console.table(delta(snapB0, snapB1));
    } finally {
      await c.query(`UPDATE profiles SET referred_by=$2 WHERE id=$1`, [U_SELLER, origRef]);
      console.log(`Referrer restaurado.`);
    }

    console.log('\n✅ Escenario B completado.');
  } catch (e) {
    console.error('❌', e.message);
    process.exitCode = 1;
  } finally { await c.end(); }
})();
