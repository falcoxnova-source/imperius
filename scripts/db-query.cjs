/**
 * Database Query Helper - Falco-Xnova
 * Usage: node scripts/db-query.cjs "SELECT * FROM profiles LIMIT 5"
 * Usage with file: node scripts/db-query.cjs --file path/to/query.sql
 */
const { Client } = require('pg');
const fs = require('fs');

const DB_CONFIG = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
};

async function runQuery(sql) {
  const client = new Client(DB_CONFIG);
  try {
    await client.connect();
    const result = await client.query(sql);
    if (result.rows && result.rows.length > 0) {
      console.table(result.rows);
      console.log(`\n--- ${result.rowCount} row(s) returned ---`);
    } else if (result.command) {
      console.log(`Command: ${result.command} | Rows affected: ${result.rowCount}`);
    } else {
      console.log('Query executed successfully (no rows returned).');
    }
  } catch (err) {
    console.error('Query Error:', err.message);
  } finally {
    await client.end();
  }
}

let query;
if (process.argv[2] === '--file' && process.argv[3]) {
  query = fs.readFileSync(process.argv[3], 'utf8');
} else {
  query = process.argv[2];
}

if (!query) {
  console.error('Usage: node scripts/db-query.cjs "SQL QUERY"');
  console.error('       node scripts/db-query.cjs --file path/to/query.sql');
  process.exit(1);
}

runQuery(query);
