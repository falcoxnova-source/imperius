// ============================================================================
// EJECUTAR RESET COMPLETO DEL JUEGO
// Uso: node reset_game.mjs
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ⚠️  CONFIGURACIÓN - Cambia esto según tu entorno
const SUPABASE_URL = 'https://hhrgcnvydmjqcevgmlhj.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_PON_TU_CLAVE_AQUI'; // Secret key (NUNCA en frontend)

const ADMIN_USERNAME = 'admin'; // Cambiar si el admin tiene otro nombre

// ============================================================================
// SCRIPT PRINCIPAL
// ============================================================================

async function main() {
  console.log('============================================');
  console.log('FALCO-X UNIVERSO - RESET COMPLETO DEL JUEGO');
  console.log('============================================\n');

  // Conexión directa a PostgreSQL (más rápida para este tipo de operación)
  const { Client } = await import('pg');
  
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.DB_PASSWORD || 'Jfs.sankey.1989*',
  });

  try {
    console.log('📡 Conectando a la base de datos...');
    await client.connect();
    console.log('✅ Conexión establecida\n');

    // Leer el script SQL
    const sqlPath = path.join(__dirname, 'reset_game_completo.sql');
    
    if (!fs.existsSync(sqlPath)) {
      console.error('❌ No se encontró el archivo reset_game_completo.sql');
      console.error('   Asegúrate de que esté en el mismo directorio.');
      process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('📄 Script SQL cargado (%d bytes)', sql.length);

    // ADVERTENCIA FINAL
    console.log('\n⚠️  ⚠️  ⚠️  ADVERTENCIA FINAL  ⚠️  ⚠️  ⚠️');
    console.log('Este script ELIMINARÁ PERMANENTEMENTE:');
    console.log('  - TODOS los usuarios excepto el admin');
    console.log('  - TODOS los planetas, flotas, alianzas');
    console.log('  - TODOS los mensajes, reportes de batalla');
    console.log('  - TODO el progreso del juego');
    console.log('');
    console.log('SOLO se conservará:');
    console.log('  - La cuenta admin "%s" con todo en cero', ADMIN_USERNAME);
    console.log('  - La lógica del juego (funciones, triggers, configs)');
    console.log('');

    // Ejecutar el script
    console.log('🚀 Ejecutando reset... (esto puede tomar unos segundos)\n');
    
    const startTime = Date.now();
    await client.query(sql);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ RESET COMPLETADO EXITOSAMENTE en %s segundos', elapsed);
    console.log('🎮 El juego está listo para empezar desde cero.');
    console.log('   Solo existe la cuenta admin con su planeta inicial.');

  } catch (error) {
    console.error('\n❌ ERROR durante el reset:');
    console.error('   ', error.message);
    
    if (error.message.includes('password')) {
      console.error('\n💡 La contraseña puede ser incorrecta.');
      console.error('   Define DB_PASSWORD como variable de entorno:');
      console.error('   $env:DB_PASSWORD="tu_password"; node reset_game.mjs');
    }
    
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n📡 Conexión cerrada.');
  }
}

main();
