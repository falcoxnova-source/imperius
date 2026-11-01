import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ============================================================================
// UTILIDADES SQL
// ============================================================================

function escapeSQL(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (Array.isArray(value)) {
    const jsonStr = JSON.stringify(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  if (typeof value === "object") {
    const jsonStr = JSON.stringify(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const strValue = String(value);
  if (strValue.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    return `'${strValue.replace(/'/g, "''")}'::timestamptz`;
  }
  return `E'${strValue
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}'`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function mapPgType(
  dataType: string,
  udtName: string,
  charMaxLen: number | null,
  numPrecision: number | null,
  numScale: number | null
): string {
  if (udtName && udtName.startsWith("_")) {
    return udtName.substring(1) + "[]";
  }
  switch (dataType) {
    case "character varying":
      return charMaxLen ? `varchar(${charMaxLen})` : "varchar";
    case "character":
      return charMaxLen ? `char(${charMaxLen})` : "char";
    case "numeric":
      if (numPrecision && numScale) return `numeric(${numPrecision},${numScale})`;
      if (numPrecision) return `numeric(${numPrecision})`;
      return "numeric";
    case "ARRAY":
      return udtName ? udtName.replace(/^_/, "") + "[]" : "text[]";
    case "USER-DEFINED":
      return udtName || "text";
    case "timestamp without time zone":
      return "timestamp";
    case "timestamp with time zone":
      return "timestamptz";
    case "time without time zone":
      return "time";
    case "time with time zone":
      return "timetz";
    case "double precision":
      return "double precision";
    default:
      return udtName || dataType;
  }
}

// ============================================================================
// INTERFACES
// ============================================================================

interface ColumnInfo {
  tbl_name: string;
  col_name: string;
  col_position: number;
  col_default: string | null;
  is_nullable: string;
  data_type: string;
  char_max_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  udt_name: string;
  is_identity: string;
  identity_generation: string | null;
}

interface ConstraintInfo {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  constraint_def: string;
}

// ============================================================================
// GENERADORES DE SQL
// ============================================================================

function generateCreateTableSQL(
  tableName: string,
  columns: ColumnInfo[],
  constraints: ConstraintInfo[]
): string {
  const lines: string[] = [];
  lines.push(`-- Table: ${tableName}`);
  lines.push(`CREATE TABLE IF NOT EXISTS "public"."${tableName}" (`);

  const colDefs: string[] = [];
  for (const col of columns) {
    const colType = mapPgType(col.data_type, col.udt_name, col.char_max_length, col.numeric_precision, col.numeric_scale);
    let def = `  "${col.col_name}" ${colType}`;
    if (col.is_identity === "YES" && col.identity_generation) {
      def += ` GENERATED ${col.identity_generation} AS IDENTITY`;
    } else if (col.col_default !== null) {
      def += ` DEFAULT ${col.col_default}`;
    }
    if (col.is_nullable === "NO") def += " NOT NULL";
    colDefs.push(def);
  }

  const pkConstraints = constraints.filter(c => c.constraint_type === "PRIMARY KEY");
  for (const pk of pkConstraints) {
    colDefs.push(`  CONSTRAINT "${pk.constraint_name}" ${pk.constraint_def}`);
  }
  const uniqueConstraints = constraints.filter(c => c.constraint_type === "UNIQUE");
  for (const uq of uniqueConstraints) {
    colDefs.push(`  CONSTRAINT "${uq.constraint_name}" ${uq.constraint_def}`);
  }
  const checkConstraints = constraints.filter(c => c.constraint_type === "CHECK");
  for (const ck of checkConstraints) {
    if (ck.constraint_name.startsWith("2200_")) continue;
    colDefs.push(`  CONSTRAINT "${ck.constraint_name}" ${ck.constraint_def}`);
  }

  lines.push(colDefs.join(",\n"));
  lines.push(");");
  lines.push("");
  return lines.join("\n");
}

function generateInsertSQL(tableName: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const lines: string[] = [];
  lines.push(`-- Data: ${tableName} (${rows.length} rows)`);
  lines.push(`DELETE FROM "public"."${tableName}";`);
  for (const row of rows) {
    const values = columns.map(col => escapeSQL(row[col]));
    const quotedColumns = columns.map(c => `"${c}"`).join(", ");
    lines.push(`INSERT INTO "public"."${tableName}" (${quotedColumns}) VALUES (${values.join(", ")});`);
  }
  lines.push("");
  return lines.join("\n");
}

// ============================================================================
// SERVIDOR PRINCIPAL
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // --- AUTH ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await adminClient.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body for backup mode
    let backupMode = "complete";
    try {
      const body = await req.json();
      if (body?.mode) backupMode = body.mode;
    } catch {
      // No body = default complete
    }

    const timestamp = new Date().toISOString();
    const backupId = `BKP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sqlParts: string[] = [];
    const errors: string[] = [];

    // ================================================================
    // HEADER
    // ================================================================
    // Tablas de configuracion del juego (se incluyen datos en modo clean_universe)
    const CONFIG_TABLES = new Set([
      "game_settings", "admin_speed_settings", "admin_smtp_settings",
      "admin_telegram_config", "admin_telegram_settings", "telegram_config",
      "wallet_config", "jackpot_config", "market_notification_config",
      "building_types", "technology_types", "ship_types", "defense_types",
      "officer_types", "building_requirements", "technology_requirements",
      "ship_requirements", "defense_requirements", "supply_boxes", "plus_plans",
      "telegram_groups", "telegram_task_rewards", "game_rounds",
      "jackpot", "jackpot_pools", "recaptcha_settings",
    ]);

    const modeLabels: Record<string, string> = {
      complete: "COMPLETO (Estructura + Datos + Funciones + RLS + Triggers)",
      "data-only": "SOLO DATOS",
      clean_universe: "UNIVERSO LIMPIO (Estructura + Configuracion + Funciones + RLS + Triggers - SIN jugadores)",
    };

    sqlParts.push("-- ============================================================");
    sqlParts.push(`-- BACKUP DE BASE DE DATOS - PostgreSQL/Supabase`);
    sqlParts.push("-- ============================================================");
    sqlParts.push(`-- Backup ID: ${backupId}`);
    sqlParts.push(`-- Generado: ${timestamp}`);
    sqlParts.push(`-- Modo: ${modeLabels[backupMode] || backupMode}`);
    sqlParts.push("-- ============================================================");
    sqlParts.push("");
    sqlParts.push("-- INSTRUCCIONES DE RESTAURACION:");
    sqlParts.push("-- 1. Conectar a PostgreSQL con superusuario o service_role");
    sqlParts.push("-- 2. Ejecutar este script completo");
    sqlParts.push("-- 3. Verificar el INTEGRITY CHECK al final");
    sqlParts.push("");
    sqlParts.push("\\set ON_ERROR_STOP on");
    sqlParts.push("");

    // ================================================================
    // PART 1: EXTENSIONS
    // ================================================================
    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 1: EXTENSIONES");
      sqlParts.push("-- ============================================================");
      try {
        const { data: extensions, error } = await adminClient.rpc("get_database_extensions");
        if (!error && extensions && extensions.length > 0) {
          for (const ext of extensions) {
            sqlParts.push(`CREATE EXTENSION IF NOT EXISTS "${ext.ext_name}" WITH SCHEMA "${ext.ext_schema}";`);
          }
        } else if (error) {
          errors.push(`Extensions: ${error.message}`);
          sqlParts.push(`-- ERROR al obtener extensiones: ${error.message}`);
        }
      } catch (e) {
        errors.push(`Extensions: ${e instanceof Error ? e.message : String(e)}`);
        sqlParts.push("-- ERROR al obtener extensiones (funcion RPC no disponible, ejecutar migracion primero)");
      }
      sqlParts.push("");
    }

    // ================================================================
    // PART 2: CUSTOM TYPES (ENUM)
    // ================================================================
    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 2: TIPOS PERSONALIZADOS (ENUM, etc.)");
      sqlParts.push("-- ============================================================");
      try {
        const { data: types, error } = await adminClient.rpc("get_custom_types");
        if (!error && types && types.length > 0) {
          for (const t of types) {
            if (t.type_kind === "enum" && t.enum_values && t.enum_values.length > 0) {
              const vals = t.enum_values.map((v: string) => `'${v}'`).join(", ");
              sqlParts.push(`DO $$ BEGIN`);
              sqlParts.push(`  CREATE TYPE "public"."${t.type_name}" AS ENUM (${vals});`);
              sqlParts.push(`EXCEPTION WHEN duplicate_object THEN NULL;`);
              sqlParts.push(`END $$;`);
            }
          }
        } else if (error) {
          errors.push(`Types: ${error.message}`);
        }
      } catch (e) {
        errors.push(`Types: ${e instanceof Error ? e.message : String(e)}`);
      }
      sqlParts.push("");
    }

    // ================================================================
    // PART 3: TABLE STRUCTURE
    // ================================================================
    let allTables: string[] = [];
    const constraintsByTable: Record<string, ConstraintInfo[]> = {};

    const { data: tablesResult, error: tablesError } = await adminClient.rpc("get_all_public_tables");
    if (tablesError || !tablesResult) {
      allTables = [
        "game_settings", "admin_speed_settings", "admin_smtp_settings",
        "admin_telegram_config", "admin_telegram_settings", "telegram_config",
        "wallet_config", "jackpot_config", "market_notification_config",
        "building_types", "technology_types", "ship_types", "defense_types",
        "officer_types", "building_requirements", "technology_requirements",
        "ship_requirements", "defense_requirements", "supply_boxes", "plus_plans",
        "telegram_groups", "telegram_task_rewards", "game_rounds", "galaxy_positions",
        "profiles", "user_wallets", "telegram_links", "email_verification_tokens",
        "login_sessions", "alliances", "alliance_members", "alliance_applications",
        "alliance_diplomacy", "planets", "planet_resources", "planet_buildings",
        "planet_ships", "planet_defenses", "user_technologies", "user_officers",
        "building_queue", "shipyard_queue", "research_queue", "fleets", "fleet_ships",
        "acs_fleets", "acs_participants", "debris_fields", "messages",
        "public_chat_messages", "battle_reports", "market_listings", "market_transactions",
        "wallet_transactions", "referral_commissions", "admin_revenue", "admin_expenses",
        "admin_withdrawals", "jackpot", "jackpot_pools", "jackpot_history",
        "plus_subscriptions", "plus_pending_rewards", "plus_commission_rewards",
        "plus_commission_distributions", "supply_box_purchases", "monthly_ranking_rewards",
        "monthly_ranking_distributions", "hall_of_fame_records", "hall_of_fame_players",
        "hall_of_fame_alliances", "account_interaction_log", "attack_log",
        "multiaccounting_reports", "suspicious_accounts",
      ];
    } else {
      allTables = tablesResult.map((r: { table_name: string }) => r.table_name);
    }

    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 3: ESTRUCTURA DE TABLAS (CREATE TABLE)");
      sqlParts.push("-- ============================================================");

      let allColumns: ColumnInfo[] = [];
      try {
        const { data: cols, error } = await adminClient.rpc("get_table_columns_detail");
        if (!error && cols) allColumns = cols;
        else if (error) errors.push(`Columns: ${error.message}`);
      } catch (e) {
        errors.push(`Columns: ${e instanceof Error ? e.message : String(e)}`);
      }

      let allConstraints: ConstraintInfo[] = [];
      try {
        const { data: cons, error } = await adminClient.rpc("get_all_constraints");
        if (!error && cons) allConstraints = cons;
        else if (error) errors.push(`Constraints: ${error.message}`);
      } catch (e) {
        errors.push(`Constraints: ${e instanceof Error ? e.message : String(e)}`);
      }

      const columnsByTable: Record<string, ColumnInfo[]> = {};
      for (const col of allColumns) {
        if (!columnsByTable[col.tbl_name]) columnsByTable[col.tbl_name] = [];
        columnsByTable[col.tbl_name].push(col);
      }
      for (const con of allConstraints) {
        if (!constraintsByTable[con.table_name]) constraintsByTable[con.table_name] = [];
        constraintsByTable[con.table_name].push(con);
      }

      for (const table of allTables) {
        const cols = columnsByTable[table];
        if (!cols || cols.length === 0) continue;
        const inlineConstraints = (constraintsByTable[table] || []).filter(
          c => c.constraint_type !== "FOREIGN KEY"
        );
        sqlParts.push(generateCreateTableSQL(table, cols, inlineConstraints));
      }
      sqlParts.push("");

      // FOREIGN KEYS (separate to avoid dependency order issues)
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 3b: FOREIGN KEY CONSTRAINTS");
      sqlParts.push("-- ============================================================");
      for (const table of allTables) {
        const fks = (constraintsByTable[table] || []).filter(c => c.constraint_type === "FOREIGN KEY");
        for (const fk of fks) {
          sqlParts.push(`DO $$ BEGIN`);
          sqlParts.push(`  ALTER TABLE "public"."${table}" ADD CONSTRAINT "${fk.constraint_name}" ${fk.constraint_def};`);
          sqlParts.push(`EXCEPTION WHEN duplicate_object THEN NULL;`);
          sqlParts.push(`END $$;`);
        }
      }
      sqlParts.push("");
    }

    // ================================================================
    // PART 4: DATA
    // ================================================================
    const dataLabel = backupMode === "clean_universe"
      ? "DATOS DE TABLAS DE CONFIGURACION (sin datos de jugadores)"
      : "DATOS DE TODAS LAS TABLAS";
    sqlParts.push("-- ============================================================");
    sqlParts.push(`-- SECCION 4: ${dataLabel}`);
    sqlParts.push("-- ============================================================");
    sqlParts.push("");
    sqlParts.push("BEGIN;");
    sqlParts.push("");
    sqlParts.push("-- Desactivar triggers y FK para restauracion limpia");
    sqlParts.push("SET session_replication_role = 'replica';");
    sqlParts.push("SET CONSTRAINTS ALL DEFERRED;");
    sqlParts.push("");

    // En modo clean_universe, filtrar solo tablas de config
    const tablesToBackupData = backupMode === "clean_universe"
      ? allTables.filter(t => CONFIG_TABLES.has(t))
      : allTables;

    if (backupMode === "clean_universe") {
      const skippedTables = allTables.filter(t => !CONFIG_TABLES.has(t));
      sqlParts.push(`-- MODO UNIVERSO LIMPIO: Se incluyen datos de ${tablesToBackupData.length} tablas de configuracion`);
      sqlParts.push(`-- Tablas de jugadores omitidas (${skippedTables.length}): ${skippedTables.join(", ")}`);
      sqlParts.push("");
    }

    let totalRecords = 0;
    const tableStats: { name: string; count: number; hash: string }[] = [];
    const emptyTables: string[] = [];

    for (const table of tablesToBackupData) {
      try {
        let allData: Record<string, unknown>[] = [];
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await adminClient
            .from(table)
            .select("*")
            .range(offset, offset + pageSize - 1);

          if (error) {
            errors.push(`${table}: ${error.message}`);
            hasMore = false;
            break;
          }
          if (data && data.length > 0) {
            allData = allData.concat(data);
            offset += pageSize;
            if (data.length < pageSize) hasMore = false;
          } else {
            hasMore = false;
          }
        }

        if (allData.length > 0) {
          const tableSQL = generateInsertSQL(table, allData);
          const tableHash = simpleHash(JSON.stringify(allData));
          sqlParts.push(tableSQL);
          totalRecords += allData.length;
          tableStats.push({ name: table, count: allData.length, hash: tableHash });
        } else {
          emptyTables.push(table);
        }
      } catch (e) {
        errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    sqlParts.push("");
    sqlParts.push("-- Reactivar triggers y constraints");
    sqlParts.push("SET CONSTRAINTS ALL IMMEDIATE;");
    sqlParts.push("SET session_replication_role = 'origin';");
    sqlParts.push("");
    sqlParts.push("COMMIT;");
    sqlParts.push("");

    // ================================================================
    // PART 5: SEQUENCES
    // ================================================================
    sqlParts.push("-- ============================================================");
    sqlParts.push("-- SECCION 5: SECUENCIAS (valores actuales)");
    sqlParts.push("-- ============================================================");
    try {
      const { data: seqs, error } = await adminClient.rpc("get_all_sequences_state");
      if (!error && seqs && seqs.length > 0) {
        for (const seq of seqs) {
          if (seq.seq_last_value && seq.seq_last_value > 0) {
            sqlParts.push(`SELECT setval('"public"."${seq.seq_name}"', ${seq.seq_last_value}, true);`);
          }
        }
      } else if (error) {
        errors.push(`Sequences: ${error.message}`);
        // Fallback
        sqlParts.push("-- Fallback: reset secuencias basadas en max(id)");
        for (const table of allTables) {
          sqlParts.push(`DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('"public"."${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "public"."${table}"), 1)); EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
        }
      }
    } catch (e) {
      errors.push(`Sequences: ${e instanceof Error ? e.message : String(e)}`);
      sqlParts.push("-- Fallback: reset secuencias basadas en max(id)");
      for (const table of allTables) {
        sqlParts.push(`DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('"public"."${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "public"."${table}"), 1)); EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
      }
    }
    sqlParts.push("");

    // ================================================================
    // PART 6: INDEXES
    // ================================================================
    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 6: INDICES");
      sqlParts.push("-- ============================================================");
      try {
        const { data: indexes, error } = await adminClient.rpc("get_all_indexes");
        if (!error && indexes && indexes.length > 0) {
          for (const idx of indexes) {
            sqlParts.push(`${idx.index_def};`);
          }
        } else if (error) {
          errors.push(`Indexes: ${error.message}`);
        }
      } catch (e) {
        errors.push(`Indexes: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        const { data: uIndexes, error } = await adminClient.rpc("get_all_unique_indexes");
        if (!error && uIndexes && uIndexes.length > 0) {
          for (const idx of uIndexes) {
            sqlParts.push(`${idx.index_def};`);
          }
        }
      } catch { /* covered by constraints */ }
      sqlParts.push("");
    }

    // ================================================================
    // PART 7: FUNCTIONS
    // ================================================================
    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 7: FUNCIONES Y PROCEDURES");
      sqlParts.push("-- ============================================================");
      try {
        const { data: funcs, error } = await adminClient.rpc("get_all_functions");
        if (!error && funcs && funcs.length > 0) {
          for (const fn of funcs) {
            if (fn.func_def) {
              sqlParts.push(`-- Function: ${fn.func_name}`);
              sqlParts.push(`${fn.func_def};`);
              sqlParts.push("");
            }
          }
        } else if (error) {
          errors.push(`Functions: ${error.message}`);
        }
      } catch (e) {
        errors.push(`Functions: ${e instanceof Error ? e.message : String(e)}`);
      }
      sqlParts.push("");
    }

    // ================================================================
    // PART 8: VIEWS
    // ================================================================
    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 8: VISTAS");
      sqlParts.push("-- ============================================================");
      try {
        const { data: views, error } = await adminClient.rpc("get_all_views");
        if (!error && views && views.length > 0) {
          for (const v of views) {
            sqlParts.push(`-- View: ${v.view_name}`);
            sqlParts.push(`CREATE OR REPLACE VIEW "public"."${v.view_name}" AS ${v.view_def}`);
            sqlParts.push("");
          }
        } else if (error) {
          errors.push(`Views: ${error.message}`);
        }
      } catch (e) {
        errors.push(`Views: ${e instanceof Error ? e.message : String(e)}`);
      }
      sqlParts.push("");
    }

    // ================================================================
    // PART 9: TRIGGERS
    // ================================================================
    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 9: TRIGGERS");
      sqlParts.push("-- ============================================================");
      try {
        const { data: triggers, error } = await adminClient.rpc("get_all_triggers");
        if (!error && triggers && triggers.length > 0) {
          for (const trig of triggers) {
            sqlParts.push(`-- Trigger: ${trig.trigger_name} ON ${trig.table_name}`);
            sqlParts.push(`${trig.trigger_def};`);
            sqlParts.push("");
          }
        } else if (error) {
          errors.push(`Triggers: ${error.message}`);
        }
      } catch (e) {
        errors.push(`Triggers: ${e instanceof Error ? e.message : String(e)}`);
      }
      sqlParts.push("");
    }

    // ================================================================
    // PART 10: RLS POLICIES
    // ================================================================
    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 10: ROW LEVEL SECURITY (RLS)");
      sqlParts.push("-- ============================================================");

      // Enable RLS
      try {
        const { data: rlsStatus, error } = await adminClient.rpc("get_rls_status");
        if (!error && rlsStatus && rlsStatus.length > 0) {
          for (const tbl of rlsStatus) {
            if (tbl.rls_enabled) {
              sqlParts.push(`ALTER TABLE "public"."${tbl.table_name}" ENABLE ROW LEVEL SECURITY;`);
              if (tbl.rls_forced) {
                sqlParts.push(`ALTER TABLE "public"."${tbl.table_name}" FORCE ROW LEVEL SECURITY;`);
              }
            }
          }
        }
      } catch (e) {
        errors.push(`RLS Status: ${e instanceof Error ? e.message : String(e)}`);
      }
      sqlParts.push("");

      // RLS Policies
      try {
        const { data: policies, error } = await adminClient.rpc("get_all_rls_policies");
        if (!error && policies && policies.length > 0) {
          for (const pol of policies) {
            const tableParts = pol.table_name.split(".");
            const tblName = tableParts.length > 1 ? tableParts[1] : tableParts[0];
            const permissive = pol.policy_permissive === "PERMISSIVE" ? "PERMISSIVE" : "RESTRICTIVE";
            const roles = pol.policy_roles?.join(", ") || "public";
            const cmd = pol.policy_cmd || "ALL";

            let policySQL = `CREATE POLICY "${pol.policy_name}" ON "public"."${tblName}"`;
            policySQL += ` AS ${permissive} FOR ${cmd} TO ${roles}`;
            if (pol.policy_qual) policySQL += ` USING (${pol.policy_qual})`;
            if (pol.policy_with_check) policySQL += ` WITH CHECK (${pol.policy_with_check})`;
            policySQL += ";";

            sqlParts.push(`-- Policy: ${pol.policy_name} on ${tblName}`);
            sqlParts.push(policySQL);
          }
        } else if (error) {
          errors.push(`Policies: ${error.message}`);
        }
      } catch (e) {
        errors.push(`Policies: ${e instanceof Error ? e.message : String(e)}`);
      }
      sqlParts.push("");
    }

    // ================================================================
    // PART 11: GRANTS
    // ================================================================
    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push("-- ============================================================");
      sqlParts.push("-- SECCION 11: PERMISOS (GRANT)");
      sqlParts.push("-- ============================================================");
      try {
        const { data: grants, error } = await adminClient.rpc("get_all_grants");
        if (!error && grants && grants.length > 0) {
          const grantMap: Record<string, string[]> = {};
          for (const g of grants) {
            const key = `${g.table_name}|${g.grantee}`;
            if (!grantMap[key]) grantMap[key] = [];
            grantMap[key].push(g.privilege_type);
          }
          for (const [key, privileges] of Object.entries(grantMap)) {
            const [tableName, grantee] = key.split("|");
            sqlParts.push(`GRANT ${privileges.join(", ")} ON "public"."${tableName}" TO "${grantee}";`);
          }
        } else if (error) {
          errors.push(`Grants: ${error.message}`);
        }
      } catch (e) {
        errors.push(`Grants: ${e instanceof Error ? e.message : String(e)}`);
      }
      sqlParts.push("");
    }

    // ================================================================
    // INTEGRITY CHECK
    // ================================================================
    const integrityHash = simpleHash(
      tableStats.map(t => `${t.name}:${t.count}:${t.hash}`).join("|")
    );

    sqlParts.push("-- ============================================================");
    sqlParts.push("-- VERIFICACION DE INTEGRIDAD DEL BACKUP");
    sqlParts.push("-- ============================================================");
    sqlParts.push(`-- Backup ID: ${backupId}`);
    sqlParts.push(`-- Timestamp: ${timestamp}`);
    const modoLabel = backupMode === "complete" ? "COMPLETO" : backupMode === "clean_universe" ? "UNIVERSO LIMPIO" : "SOLO DATOS";
    sqlParts.push(`-- Modo: ${modoLabel}`);
    sqlParts.push(`-- Hash de Integridad: ${integrityHash}`);
    sqlParts.push(`-- Total Tablas en DB: ${allTables.length}`);
    sqlParts.push(`-- Tablas con Datos: ${tableStats.length}`);
    sqlParts.push(`-- Tablas Vacias: ${emptyTables.length}`);
    sqlParts.push(`-- Total Registros: ${totalRecords}`);
    sqlParts.push("--");

    if (backupMode === "complete" || backupMode === "clean_universe") {
      sqlParts.push(`-- CONTENIDO DEL BACKUP ${modoLabel}:`);
      sqlParts.push("--   ✅ Extensiones");
      sqlParts.push("--   ✅ Tipos personalizados (ENUM)");
      sqlParts.push("--   ✅ Estructura de tablas (CREATE TABLE)");
      sqlParts.push("--   ✅ Constraints (PK, FK, UNIQUE, CHECK)");
      sqlParts.push("--   ✅ Indices");
      if (backupMode === "clean_universe") {
        sqlParts.push("--   ✅ Datos de tablas de configuracion (building_types, ship_types, etc.)");
        sqlParts.push("--   ❌ SIN datos de jugadores (profiles, planets, fleets, etc.)");
      } else {
        sqlParts.push("--   ✅ Todos los datos de todas las tablas");
      }
      sqlParts.push("--   ✅ Secuencias (valores actuales)");
      sqlParts.push("--   ✅ Funciones y Procedures");
      sqlParts.push("--   ✅ Vistas");
      sqlParts.push("--   ✅ Triggers");
      sqlParts.push("--   ✅ Row Level Security (RLS) policies");
      sqlParts.push("--   ✅ Permisos (GRANT)");
      sqlParts.push("--");
    }

    sqlParts.push("-- TABLAS CON DATOS:");
    for (const stat of tableStats) {
      sqlParts.push(`--   [${stat.hash}] ${stat.name}: ${stat.count} filas`);
    }
    if (emptyTables.length > 0) {
      sqlParts.push("--");
      sqlParts.push("-- TABLAS VACIAS (sin datos):");
      for (const table of emptyTables) sqlParts.push(`--   ${table}`);
    }
    if (errors.length > 0) {
      sqlParts.push("--");
      sqlParts.push("-- ADVERTENCIAS DURANTE EL BACKUP:");
      for (const err of errors) sqlParts.push(`--   ⚠️ ${err}`);
    }
    sqlParts.push("-- ============================================================");
    sqlParts.push(`-- FIN DEL BACKUP ${backupId}`);
    sqlParts.push("-- ============================================================");

    const sqlContent = sqlParts.join("\n");
    const contentHash = simpleHash(sqlContent);
    const finalContent = sqlContent + `\n-- File Checksum: ${contentHash}\n`;

    if (totalRecords === 0 && tableStats.length === 0 && backupMode !== "clean_universe") {
      return new Response(JSON.stringify({
        error: "Backup validation failed: No data found in any table",
        details: errors,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const modeLabel = backupMode === "complete" ? "completo" : backupMode === "clean_universe" ? "universo_limpio" : "datos";

    return new Response(finalContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="backup_${modeLabel}_${timestamp.split("T")[0]}_${backupId}.sql"`,
        "X-Backup-Id": backupId,
        "X-Backup-Mode": backupMode,
        "X-Backup-Tables": String(tableStats.length),
        "X-Backup-Records": String(totalRecords),
        "X-Backup-Hash": integrityHash,
        "X-Backup-Errors": String(errors.length),
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
      type: "backup_failed",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
