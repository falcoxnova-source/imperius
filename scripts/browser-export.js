/**
 * FALCO-X UNIVERSO - Browser Migration Script
 * 
 * Script para ejecutar directamente en la consola del navegador
 * mientras estás logueado como admin en el juego.
 * 
 * INSTRUCCIONES:
 * 1. Abre el juego en el navegador
 * 2. Inicia sesión como admin
 * 3. Abre DevTools (F12) -> Console
 * 4. Copia y pega TODO este script
 * 5. Presiona Enter
 * 6. Espera a que se descargue el archivo .sql
 */

(async function exportDatabase() {
  console.log('🚀 Iniciando exportación de base de datos...');

  // Obtener cliente Supabase del store
  const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 
    localStorage.getItem('supabaseUrl') ||
    prompt('Ingresa la URL de Supabase:');
  
  const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ||
    localStorage.getItem('supabaseKey') ||
    prompt('Ingresa la Anon Key de Supabase:');

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Se requieren credenciales de Supabase');
    return;
  }

  // Crear cliente
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Lista de tablas en orden de dependencias
  const TABLES = [
    'game_settings', 'admin_speed_settings', 'admin_smtp_settings',
    'admin_telegram_config', 'admin_telegram_settings', 'telegram_config',
    'wallet_config', 'jackpot_config', 'market_notification_config',
    'building_types', 'technology_types', 'ship_types', 'defense_types',
    'officer_types', 'supply_boxes', 'plus_plans', 'telegram_groups',
    'building_requirements', 'technology_requirements', 'ship_requirements',
    'defense_requirements', 'profiles', 'user_wallets', 'telegram_links',
    'email_verification_tokens', 'login_sessions', 'telegram_task_rewards',
    'game_rounds', 'alliances', 'alliance_members', 'alliance_applications',
    'alliance_diplomacy', 'planets', 'planet_resources', 'planet_buildings',
    'planet_ships', 'planet_defenses', 'galaxy_positions', 'user_technologies',
    'user_officers', 'building_queue', 'shipyard_queue', 'research_queue',
    'fleets', 'fleet_ships', 'acs_fleets', 'acs_participants', 'debris_fields',
    'messages', 'public_chat_messages', 'battle_reports', 'market_listings',
    'market_transactions', 'wallet_transactions', 'referral_commissions',
    'admin_revenue', 'admin_expenses', 'admin_withdrawals', 'jackpot',
    'jackpot_pools', 'jackpot_history', 'plus_subscriptions',
    'plus_pending_rewards', 'plus_commission_rewards', 'plus_commission_distributions',
    'supply_box_purchases', 'monthly_ranking_rewards', 'monthly_ranking_distributions',
    'hall_of_fame_records', 'hall_of_fame_players', 'hall_of_fame_alliances',
    'account_interaction_log', 'attack_log', 'multiaccounting_reports', 'suspicious_accounts'
  ];

  // Funciones de escape SQL
  function escapeSQL(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') {
      if (Number.isNaN(value) || !Number.isFinite(value)) return 'NULL';
      return String(value);
    }
    if (Array.isArray(value) || typeof value === 'object') {
      const json = JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "''");
      return `'${json}'::jsonb`;
    }
    const str = String(value)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `'${str}'`;
  }

  // Generar SQL
  const sql = [];
  const timestamp = new Date().toISOString();
  let totalRecords = 0;
  const stats = [];
  const errors = [];

  sql.push('-- ================================================================');
  sql.push('-- FALCO-X UNIVERSO - FULL DATABASE EXPORT');
  sql.push('-- ================================================================');
  sql.push(`-- Generated: ${timestamp}`);
  sql.push('-- Target: PostgreSQL 16+');
  sql.push('-- ================================================================');
  sql.push('');
  sql.push('\\set ON_ERROR_STOP on');
  sql.push('BEGIN;');
  sql.push("SET session_replication_role = 'replica';");
  sql.push('SET CONSTRAINTS ALL DEFERRED;');
  sql.push('');

  // Exportar cada tabla
  for (const table of TABLES) {
    console.log(`📦 Exportando: ${table}`);
    
    try {
      const { data, error } = await supabase.from(table).select('*');
      
      if (error) {
        console.warn(`⚠️ ${table}: ${error.message}`);
        errors.push(`${table}: ${error.message}`);
        continue;
      }

      sql.push(`-- Table: ${table} (${data?.length || 0} rows)`);
      sql.push(`DELETE FROM "${table}";`);

      if (data && data.length > 0) {
        const columns = Object.keys(data[0]);
        const quotedCols = columns.map(c => `"${c}"`).join(', ');

        for (const row of data) {
          const values = columns.map(c => escapeSQL(row[c])).join(', ');
          sql.push(`INSERT INTO "${table}" (${quotedCols}) VALUES (${values});`);
        }

        stats.push({ table, count: data.length });
        totalRecords += data.length;
        console.log(`✅ ${table}: ${data.length} registros`);
      }

      sql.push('');
    } catch (e) {
      console.warn(`❌ ${table}: ${e.message}`);
      errors.push(`${table}: ${e.message}`);
    }
  }

  // Reset secuencias
  sql.push('-- Reset sequences');
  for (const stat of stats) {
    sql.push(`DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('"${stat.table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${stat.table}"), 1), true); EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
  }
  sql.push('');

  // Finalizar
  sql.push('SET CONSTRAINTS ALL IMMEDIATE;');
  sql.push("SET session_replication_role = 'origin';");
  sql.push('COMMIT;');
  sql.push('');
  sql.push('-- ================================================================');
  sql.push('-- SUMMARY');
  sql.push('-- ================================================================');
  sql.push(`-- Total records: ${totalRecords}`);
  sql.push(`-- Tables exported: ${stats.length}`);
  for (const s of stats) {
    sql.push(`-- ${s.table}: ${s.count}`);
  }
  if (errors.length > 0) {
    sql.push('-- ERRORS:');
    for (const e of errors) {
      sql.push(`-- ${e}`);
    }
  }
  sql.push('-- ================================================================');

  // Descargar archivo
  const content = sql.join('\n');
  const blob = new Blob([content], { type: 'application/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `falco_xnova_export_${timestamp.split('T')[0]}.sql`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('');
  console.log('✅ ¡Exportación completada!');
  console.log(`📊 Total: ${totalRecords} registros en ${stats.length} tablas`);
  if (errors.length > 0) {
    console.log(`⚠️ ${errors.length} errores (ver detalles arriba)`);
  }
})();
