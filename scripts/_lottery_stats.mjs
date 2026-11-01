import pg from 'pg';
const c = new pg.Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
await c.connect();
const r = await c.query(`SELECT COUNT(*)::int AS w FROM lottery_winners`);
console.log('lottery_winners:', r.rows[0]);
const r3 = await c.query(`SELECT relname, n_live_tup, n_dead_tup, n_tup_ins, n_tup_del, last_vacuum, last_autovacuum FROM pg_stat_user_tables WHERE relname LIKE 'lottery%'`);
console.table(r3.rows);
await c.end();
