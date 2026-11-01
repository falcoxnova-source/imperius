# Database Connection

For running SQL migrations directly on the Supabase production database:

**Host:** `aws-1-us-east-1.pooler.supabase.com`
**Port:** `6543`
**Database:** `postgres`
**User:** `postgres.lvqagudwifvytsptqjxp`

Connection string format:
```
postgresql://postgres.lvqagudwifvytsptqjxp:PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

**Project ref:** `lvqagudwifvytsptqjxp`

## How to run a migration

The `pg` Node.js module is available in the project. Run:
```js
node -e "
const {Client} = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('MIGRATION_FILE_PATH', 'utf8');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'THE_PASSWORD',
});
(async () => {
  await client.connect();
  await client.query(sql);
  console.log('Migration completed!');
  await client.end();
})().catch(e => { console.error(e.message); process.exit(1); });
"
```

The password is NOT needed in AGENTS.md — the user provides it when needed.
