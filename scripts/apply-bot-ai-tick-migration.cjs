#!/usr/bin/env node
// Deploy bot_ai_tick() directly via pooler, bypassing Supabase Dashboard API.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_FILE = path.join(__dirname, '_bot_ai_tick_current.sql');

async function main() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  if (!process.env.SUPABASE_DB_PASSWORD) {
    console.error('Missing SUPABASE_DB_PASSWORD env var.');
    process.exit(1);
  }
  await client.connect();
  try {
    console.log('Applying bot_ai_tick migration...');
    await client.query(sql);
    console.log('✅ bot_ai_tick() deployed successfully.');
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
