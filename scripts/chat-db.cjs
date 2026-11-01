#!/usr/bin/env node
/**
 * chat-db.cjs — Helper unificado de conexión a Supabase (PostgreSQL Pooler).
 *
 * Uso desde la línea de comandos:
 *   node scripts/chat-db.cjs "SELECT now();"
 *   node scripts/chat-db.cjs --file ruta/al/archivo.sql
 *   node scripts/chat-db.cjs --tables                # lista todas las tablas (schema public)
 *   node scripts/chat-db.cjs --describe nombre_tabla # describe columnas
 *
 * Uso programático:
 *   const { withClient, query } = require('./scripts/chat-db.cjs');
 *   await query('SELECT * FROM users LIMIT 5');
 *
 * Las credenciales se leen de variables de entorno (.env) y, como fallback,
 * de los valores hardcodeados (mismos que ya usan el resto de scripts del
 * proyecto). Esto permite que el chat (Copilot) ejecute consultas rápidas
 * contra la BD sin tener que repetir las credenciales en cada llamada.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Cargar .env si existe (sin depender de dotenv).
(() => {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) return;
      const k = m[1];
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    });
  } catch { /* noop */ }
})();

const config = {
  host: process.env.PGHOST || 'aws-1-eu-north-1.pooler.supabase.com',
  port: Number(process.env.PGPORT || 6543),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres.hhrgcnvydmjqcevgmlhj',
  password: process.env.PGPASSWORD || 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

async function withClient(fn) {
  const client = new Client(config);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function query(sql, params = []) {
  return withClient((c) => c.query(sql, params));
}

function printResult(res) {
  if (Array.isArray(res)) {
    res.forEach((r, i) => {
      console.log(`\n── Resultado #${i + 1} (${r.rowCount ?? r.rows.length} filas) ──`);
      console.table(r.rows);
    });
  } else {
    console.log(`\n── ${res.rowCount ?? res.rows.length} filas ──`);
    if (res.rows.length) console.table(res.rows);
    else console.log('(sin filas)');
  }
}

async function cli() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.log('Uso: node scripts/chat-db.cjs "SQL" | --file f.sql | --tables | --describe tabla');
    process.exit(0);
  }

  let sql;
  if (argv[0] === '--file') {
    sql = fs.readFileSync(argv[1], 'utf8');
  } else if (argv[0] === '--tables') {
    sql = `SELECT table_schema, table_name
             FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
            ORDER BY table_schema, table_name;`;
  } else if (argv[0] === '--describe') {
    sql = `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position;`;
    const res = await query(sql, [argv[1]]);
    printResult(res);
    return;
  } else {
    sql = argv.join(' ');
  }

  const res = await query(sql);
  printResult(res);
}

if (require.main === module) {
  cli().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
}

module.exports = { withClient, query, config };
