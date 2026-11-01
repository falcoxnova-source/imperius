/**
 * FALCO-X UNIVERSO - Database Migration Script
 * 
 * Script para exportar TODA la base de datos de Supabase/Bolt
 * y generar un archivo SQL compatible con PostgreSQL 16+
 * 
 * USO:
 *   npx tsx scripts/migrate-database.ts
 * 
 * REQUISITOS:
 *   - Node.js 18+
 *   - Variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
 *   - O pasar las credenciales como argumentos
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const CONFIG = {
  // Tamaño de batch para exports grandes
  BATCH_SIZE: 1000,
  // Directorio de salida
  OUTPUT_DIR: './exports',
  // Nombre del archivo
  OUTPUT_FILE: `falco_xnova_full_export_${new Date().toISOString().split('T')[0]}.sql`,
};

// ============================================================================
// ORDEN DE TABLAS (por dependencias de FK)
// ============================================================================

const TABLE_ORDER: string[] = [
  // === CONFIGURACIONES DEL SISTEMA (sin FK) ===
  'game_settings',
  'admin_speed_settings',
  'admin_smtp_settings',
  'admin_telegram_config',
  'admin_telegram_settings',
  'telegram_config',
  'wallet_config',
  'jackpot_config',
  'market_notification_config',

  // === TIPOS Y DEFINICIONES DEL JUEGO (sin FK) ===
  'building_types',
  'technology_types',
  'ship_types',
  'defense_types',
  'officer_types',
  'supply_boxes',
  'plus_plans',
  'telegram_groups',

  // === REQUISITOS (FK a tipos) ===
  'building_requirements',
  'technology_requirements',
  'ship_requirements',
  'defense_requirements',

  // === USUARIOS Y PERFILES ===
  'profiles',
  'user_wallets',
  'telegram_links',
  'email_verification_tokens',
  'login_sessions',
  'telegram_task_rewards',

  // === GAME ROUNDS ===
  'game_rounds',

  // === ALIANZAS ===
  'alliances',
  'alliance_members',
  'alliance_applications',
  'alliance_diplomacy',

  // === PLANETAS Y RECURSOS ===
  'planets',
  'planet_resources',
  'planet_buildings',
  'planet_ships',
  'planet_defenses',
  'galaxy_positions',

  // === TECNOLOGÍAS Y OFICIALES ===
  'user_technologies',
  'user_officers',

  // === COLAS DE CONSTRUCCIÓN ===
  'building_queue',
  'shipyard_queue',
  'research_queue',

  // === FLOTAS ===
  'fleets',
  'fleet_ships',
  'acs_fleets',
  'acs_participants',
  'debris_fields',

  // === COMUNICACIONES ===
  'messages',
  'public_chat_messages',
  'battle_reports',

  // === MERCADO ===
  'market_listings',
  'market_transactions',

  // === FINANZAS ===
  'wallet_transactions',
  'referral_commissions',
  'admin_revenue',
  'admin_expenses',
  'admin_withdrawals',

  // === JACKPOT ===
  'jackpot',
  'jackpot_pools',
  'jackpot_history',

  // === PLUS/PREMIUM ===
  'plus_subscriptions',
  'plus_pending_rewards',
  'plus_commission_rewards',
  'plus_commission_distributions',

  // === SUPPLY BOXES ===
  'supply_box_purchases',

  // === RANKINGS ===
  'monthly_ranking_rewards',
  'monthly_ranking_distributions',
  'hall_of_fame_records',
  'hall_of_fame_players',
  'hall_of_fame_alliances',

  // === LOGS Y SEGURIDAD ===
  'account_interaction_log',
  'attack_log',
  'multiaccounting_reports',
  'suspicious_accounts',
];

// ============================================================================
// UTILIDADES SQL
// ============================================================================

function escapeString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '');
}

function formatValue(value: unknown, columnName?: string): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return 'NULL';
    }
    return String(value);
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  if (Array.isArray(value)) {
    // Arrays JSON
    return `'${escapeString(JSON.stringify(value))}'::jsonb`;
  }

  if (typeof value === 'object') {
    // Objetos JSON
    return `'${escapeString(JSON.stringify(value))}'::jsonb`;
  }

  const strValue = String(value);

  // Detectar UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strValue)) {
    return `'${strValue}'`;
  }

  // Detectar timestamp ISO
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(strValue)) {
    return `'${escapeString(strValue)}'`;
  }

  // String normal
  return `'${escapeString(strValue)}'`;
}

function generateInsertStatements(tableName: string, rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];

  const statements: string[] = [];
  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map(c => `"${c}"`).join(', ');

  // Generar INSERTs individuales para mejor compatibilidad
  for (const row of rows) {
    const values = columns.map(col => formatValue(row[col], col)).join(', ');
    statements.push(`INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${values});`);
  }

  return statements;
}

// ============================================================================
// CLASE PRINCIPAL DE MIGRACIÓN
// ============================================================================

class DatabaseMigrator {
  private supabase: SupabaseClient;
  private output: string[] = [];
  private stats: { table: string; count: number }[] = [];
  private errors: string[] = [];

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  private log(message: string): void {
    console.log(`[MIGRATE] ${message}`);
  }

  private addSQL(sql: string): void {
    this.output.push(sql);
  }

  private async getExistingTables(): Promise<Set<string>> {
    // Intentar obtener lista de tablas
    const { data, error } = await this.supabase.rpc('get_all_public_tables');
    
    if (error || !data) {
      this.log('⚠️  No se pudo obtener lista de tablas, usando lista predefinida');
      return new Set(TABLE_ORDER);
    }

    return new Set(data.map((r: { table_name: string }) => r.table_name));
  }

  private async exportTable(tableName: string): Promise<number> {
    this.log(`📦 Exportando: ${tableName}`);

    try {
      // Obtener todos los datos
      const { data, error, count } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact' });

      if (error) {
        this.errors.push(`${tableName}: ${error.message}`);
        this.log(`   ❌ Error: ${error.message}`);
        return 0;
      }

      if (!data || data.length === 0) {
        this.log(`   ⏭️  Tabla vacía`);
        this.addSQL(`-- Table: ${tableName} (0 rows)`);
        this.addSQL(`DELETE FROM "${tableName}";`);
        this.addSQL('');
        return 0;
      }

      // Generar SQL
      this.addSQL(`-- ========================================`);
      this.addSQL(`-- Table: ${tableName}`);
      this.addSQL(`-- Records: ${data.length}`);
      this.addSQL(`-- ========================================`);
      this.addSQL(`DELETE FROM "${tableName}";`);

      const inserts = generateInsertStatements(tableName, data);
      for (const insert of inserts) {
        this.addSQL(insert);
      }

      this.addSQL('');
      this.log(`   ✅ ${data.length} registros`);
      
      return data.length;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.errors.push(`${tableName}: ${errMsg}`);
      this.log(`   ❌ Excepción: ${errMsg}`);
      return 0;
    }
  }

  async run(): Promise<void> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    this.log('🚀 Iniciando migración de base de datos...');
    this.log(`📅 Timestamp: ${timestamp}`);

    // Header del archivo SQL
    this.addSQL('-- ================================================================');
    this.addSQL('-- FALCO-X UNIVERSO - FULL DATABASE EXPORT');
    this.addSQL('-- ================================================================');
    this.addSQL(`-- Generated: ${timestamp}`);
    this.addSQL('-- Target: PostgreSQL 16+');
    this.addSQL('-- ================================================================');
    this.addSQL('');
    this.addSQL('-- INSTRUCCIONES DE RESTAURACIÓN:');
    this.addSQL('-- 1. Asegurar que PostgreSQL 16 está instalado');
    this.addSQL('-- 2. Crear la base de datos: CREATE DATABASE xnova;');
    this.addSQL('-- 3. Ejecutar TODAS las migraciones primero (carpeta supabase/migrations)');
    this.addSQL('-- 4. Conectar como superusuario: psql -U postgres -d xnova');
    this.addSQL('-- 5. Ejecutar este script: \\i /ruta/a/este/archivo.sql');
    this.addSQL('-- ================================================================');
    this.addSQL('');
    this.addSQL('\\set ON_ERROR_STOP on');
    this.addSQL('');
    this.addSQL('BEGIN;');
    this.addSQL('');
    this.addSQL('-- Deshabilitar triggers y FK durante la importación');
    this.addSQL("SET session_replication_role = 'replica';");
    this.addSQL('SET CONSTRAINTS ALL DEFERRED;');
    this.addSQL('');

    // Obtener tablas existentes
    const existingTables = await this.getExistingTables();
    this.log(`📋 Tablas encontradas: ${existingTables.size}`);

    // Ordenar tablas
    const tablesToExport: string[] = [];
    for (const table of TABLE_ORDER) {
      if (existingTables.has(table)) {
        tablesToExport.push(table);
      }
    }
    // Agregar tablas que existen pero no están en el orden
    for (const table of existingTables) {
      if (!tablesToExport.includes(table)) {
        tablesToExport.push(table);
      }
    }

    this.log(`📊 Exportando ${tablesToExport.length} tablas...`);
    this.addSQL(`-- Total tables to export: ${tablesToExport.length}`);
    this.addSQL('');

    // Exportar cada tabla
    let totalRecords = 0;
    for (const table of tablesToExport) {
      const count = await this.exportTable(table);
      if (count > 0) {
        this.stats.push({ table, count });
        totalRecords += count;
      }
    }

    // Reset de secuencias
    this.addSQL('-- ================================================================');
    this.addSQL('-- RESET DE SECUENCIAS');
    this.addSQL('-- ================================================================');
    this.addSQL('');
    
    for (const stat of this.stats) {
      this.addSQL(`-- Reset sequence for ${stat.table}`);
      this.addSQL(`DO $$ BEGIN`);
      this.addSQL(`  PERFORM setval(pg_get_serial_sequence('"${stat.table}"', 'id'),`);
      this.addSQL(`    COALESCE((SELECT MAX(id) FROM "${stat.table}"), 1), true);`);
      this.addSQL(`EXCEPTION WHEN OTHERS THEN NULL;`);
      this.addSQL(`END $$;`);
    }
    this.addSQL('');

    // Finalizar transacción
    this.addSQL('-- Re-habilitar triggers y constraints');
    this.addSQL('SET CONSTRAINTS ALL IMMEDIATE;');
    this.addSQL("SET session_replication_role = 'origin';");
    this.addSQL('');
    this.addSQL('COMMIT;');
    this.addSQL('');

    // Queries de verificación
    this.addSQL('-- ================================================================');
    this.addSQL('-- QUERIES DE VERIFICACIÓN');
    this.addSQL('-- ================================================================');
    this.addSQL('-- Ejecutar después de importar para verificar:');
    this.addSQL('');
    for (const stat of this.stats) {
      this.addSQL(`-- SELECT '${stat.table}' as tabla, COUNT(*) as actual, ${stat.count} as esperado FROM "${stat.table}";`);
    }
    this.addSQL('');

    // Resumen
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    this.addSQL('-- ================================================================');
    this.addSQL('-- RESUMEN DE EXPORTACIÓN');
    this.addSQL('-- ================================================================');
    this.addSQL(`-- Timestamp: ${timestamp}`);
    this.addSQL(`-- Tiempo de ejecución: ${elapsed}s`);
    this.addSQL(`-- Total tablas: ${tablesToExport.length}`);
    this.addSQL(`-- Tablas con datos: ${this.stats.length}`);
    this.addSQL(`-- Total registros: ${totalRecords.toLocaleString()}`);
    this.addSQL('--');
    this.addSQL('-- CONTEO POR TABLA:');
    for (const stat of this.stats.sort((a, b) => b.count - a.count)) {
      this.addSQL(`--   ${stat.table}: ${stat.count.toLocaleString()} filas`);
    }
    if (this.errors.length > 0) {
      this.addSQL('--');
      this.addSQL('-- ERRORES:');
      for (const err of this.errors) {
        this.addSQL(`--   ⚠️ ${err}`);
      }
    }
    this.addSQL('-- ================================================================');

    // Guardar archivo
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
      fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }

    const outputPath = path.join(CONFIG.OUTPUT_DIR, CONFIG.OUTPUT_FILE);
    fs.writeFileSync(outputPath, this.output.join('\n'), 'utf-8');

    this.log('');
    this.log('✅ ¡Migración completada!');
    this.log(`📁 Archivo: ${outputPath}`);
    this.log(`📊 Total registros: ${totalRecords.toLocaleString()}`);
    this.log(`⏱️  Tiempo: ${elapsed}s`);
    
    if (this.errors.length > 0) {
      this.log('');
      this.log(`⚠️  ${this.errors.length} errores durante la exportación`);
    }
  }
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

async function main(): Promise<void> {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     FALCO-X UNIVERSO - Database Migration Script          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Obtener credenciales
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.argv[2];
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.argv[3];

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Se requieren las credenciales de Supabase');
    console.error('');
    console.error('Uso:');
    console.error('  npx tsx scripts/migrate-database.ts <SUPABASE_URL> <SUPABASE_KEY>');
    console.error('');
    console.error('O configurar variables de entorno:');
    console.error('  VITE_SUPABASE_URL=https://xxx.supabase.co');
    console.error('  VITE_SUPABASE_ANON_KEY=eyJhbGc...');
    console.error('');
    process.exit(1);
  }

  console.log(`🔗 URL: ${supabaseUrl.substring(0, 30)}...`);
  console.log('');

  const migrator = new DatabaseMigrator(supabaseUrl, supabaseKey);
  await migrator.run();
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
