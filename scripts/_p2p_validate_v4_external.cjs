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

async function snap(c, label) {
  const { rows } = await c.query(`
    SELECT
      (SELECT fxu_balance::numeric(30,8) FROM profiles WHERE id=$1) seller_fxu,
      (SELECT usdt_balance::numeric(30,8) FROM profiles WHERE id=$1) seller_usdt,
      (SELECT fxu_balance::numeric(30,8) FROM profiles WHERE id=$2) buyer_fxu,
      (SELECT usdt_balance::numeric(30,8) FROM profiles WHERE id=$2) buyer_usdt,
      (SELECT fxu_balance::numeric(30,8) FROM profiles WHERE is_admin=true ORDER BY created_at ASC LIMIT 1) admin_fxu,
      (SELECT balance::numeric(30,8) FROM jackpot LIMIT 1) jackpot
  `, [U_SELLER, U_BUYER]);
  console.log(`\n📸 ${label}`);
  console.table(rows[0]);
  return rows[0];
}

function delta(a,b){const d={};Object.keys(a).forEach(k=>{const v=+(Number(b[k]||0)-Number(a[k]||0)).toFixed(8);if(Math.abs(v)>1e-10)d[k]=v;});return d;}

(async()=>{
  const c = new Client(cfg);
  await c.connect();
  try {
    const pmCUP = (await c.query(`SELECT id FROM p2p_payment_methods WHERE code='cu_cup_transfer'`)).rows[0].id;

    const s0 = await snap(c, 'inicio');

    await asUser(c, U_SELLER);
    const offer = (await c.query(`
      SELECT p2p_create_offer('SELL','FXU','CUP',100::numeric,10::numeric,1::numeric,10::numeric,ARRAY[$1]::int[],'SELL externo test','CU',30) id
    `,[pmCUP])).rows[0].id;

    await asUser(c, U_BUYER);
    const order = (await c.query(`SELECT p2p_accept_offer($1::uuid,10::numeric,$2::int,'{}'::jsonb) id`,[offer,pmCUP])).rows[0].id;
    await c.query(`SELECT p2p_mark_paid($1::uuid)`,[order]);

    await asUser(c, U_SELLER);
    await c.query(`SELECT p2p_release_order($1::uuid)`,[order]);

    const s1 = await snap(c, 'final');
    console.log('\nΔ (SELL FXU/CUP esperado: seller -10 FXU, buyer +9.9 FXU, sin movimiento USDT interno):');
    console.table(delta(s0,s1));
  } finally {
    await c.end();
  }
})().catch(e=>{console.error('❌',e.message);process.exit(1);});
