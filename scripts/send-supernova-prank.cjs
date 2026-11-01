const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Get user id and admin id
  const user = await c.query(`SELECT id, username FROM profiles WHERE LOWER(email) = 'yecoho@gmail.com'`);
  const admin = await c.query(`SELECT id FROM profiles WHERE is_admin = true LIMIT 1`);

  if (!user.rows.length) { console.log('User not found'); return; }

  const userId = user.rows[0].id;
  const adminId = admin.rows[0].id;
  console.log(`Sending to: ${user.rows[0].username} (${userId})`);

  const subject = '⚠️ ALERTA CRÍTICA: Fase Terminal Estelar Detectada';
  const body = `🔴 SISTEMA DE MONITOREO ESTELAR — ALERTA NIVEL OMEGA 🔴

Comandante, nuestros sensores han detectado una anomalía crítica en la estrella principal de su sistema solar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ☀️ DIAGNÓSTICO ESTELAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Estado: 🔴 FASE TERMINAL
  Temperatura del núcleo: 15,700,000,000 °K (CRÍTICA)
  Masa restante de hidrógeno: 0.003%
  Expansión: +847% en las últimas 2 horas
  Radiación gamma: ⬆️ 12,400% sobre lo normal
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏰ TIEMPO ESTIMADO ANTES DE SUPERNOVA: ~12 HORAS

Su estrella ha agotado casi todo su combustible de hidrógeno y ha entrado en colapso gravitacional. Los modelos predictivos indican que en aproximadamente 12 horas se producirá una EXPLOSIÓN DE SUPERNOVA que vaporizará todo su sistema solar.

🌍 PLANETAS EN ZONA DE DESTRUCCIÓN:
  → Todos los planetas de su sistema
  → Todas las flotas estacionadas
  → Todas las estructuras y defensas

📋 RECOMENDACIONES DE EMERGENCIA:
  1. Evacúe todas las flotas inmediatamente
  2. Transfiera recursos a sistemas aliados
  3. Rece a los dioses del universo
  4. Acepte su destino cósmico

Este es un evento natural del universo. La administración no se hace responsable por pérdidas causadas por fenómenos astrofísicos.

Que la galaxia lo recuerde, Comandante. 🫡

— Sistema de Alerta Astronómica de Falco-Xnova 🔭`;

  const result = await c.query(`
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES ($1, $2, $3, $4, 'system')
    RETURNING id, created_at
  `, [userId, adminId, subject, body]);

  console.log('✅ Mensaje enviado!', result.rows[0]);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
