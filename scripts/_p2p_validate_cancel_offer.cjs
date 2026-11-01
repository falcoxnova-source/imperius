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

async function snapSeller(c, label) {
  const { rows } = await c.query(`
    SELECT fxu_balance::numeric(30,8) fxu, usdt_balance::numeric(30,8) usdt
    FROM profiles WHERE id=$1
  `, [U_SELLER]);
  console.log(`\n📸 ${label}:`, rows[0]);
  return rows[0];
}
function d(a,b){return {fxu:+(b.fxu-a.fxu).toFixed(8), usdt:+(b.usdt-a.usdt).toFixed(8)};}

(async()=>{
  const c = new Client(cfg);
  await c.connect();
  try {
    const pmFXU  = (await c.query(`SELECT id FROM p2p_payment_methods WHERE code='internal_fxu'`)).rows[0].id;
    const pmUSDT = (await c.query(`SELECT id FROM p2p_payment_methods WHERE code='internal_usdt'`)).rows[0].id;
    const pmCUP  = (await c.query(`SELECT id FROM p2p_payment_methods WHERE code='cu_cup_transfer'`)).rows[0].id;

    // =======================================================
    // CASO 1: cancelar SELL FXU/USDT sin órdenes → refund asset
    // =======================================================
    console.log('\n=== CASO 1: SELL FXU→USDT cancelado sin órdenes ===');
    const s0 = await snapSeller(c, 'pre-create');
    await asUser(c, U_SELLER);
    const off1 = (await c.query(`
      SELECT p2p_create_offer('SELL','FXU','USDT',1::numeric,50::numeric,1::numeric,50::numeric,ARRAY[$1]::int[],'test cancel','CU',30) id
    `,[pmUSDT])).rows[0].id;
    const s1 = await snapSeller(c, 'post-create (bloqueó 50 FXU)');
    console.log('Δ create:', d(s0,s1));

    await c.query(`SELECT p2p_cancel_offer($1::uuid)`, [off1]);
    const s2 = await snapSeller(c, 'post-cancel');
    console.log('Δ cancel (esperado: +50 FXU):', d(s1,s2));

    const st1 = (await c.query(`SELECT status, available_amount FROM p2p_offers WHERE id=$1`,[off1])).rows[0];
    console.log('Estado final oferta:', st1);

    // =======================================================
    // CASO 2: cancelar BUY FXU/USDT sin órdenes → refund fiat interno
    // =======================================================
    console.log('\n=== CASO 2: BUY FXU con USDT cancelado sin órdenes ===');
    const b0 = await snapSeller(c, 'pre-create BUY');
    const off2 = (await c.query(`
      SELECT p2p_create_offer('BUY','FXU','USDT',0.5::numeric,10::numeric,1::numeric,10::numeric,ARRAY[$1]::int[],'test buy','CU',30) id
    `,[pmUSDT])).rows[0].id;
    const b1 = await snapSeller(c, 'post-create BUY (bloqueó 5 USDT)');
    console.log('Δ create:', d(b0,b1));

    await c.query(`SELECT p2p_cancel_offer($1::uuid)`, [off2]);
    const b2 = await snapSeller(c, 'post-cancel BUY');
    console.log('Δ cancel (esperado: +5 USDT):', d(b1,b2));

    // =======================================================
    // CASO 3: SELL FXU/CUP (fiat externo) cancelado → refund asset
    // =======================================================
    console.log('\n=== CASO 3: SELL FXU/CUP (externo) cancelado ===');
    const c0 = await snapSeller(c, 'pre-create CUP');
    const off3 = (await c.query(`
      SELECT p2p_create_offer('SELL','FXU','CUP',100::numeric,5::numeric,1::numeric,5::numeric,ARRAY[$1]::int[],'test cup cancel','CU',30) id
    `,[pmCUP])).rows[0].id;
    const c1 = await snapSeller(c, 'post-create (bloqueó 5 FXU)');
    console.log('Δ create:', d(c0,c1));

    await c.query(`SELECT p2p_cancel_offer($1::uuid)`, [off3]);
    const c2 = await snapSeller(c, 'post-cancel');
    console.log('Δ cancel (esperado: +5 FXU):', d(c1,c2));

    // =======================================================
    // CASO 4: SELL con orden activa → cancel debe fallar
    // =======================================================
    console.log('\n=== CASO 4: SELL con orden activa → cancel bloqueado ===');
    await asUser(c, U_SELLER);
    const off4 = (await c.query(`
      SELECT p2p_create_offer('SELL','FXU','USDT',1::numeric,10::numeric,1::numeric,10::numeric,ARRAY[$1]::int[],'test block','CU',30) id
    `,[pmUSDT])).rows[0].id;
    await asUser(c, U_BUYER);
    const ord4 = (await c.query(`SELECT p2p_accept_offer($1::uuid,5::numeric,$2::int,'{}'::jsonb) id`,[off4, pmUSDT])).rows[0].id;

    await asUser(c, U_SELLER);
    let blocked = false;
    try {
      await c.query(`SELECT p2p_cancel_offer($1::uuid)`, [off4]);
    } catch (e) {
      blocked = true;
      console.log('✅ Bloqueado correctamente:', e.message);
    }
    if (!blocked) console.log('❌ ERROR: cancel debería haber fallado');

    // Limpieza: expirar artificialmente la orden para dejar escenario sano
    await c.query(`UPDATE p2p_orders SET payment_deadline = now() - interval '1 minute' WHERE id=$1`, [ord4]);
    await asUser(c, U_SELLER);
    await c.query(`SELECT p2p_expire_order($1::uuid)`, [ord4]);
    // Ahora sí se puede cancelar el remanente
    await c.query(`SELECT p2p_cancel_offer($1::uuid)`, [off4]);
    const st4 = (await c.query(`SELECT status FROM p2p_offers WHERE id=$1`,[off4])).rows[0];
    console.log('Estado final oferta (tras expirar+cancel):', st4);

    console.log('\n✅ Validación completa');
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
