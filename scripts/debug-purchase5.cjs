const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

async function main() {
  await c.connect();

  // Check triggers on market_transactions
  const trigs = await c.query(`
    SELECT t.tgname, p.proname, pg_get_functiondef(t.tgfoid) as funcdef
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'market_transactions'::regclass
  `);
  console.log('Triggers on market_transactions:');
  trigs.rows.forEach(r => {
    console.log('\n  Trigger:', r.tgname);
    console.log('  Function:', r.proname);
    console.log('  Source:', r.funcdef);
  });

  // Check market_transactions columns
  const cols = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'market_transactions'
    ORDER BY ordinal_position
  `);
  console.log('\nmarket_transactions columns:');
  cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  await c.end();
}
main().catch(e => { console.error(e); c.end(); });
