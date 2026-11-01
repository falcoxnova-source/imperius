// Continuación: libera orden A stuck y ejecuta escenario B.
const { Client } = require('pg');

const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

const U_SELLER = 'ec4e0d03-2c15-4bce-b741-150d71e3e7da'; // Argonat
const U_BUYER  = '1974ffcb-d11e-4f8d-a6e0-0944fc8af33d'; // Glazlan

async function asUser(c, uid) { await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid]); }

async function snapshot(c, label) {
  const { rows } = await c.query(`
    SELECT
      (SELECT fxu_balance::numeric(30,8)  FROM profiles WHERE id=$1) AS seller_fxu,
      (SELECT usdt_balance::numeric(30,8) FROM profiles WHERE id=$1) AS seller_usdt,
      (SELECT fxu_balance::numeric(30,8)  FROM profiles WHERE id=$2) AS buyer_fxu,
      (SELECT usdt_balance::numeric(30,8) FROM profiles WHERE id=$2) AS buyer_usdt,
      (SELECT fxu_balance::numeric(30,8)  FROM profiles WHERE is_admin=true ORDER BY created_at ASC LIMIT 1) AS admin_fxu,
      (SELECT usdt_balance::numeric(30,8) FROM profiles WHERE is_admin=true ORDER BY created_at ASC LIMIT 1) AS admin_usdt,
      (SELECT fxu_balance::numeric(30,8)  FROM profiles WHERE id=(SELECT referred_by FROM profiles WHERE id=$1)) AS ref_fxu,
      (SELECT usdt_balance::numeric(30,8) FROM profiles WHERE id=(SELECT referred_by FROM profiles WHERE id=$1)) AS ref_usdt,
      (SELECT balance::numeric(30,8)      FROM jackpot LIMIT 1) AS jackpot
  `, [U_SELLER, U_BUYER]);
  console.log(`\n📸 ${label}`); console.table(rows[0]); return rows[0];
}

function delta(b, a) {
  const d = {};
  for (const k of Object.keys(b)) { const v = +(Number(a[k]||0) - Number(b[k]||0)).toFixed(8); if (Math.abs(v) > 1e-10) d[k] = v; }
  return d;
}

// Snapshot A0 registrado antes (run previo)
const A0 = {
  seller_fxu:  38410.81668907,
  seller_usdt: 10.91542484,
  buyer_fxu:   934.67214200,
  buyer_usdt:  10.00000000,
  admin_fxu:   2477.49856398,
  admin_usdt:  63.82085955,
  ref_fxu:     23919.00000000,
  ref_usdt:    3.30055146,
  jackpot:     1245846.00000000,
};

(async () => {
  const c = new Client(cfg); await c.connect();
  try {
    // Encontrar orden A stuck (status='paid' del seller U_SELLER)
    const stuck = await c.query(`
      SELECT o.id, o.status, o.asset_amount, o.fiat_amount, o.fee_asset, o.fiat_currency, o.asset
      FROM p2p_orders o
      WHERE o.seller_id=$1 AND o.status='paid'
      ORDER BY o.created_at DESC LIMIT 1
    `, [U_SELLER]);
    if (stuck.rows.length === 0) {
      console.log('No hay orden stuck — probablemente ya fue liberada.');
    } else {
      const ordA = stuck.rows[0].id;
      console.log('Orden A stuck:', stuck.rows[0]);
      await asUser(c, U_SELLER);
      await c.query(`SELECT p2p_release_order($1::uuid)`, [ordA]);
      console.log('✅ Orden A liberada');
    }

    const snapA1 = await snapshot(c, 'A1 final (post release)');
    console.log('\nΔ Escenario A (esperado: seller -100 FXU +1 USDT; buyer +99 FXU -1 USDT; admin +0.5 FXU; ref +0.05 FXU; jackpot +0.45 FXU):');
    console.table(delta(A0, snapA1));

    // ==================== Escenario B ====================
    console.log('\n========== ESCENARIO B: BUY (sin referrer) ==========');

    const origRef = (await c.query(`SELECT referred_by FROM profiles WHERE id=$1`, [U_SELLER])).rows[0].referred_by;
    await c.query(`UPDATE profiles SET referred_by=NULL WHERE id=$1`, [U_SELLER]);
    console.log(`Referrer de U_SELLER removido temporalmente (original=${origRef})`);

    try {
      const snapB0 = await snapshot(c, 'B0 inicial');
      const pmId = (await c.query(`SELECT id FROM p2p_payment_methods WHERE code='internal_usdt' AND is_enabled=true`)).rows[0].id;

      await asUser(c, U_BUYER);
      const offB = await c.query(`
        SELECT p2p_create_offer('BUY','FXU','USDT',0.01::numeric,50::numeric,10::numeric,50::numeric,
          ARRAY[$1]::int[], 'test BUY B', 'XX', 30) AS id
      `, [pmId]);
      const offerB = offB.rows[0].id;
      console.log('Offer BUY:', offerB);

      await asUser(c, U_SELLER);
      const ordB = await c.query(`SELECT p2p_accept_offer($1::uuid, 50::numeric, $2::int, '{}'::jsonb) AS id`, [offerB, pmId]);
      const orderB = ordB.rows[0].id;
      console.log('Order B:', orderB);

      await c.query(`SELECT p2p_mark_paid($1::uuid)`, [orderB]);
      console.log('B: seller marcó como pagado (asset enviado)');

      await asUser(c, U_BUYER);
      await c.query(`SELECT p2p_release_order($1::uuid)`, [orderB]);
      console.log('B: buyer liberó escrow fiat');

      const snapB1 = await snapshot(c, 'B1 final');
      console.log('\nΔ Escenario B (esperado: seller -50 FXU +0.5 USDT; buyer +49.5 FXU -0.5 USDT; admin +0.25 FXU; ref +0; jackpot +0.25 FXU):');
      console.table(delta(snapB0, snapB1));
    } finally {
      await c.query(`UPDATE profiles SET referred_by=$2 WHERE id=$1`, [U_SELLER, origRef]);
      console.log(`Referrer restaurado.`);
    }

    console.log('\n✅ Pruebas completadas.');
  } catch (e) {
    console.error('❌', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally { await c.end(); }
})();
