import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

await c.query("UPDATE daily_missions SET target_count = 5, title_es = 'Conquista 5 Batallas', desc_es = 'Gana 5 batallas ofensivas hoy y aumenta tu produccion un 20% por 24h' WHERE code = 'destroy_3'");
await c.query("UPDATE daily_missions SET target_count = 10, title_es = 'Maestro de la Guerra', desc_es = 'Gana 10 batallas para acelerar construcciones un 25% durante 12h' WHERE code = 'destroy_5'");
await c.query("UPDATE daily_missions SET target_count = 5, title_es = 'Ojos en Todas Partes', desc_es = 'Espia 5 planetas enemigos y mejora tu produccion un 15%' WHERE code = 'spy_3'");
await c.query("UPDATE daily_missions SET target_count = 10, title_es = 'Maestro del Espionaje', desc_es = 'Realiza 10 misiones de espionaje para acelerar investigaciones' WHERE code = 'spy_5'");
await c.query("UPDATE daily_missions SET target_count = 4, title_es = 'Explorador Estelar', desc_es = 'Completa 4 expediciones y potencia tu economia un 25%' WHERE code = 'expedition_2'");
await c.query("UPDATE daily_missions SET target_count = 8, title_es = 'Conquistador del Universo', desc_es = '8 expediciones para obtener un 30% de velocidad en todo' WHERE code = 'expedition_4'");
await c.query("UPDATE daily_missions SET target_count = 5, title_es = 'Arquitecto Galactico', desc_es = 'Construye 5 niveles de edificios y mejora tu produccion' WHERE code = 'build_3'");
await c.query("UPDATE daily_missions SET target_count = 10, title_es = 'Constructo Imparable', desc_es = '10 niveles de edificios para acelerar tu imperio' WHERE code = 'build_5'");
await c.query("UPDATE daily_missions SET target_count = 5, title_es = 'Cientifico Estelar', desc_es = 'Completa 5 investigaciones para mejorar tu produccion' WHERE code = 'research_2'");
await c.query("UPDATE daily_missions SET target_count = 8, title_es = 'Mente Brillante', desc_es = '8 investigaciones para acelerar tu progreso tecnologico' WHERE code = 'research_3'");
await c.query("UPDATE daily_missions SET target_count = 2000000, title_es = 'Minero Incansable', desc_es = 'Extrae 2M de metal para obtener velocidad de construccion' WHERE code = 'collect_metal_500k'");
await c.query("UPDATE daily_missions SET target_count = 1000000, title_es = 'Cazador de Cristal', desc_es = 'Acumula 1M de cristal y potencia tus minas un 20%' WHERE code = 'collect_crystal_250k'");

const r = await c.query("SELECT code, mission_type, target_count FROM daily_missions ORDER BY id");
console.log('Misiones actualizadas:');
r.rows.forEach(row => console.log(`  ${row.code}: ${row.target_count}`));

await c.end();
