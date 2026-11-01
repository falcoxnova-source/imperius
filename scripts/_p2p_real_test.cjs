// Prueba real P2P v2: SELL (con referrer) + BUY (sin referrer)
// Impersona auth.uid() via set_config('request.jwt.claim.sub', ...).
const { Client } = require('pg');

const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

const U_SELLER = 'ec4e0d03-2c15-4bce-b741-150d71e3e7da'; // Argonat (ref: 046c...)
const U_BUYER  = '1974ffcb-d11e-4f8d-a6e0-0944fc8af33d'; // Glazlan (ref: 046c...)

async function asUser(c, uid) {
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid]);
}
async function clearUser(c) {
  await c.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
}

async function snapshot(c, label) {
  const q = `
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
  `;
  const { rows } = await c.query(q, [U_SELLER, U_BUYER]);
  console.log(`\n📸 ${label}`);
  console.table(rows[0]);
  return rows[0];
}

function delta(before, after) {
  const d = {};
  for (const k of Object.keys(before)) {
    const a = Number(after[k] || 0), b = Number(before[k] || 0);
    const v = +(a - b).toFixed(8);
    if (Math.abs(v) > 1e-10) d[k] = v;
  }
  return d;
}

(async () => {
  const c = new Client(cfg);
  await c.connect();
  try {
    // ============================================================
    // Escenario A: SELL FXU @ 0.01 USDT (con referrer)
    // ============================================================
    console.log('\n========== ESCENARIO A: SELL (con referrer) ==========');
    const snapA0 = await snapshot(c, 'A0 inicial');

    await asUser(c, U_SELLER);
    const payMethod = await c.query(`SELECT id FROM p2p_payment_methods WHERE code='internal_usdt' AND is_enabled=true`);
    const pmId = payMethod.rows[0].id;
    const pmFxu = (await c.query(`SELECT id FROM p2p_payment_methods WHERE code='internal_fxu' AND is_enabled=true`)).rows[0].id;

    // SELL 100 FXU @ 0.01 USDT/FXU, fiat_currency = USDT
    const offA = await c.query(`
      SELECT p2p_create_offer(
        'SELL','FXU','USDT',
        0.01::numeric, 100::numeric, 10::numeric, 100::numeric,
        ARRAY[$1]::int[], 'test SELL A', 'XX', 30
      ) AS id
    `, [pmId]);
    const offerA = offA.rows[0].id;
    console.log('Offer SELL creada:', offerA);

    await asUser(c, U_BUYER);
    const ordA = await c.query(`
      SELECT p2p_accept_offer($1::uuid, 100::numeric, $2::int, '{}'::jsonb) AS id
    `, [offerA, pmId]);
    const orderA = ordA.rows[0].id;
    console.log('Order A:', orderA);

    await c.query(`SELECT p2p_mark_paid($1::uuid)`, [orderA]);
    console.log('A: buyer marcó como pagado');

    await asUser(c, U_SELLER);
    await c.query(`SELECT p2p_release_order($1::uuid)`, [orderA]);
    console.log('A: seller liberó');

    const snapA1 = await snapshot(c, 'A1 final');
    console.log('\nΔ Escenario A (esperado: fee 1 FXU → admin 0.50, ref 0.05, pool/jackpot 0.45):');
    console.table(delta(snapA0, snapA1));

    // ============================================================
    // Escenario B: BUY FXU @ 0.01 USDT (sin referrer)
    // ============================================================
    console.log('\n========== ESCENARIO B: BUY (sin referrer) ==========');

    // Temporal: quitar referrer al seller (U_SELLER es el TAKER en BUY, y el seller de la orden es el taker)
    const origRef = (await c.query(`SELECT referred_by FROM profiles WHERE id=$1`, [U_SELLER])).rows[0].referred_by;
    await c.query(`UPDATE profiles SET referred_by=NULL WHERE id=$1`, [U_SELLER]);
    console.log(`Referrer de U_SELLER temporalmente removido (original=${origRef})`);

    try {
      const snapB0 = await snapshot(c, 'B0 inicial');

      // Glazlan crea BUY offer (locks USDT): quiere comprar 50 FXU a 0.01 USDT = 0.50 USDT escrow
      await asUser(c, U_BUYER);
      const offB = await c.query(`
        SELECT p2p_create_offer(
          'BUY','FXU','USDT',
          0.01::numeric, 50::numeric, 10::numeric, 50::numeric,
          ARRAY[$1]::int[], 'test BUY B', 'XX', 30
        ) AS id
      `, [pmId]);
      const offerB = offB.rows[0].id;
      console.log('Offer BUY creada:', offerB);

      // Argonat (seller taker) acepta
      await asUser(c, U_SELLER);
      const ordB = await c.query(`
        SELECT p2p_accept_offer($1::uuid, 50::numeric, $2::int, '{}'::jsonb) AS id
      `, [offerB, pmId]);
      const orderB = ordB.rows[0].id;
      console.log('Order B:', orderB);

      // En BUY: seller marca paid (envió asset fuera de cadena conceptualmente; aquí el release debita del seller)
      await c.query(`SELECT p2p_mark_paid($1::uuid)`, [orderB]);
      console.log('B: seller marcó como pagado');

      // Buyer (dueño del offer) libera
      await asUser(c, U_BUYER);
      await c.query(`SELECT p2p_release_order($1::uuid)`, [orderB]);
      console.log('B: buyer liberó');

      const snapB1 = await snapshot(c, 'B1 final');
      console.log('\nΔ Escenario B (esperado: fee 0.5 FXU → admin 0.25, ref 0, pool/jackpot 0.25):');
      console.table(delta(snapB0, snapB1));
    } finally {
      await c.query(`UPDATE profiles SET referred_by=$2 WHERE id=$1`, [U_SELLER, origRef]);
      console.log(`Referrer restaurado a ${origRef}`);
    }

    await clearUser(c);
    console.log('\n✅ Pruebas completadas.');
  } catch (e) {
    console.error('\n❌ Error en prueba:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
