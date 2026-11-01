/**
 * Migración de Supabase Cloud → PostgreSQL Local Docker
 * SOLO LECTURA de la nube. Cero escrituras en origen.
 * 
 * Uso: node scripts/migrate-cloud-to-local.mjs
 */
import { Client } from 'pg';
import { writeFileSync, existsSync } from 'fs';

// ── Cloud (SOLO LECTURA) ──
const CLOUD = {
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.lvqagudwifvytsptqjxp',
  password: 'Jfs.sankey.1989*',
  ssl: { rejectUnauthorized: false },
};

// ── Local (Docker) ──
const LOCAL = {
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'xnova123',
};

async function main() {
  console.log('🔌 Conectando a Supabase Cloud (SOLO LECTURA)...');
  const cloud = new Client(CLOUD);
  await cloud.connect();
  console.log('✅ Conectado a Cloud');

  // 1. Obtener lista de tablas (solo public, sin system tables)
  const { rows: tables } = await cloud.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename
  `);
  console.log(`📋 ${tables.length} tablas encontradas en Cloud`);

  // 2. Obtener schema (DDL)
  console.log('📦 Extrayendo estructura (schema)...');
  const schemaSQL = await dumpSchema(cloud);
  writeFileSync('docker-data/cloud_schema.sql', schemaSQL);
  console.log('   ✅ Schema guardado en docker-data/cloud_schema.sql');

  // 3. Obtener datos tabla por tabla
  console.log('📦 Extrayendo datos...');
  let dataSQL = 'BEGIN;\n\n';
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i].tablename;
    try {
      const { rows: data } = await cloud.query(`SELECT * FROM "${t}"`);
      if (data.length === 0) continue;
      
      const cols = Object.keys(data[0]);
      const values = data.map(row => {
        const vals = cols.map(c => formatValue(row[c]));
        return `(${vals.join(', ')})`;
      }).join(',\n');
      
      dataSQL += `-- Tabla: ${t} (${data.length} filas)\n`;
      dataSQL += `INSERT INTO "${t}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES\n${values};\n\n`;
      
      if ((i + 1) % 5 === 0) {
        console.log(`   ${i + 1}/${tables.length}: ${t} (${data.length} filas)`);
      }
    } catch (e) {
      console.log(`   ⚠️ ${t}: ${e.message}`);
    }
  }
  dataSQL += 'COMMIT;\n';
  writeFileSync('docker-data/cloud_data.sql', dataSQL);
  console.log(`   ✅ Datos guardados en docker-data/cloud_data.sql`);

  await cloud.end();
  console.log('\n✨ Exportación completada. Archivos en docker-data/');
}

function formatValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    // JSON/JSONB
    const str = JSON.stringify(val);
    return `'${str.replace(/'/g, "''")}'`;
  }
  // String
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function dumpSchema(client) {
  // Obtener DDL de cada tabla, vista, función, etc.
  const { rows: tables } = await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    UNION
    SELECT viewname FROM pg_views WHERE schemaname = 'public'
  `);

  let sql = '-- Schema exportado de Supabase Cloud\n-- Fecha: ' + new Date().toISOString() + '\n\n';

  for (const t of tables) {
    const name = t.tablename || t.viewname;
    try {
      const { rows: cols } = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [name]);

      if (cols.length === 0) continue;

      sql += `CREATE TABLE IF NOT EXISTS "${name}" (\n`;
      const colDefs = cols.map(c => {
        let def = `  "${c.column_name}" ${c.data_type}`;
        if (c.is_nullable === 'NO') def += ' NOT NULL';
        if (c.column_default) def += ` DEFAULT ${c.column_default}`;
        return def;
      });
      sql += colDefs.join(',\n');
      sql += '\n);\n\n';
    } catch (e) {
      // skip
    }
  }

  return sql;
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
