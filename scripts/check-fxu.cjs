const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
c.connect().then(() => c.query("SELECT username, email, fxu_balance, usdt_balance FROM profiles WHERE email = 'immichelrobinson@gmail.com'")).then(r => { console.log(r.rows); c.end(); });
