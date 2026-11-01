import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const updates = [
  ['destroy_3', 'Gana 5 batallas ofensivas hoy'],
  ['destroy_5', 'Gana 10 batallas para acelerar construcciones'],
  ['spy_3', 'Espia 5 planetas enemigos'],
  ['spy_5', 'Realiza 10 misiones de espionaje'],
  ['expedition_2', 'Completa 4 expediciones'],
  ['expedition_4', 'Completa 8 expediciones'],
  ['build_3', 'Construye 5 niveles de edificios'],
  ['build_5', 'Construye 10 niveles de edificios'],
  ['research_2', 'Completa 5 investigaciones'],
  ['research_3', 'Completa 8 investigaciones'],
  ['collect_metal_500k', 'Extrae 2M de metal'],
  ['collect_crystal_250k', 'Acumula 1M de cristal'],
];

for (const [code, desc] of updates) {
  await c.query("UPDATE daily_missions SET desc_es = $1 WHERE code = $2", [desc, code]);
}

console.log('Descripciones actualizadas sin porcentajes');
await c.end();
