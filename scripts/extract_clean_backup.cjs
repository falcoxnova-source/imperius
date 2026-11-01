/**
 * Extracts final database schema from all migration files.
 * Scans raw file content with regex patterns and smart extraction.
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const OUTPUT_FILE = path.join(__dirname, '..', 'clean_backup.sql');

const state = {
  extensions: new Map(),
  enums: new Map(),
  sequences: new Map(),
  tables: new Map(),
  functions: new Map(),
  triggers: new Map(),
  policies: [],
  indexes: new Map(),
  grants: new Set(),
  views: new Map(),
  constraints: new Set(),
  rlsEnables: new Set(),
  comments: new Set(),
  seedInserts: new Map(),
};

const REFERENCE_TABLES = new Set([
  'building_types', 'technology_types', 'ship_types', 'defense_types',
  'officer_types', 'game_settings', 'plus_plans', 'cosmetic_items',
  'daily_mission_types', 'blueprint_ships', 'alliance_depot_levels',
  'p2p_payment_methods', 'p2p_fee_settings', 'p2p_currencies',
  'weekly_vip_plan',
]);

// Find matching semicolon at top level (not inside $$, parens, or string literals)
function findStmtEnd(text, start) {
  let inDollar = false;
  let dollarTag = '';
  let inSQ = false;
  let depth = 0;
  
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    
    // Single line comment
    if (ch === '-' && text[i+1] === '-' && !inDollar && !inSQ) {
      const nl = text.indexOf('\n', i);
      i = nl !== -1 ? nl : text.length;
      continue;
    }
    
    // Multi-line comment
    if (ch === '/' && text[i+1] === '*' && !inDollar && !inSQ) {
      const end = text.indexOf('*/', i + 2);
      i = end !== -1 ? end + 1 : text.length;
      continue;
    }
    
    // Dollar quote start
    if (ch === '$' && !inDollar && !inSQ) {
      let endIdx = text.indexOf('$', i + 1);
      if (endIdx !== -1) {
        const between = text.substring(i + 1, endIdx);
        // Check if valid identifier (letters, digits, underscore) or empty
        if (/^\w*$/.test(between)) {
          dollarTag = text.substring(i, endIdx + 1);
          inDollar = true;
          i = endIdx;
          continue;
        }
      }
    }
    
    // Dollar quote end
    if (inDollar && text.substring(i, i + dollarTag.length) === dollarTag) {
      inDollar = false;
      i += dollarTag.length - 1;
      dollarTag = '';
      continue;
    }
    
    // Single quote
    if (ch === "'" && !inDollar) {
      inSQ = !inSQ;
    }
    
    // Paren depth
    if (!inDollar && !inSQ) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
    }
    
    // Semicolon at depth 0 ends statement
    if (ch === ';' && !inDollar && !inSQ && depth === 0) {
      return i + 1;
    }
  }
  return text.length;
}

// Extract full text for a statement starting at `start`
function extractStmt(text, start, prefixPattern) {
  const m = text.substring(start).match(prefixPattern);
  if (!m) return null;
  const end = findStmtEnd(text, start);
  return { sql: text.substring(start, end).trim(), end };
}

// ========================================================
// Content scanning
// ========================================================

function processFile(content) {
  let pos = 0;
  
  while (pos < content.length) {
    // Skip whitespace, comments
    const skip = skipWhitespaceAndComments(content, pos);
    if (skip > pos) { pos = skip; continue; }
    if (pos >= content.length) break;
    
    const remaining = content.substring(pos);
    const upper = remaining.toUpperCase();
    
    // Extension
    let m = remaining.match(/^CREATE\s+EXTENSION\s+IF NOT EXISTS\s+(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^CREATE\s+EXTENSION/i);
      if (stmt) {
        state.extensions.set(m[1], stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // ENUM
    m = remaining.match(/^CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^CREATE\s+TYPE/i);
      if (stmt) {
        state.enums.set(m[1], stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // SEQUENCE
    m = remaining.match(/^CREATE\s+SEQUENCE\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^CREATE\s+SEQUENCE/i);
      if (stmt) {
        state.sequences.set(m[1], stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // CREATE TABLE IF NOT EXISTS
    m = remaining.match(/^CREATE\s+TABLE\s+IF NOT EXISTS\s+(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^CREATE\s+TABLE/i);
      if (stmt) {
        extractCreateTable(stmt.sql, m[1]);
        pos = stmt.end;
        continue;
      }
    }
    
    // ALTER TABLE
    m = remaining.match(/^ALTER\s+TABLE\s+(?:IF EXISTS\s+)?(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^ALTER\s+TABLE/i);
      if (stmt) {
        extractAlter(stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // DROP FUNCTION
    m = remaining.match(/^DROP\s+FUNCTION\s+(?:IF EXISTS\s+)?(\w+(?:\.\w+)?)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^DROP\s+FUNCTION/i);
      if (stmt) {
        if (state.functions.has(m[1])) state.functions.delete(m[1]);
        pos = stmt.end;
        continue;
      }
    }
    
    // DROP TABLE
    m = remaining.match(/^DROP\s+TABLE\s+(?:IF EXISTS\s+)?(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^DROP\s+TABLE/i);
      if (stmt) { pos = stmt.end; continue; }
    }
    
    // FUNCTION
    m = remaining.match(/^CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+(\w+(?:\.\w+)?)/i);
    if (m) {
      extractFunction(content, pos, m[1]);
      const stmt = extractStmt(content, pos, /^CREATE\s+(?:OR REPLACE\s+)?FUNCTION/i);
      if (stmt) {
        state.functions.set(m[1], stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // TRIGGER
    m = remaining.match(/^CREATE\s+(?:OR REPLACE\s+)?TRIGGER\s+(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^CREATE\s+(?:OR REPLACE\s+)?TRIGGER/i);
      if (stmt) {
        state.triggers.set(m[1], stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // POLICY
    m = remaining.match(/^CREATE\s+POLICY\s+(\w+)\s+ON\s+(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^CREATE\s+POLICY/i);
      if (stmt) {
        state.policies.push(stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // INDEX
    m = remaining.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^CREATE\s+(?:UNIQUE\s+)?INDEX/i);
      if (stmt) {
        state.indexes.set(m[1], stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // VIEW
    m = remaining.match(/^CREATE\s+(?:OR REPLACE\s+)?VIEW\s+(\w+)/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^CREATE\s+(?:OR REPLACE\s+)?VIEW/i);
      if (stmt) {
        state.views.set(m[1], stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // GRANT
    if (upper.startsWith('GRANT ')) {
      const stmt = extractStmt(content, pos, /^GRANT/i);
      if (stmt) {
        state.grants.add(stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // INSERT
    m = remaining.match(/^INSERT\s+INTO\s+(\w+)/i);
    if (m) {
      if (REFERENCE_TABLES.has(m[1])) {
        const stmt = extractStmt(content, pos, /^INSERT\s+INTO/i);
        if (stmt) {
          state.seedInserts.set(m[1], stmt.sql);
          pos = stmt.end;
          continue;
        }
      } else {
        // Skip non-reference inserts
        const stmt = extractStmt(content, pos, /^INSERT\s+INTO/i);
        if (stmt) { pos = stmt.end; continue; }
      }
    }
    
    // COMMENT
    m = remaining.match(/^COMMENT\s+ON/i);
    if (m) {
      const stmt = extractStmt(content, pos, /^COMMENT\s+ON/i);
      if (stmt) {
        state.comments.add(stmt.sql);
        pos = stmt.end;
        continue;
      }
    }
    
    // UPDATE / DELETE / TRUNCATE / other - skip
    if (upper.startsWith('UPDATE ') || upper.startsWith('DELETE ') || 
        upper.startsWith('TRUNCATE ') || upper.startsWith('REFRESH ')) {
      const stmt = extractStmt(content, pos, /^\w+/);
      if (stmt) { pos = stmt.end; continue; }
    }
    
    // Not recognized - advance one character
    pos++;
  }
}

function skipWhitespaceAndComments(text, pos) {
  while (pos < text.length) {
    if (text[pos] === ' ' || text[pos] === '\n' || text[pos] === '\r' || text[pos] === '\t') {
      pos++;
      continue;
    }
    if (text[pos] === '-' && text[pos+1] === '-') {
      const nl = text.indexOf('\n', pos);
      pos = nl !== -1 ? nl + 1 : text.length;
      continue;
    }
    if (text[pos] === '/' && text[pos+1] === '*') {
      const end = text.indexOf('*/', pos + 2);
      pos = end !== -1 ? end + 2 : text.length;
      continue;
    }
    break;
  }
  return pos;
}

// ========================================================
// Function extraction
// ========================================================

function extractFunction(content, pos, funcName) {
  // Just extract the full statement using findStmtEnd
  // findStmtEnd handles dollar quoting properly
}

// ========================================================
// CREATE TABLE parsing
// ========================================================

function extractCreateTable(sql, tableName) {
  const startParen = sql.indexOf('(');
  const endParen = sql.lastIndexOf(')');
  if (startParen === -1 || endParen <= startParen) return;
  
  const inner = sql.substring(startParen + 1, endParen).trim();
  const parts = splitTopLevel(inner);
  
  const columns = [];
  const constraints = [];
  
  for (const p of parts) {
    const upper = p.trim().toUpperCase();
    if (upper.startsWith('PRIMARY KEY') || upper.startsWith('UNIQUE') ||
        upper.startsWith('FOREIGN KEY') || upper.startsWith('CHECK') ||
        upper.startsWith('CONSTRAINT') || upper.startsWith('EXCLUDE')) {
      constraints.push(p.trim());
    } else {
      const col = parseColumnDef(p.trim());
      if (col) columns.push(col);
    }
  }
  
  state.tables.set(tableName, { columns, constraints });
}

function splitTopLevel(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseColumnDef(text) {
  const parts = text.split(/\s+/);
  if (!parts.length) return null;
  const name = parts[0];
  
  // Collect type tokens (stop at constraint keywords)
  let typeTokens = [];
  let i = 1;
  while (i < parts.length) {
    const upper = parts[i].toUpperCase();
    if (['NOT','DEFAULT','PRIMARY','UNIQUE','REFERENCES','CHECK','GENERATED','CONSTRAINT','EXCLUDE'].includes(upper)) break;
    typeTokens.push(parts[i]);
    i++;
  }
  const type = typeTokens.join(' ');
  
  const rest = parts.slice(i).join(' ');
  const nullable = !/\bNOT\s+NULL\b/i.test(rest);
  const defaultMatch = rest.match(/DEFAULT\s+(.+?)$/i);
  const defaultVal = defaultMatch ? defaultMatch[1].trim() : null;
  const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(rest);
  const isUnique = /\bUNIQUE\b/i.test(rest);
  const refMatch = rest.match(/(REFERENCES\s+\S+(?:\.\S+)?\s*(?:\([^)]+\))?)/i);
  const references = refMatch ? refMatch[1] : '';
  const checkMatch = rest.match(/(CHECK\s*\([^)]+\))/i);
  const check = checkMatch ? checkMatch[1] : '';
  
  return { name, type, nullable, default: defaultVal, isPrimaryKey, isUnique, references, check };
}

function columnToSQL(col) {
  let sql = `"${col.name}" ${col.type}`;
  if (col.references) sql += ' ' + col.references;
  if (!col.nullable) sql += ' NOT NULL';
  if (col.default !== null && col.default !== undefined) sql += ' DEFAULT ' + col.default;
  if (col.isPrimaryKey) sql += ' PRIMARY KEY';
  if (col.isUnique) sql += ' UNIQUE';
  if (col.check) sql += ' ' + col.check;
  return sql;
}

function renderTable(name, info) {
  const lines = [];
  lines.push(`CREATE TABLE IF NOT EXISTS "${name}" (`);
  
  const seen = new Map();
  for (const col of info.columns) {
    if (seen.has(col.name)) {
      // Replace existing column with later version
      const idx = [...seen.keys()].indexOf(col.name);
    }
    seen.set(col.name, col);
  }
  const uniqueCols = [...seen.values()];
  
  const colLines = uniqueCols.map(c => '  ' + columnToSQL(c));
  const constraintLines = info.constraints.map(c => '  ' + c);
  const allLines = [...colLines, ...constraintLines];
  
  for (let i = 0; i < allLines.length; i++) {
    lines.push(allLines[i] + (i < allLines.length - 1 ? ',' : ''));
  }
  lines.push(');');
  return lines.join('\n');
}

// ========================================================
// ALTER TABLE handling
// ========================================================

function extractAlter(sql) {
  const norm = sql.replace(/\s+/g, ' ').trim();
  
  // RLS enable
  let m = norm.match(/^ALTER\s+TABLE\s+(?:IF EXISTS\s+)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  if (m) { state.rlsEnables.add(norm); return; }
  
  // ADD CONSTRAINT
  m = norm.match(/^ALTER\s+TABLE\s+(?:IF EXISTS\s+)?(\w+)\s+ADD\s+(CONSTRAINT\s+\w+\s+(?:PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|EXCLUDE).+)/i);
  if (m) { state.constraints.add(norm); return; }
  
  // ADD COLUMN
  m = norm.match(/^ALTER\s+TABLE\s+(?:IF EXISTS\s+)?(\w+)\s+ADD\s+(?:COLUMN\s+)?(?:IF NOT EXISTS\s+)?(.+)$/i);
  if (m && state.tables.has(m[1])) {
    const colDef = m[2].replace(/;$/, '').trim();
    const col = parseColumnDef(colDef);
    if (col) state.tables.get(m[1]).columns.push(col);
    return;
  }
  
  // DROP COLUMN
  m = norm.match(/^ALTER\s+TABLE\s+(?:IF EXISTS\s+)?(\w+)\s+DROP\s+(?:COLUMN\s+)?(?:IF EXISTS\s+)?(\w+)/i);
  if (m && state.tables.has(m[1])) {
    const t = state.tables.get(m[1]);
    t.columns = t.columns.filter(c => c.name.toLowerCase() !== m[2].toLowerCase());
    return;
  }
  
  // ALTER COLUMN
  m = norm.match(/^ALTER\s+TABLE\s+(?:IF EXISTS\s+)?(\w+)\s+ALTER\s+(?:COLUMN\s+)?(\w+)\s+(.+)$/i);
  if (m && state.tables.has(m[1])) {
    const t = state.tables.get(m[1]);
    const col = t.columns.find(c => c.name.toLowerCase() === m[2].toLowerCase());
    if (col) {
      const alter = m[3].replace(/;$/, '').trim();
      const aUpper = alter.toUpperCase();
      if (aUpper.startsWith('SET DATA TYPE ')) col.type = alter.replace(/SET DATA TYPE /i, '').trim();
      else if (aUpper.startsWith('TYPE ')) col.type = alter.replace(/TYPE /i, '').trim();
      else if (aUpper.startsWith('SET DEFAULT ')) col.default = alter.replace(/SET DEFAULT /i, '').trim();
      else if (aUpper.startsWith('DROP DEFAULT')) col.default = null;
      else if (aUpper.startsWith('SET NOT NULL')) col.nullable = false;
      else if (aUpper.startsWith('DROP NOT NULL')) col.nullable = true;
    }
    return;
  }
}

// ========================================================
// Generate output
// ========================================================

function generateBackup() {
  const out = [];
  out.push('-- ============================================');
  out.push('-- CLEAN BACKUP - Falco-Xnova Universe');
  out.push('-- Generated: ' + new Date().toISOString());
  out.push('-- Schema only + Admin account (zero progress)');
  out.push('-- ============================================');
  out.push('');
  out.push('BEGIN;');
  out.push('');
  
  if (state.extensions.size) {
    out.push('-- EXTENSIONS');
    for (const [, sql] of state.extensions) out.push(sql + ';');
    out.push('');
  }
  
  if (state.enums.size) {
    out.push('-- ENUM TYPES');
    for (const [, sql] of state.enums) out.push(sql + ';');
    out.push('');
  }
  
  if (state.sequences.size) {
    out.push('-- SEQUENCES');
    for (const [, sql] of state.sequences) out.push(sql + ';');
    out.push('');
  }
  
  out.push('-- TABLES');
  const sortedTables = [...state.tables.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, info] of sortedTables) {
    out.push(renderTable(name, info));
    out.push('');
  }
  
  if (state.constraints.size) {
    out.push('-- CONSTRAINTS');
    for (const c of state.constraints) out.push(c + ';');
    out.push('');
  }
  
  if (state.indexes.size) {
    out.push('-- INDEXES');
    const sorted = [...state.indexes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, sql] of sorted) out.push(sql + ';');
    out.push('');
  }
  
  if (state.rlsEnables.size) {
    out.push('-- ROW LEVEL SECURITY');
    for (const r of state.rlsEnables) out.push(r + ';');
    out.push('');
  }
  
  if (state.policies.length) {
    out.push('-- RLS POLICIES');
    for (const p of state.policies) out.push(p + ';');
    out.push('');
  }
  
  out.push('-- FUNCTIONS');
  const sortedFuncs = [...state.functions.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, sql] of sortedFuncs) {
    out.push(sql + ';');
    out.push('');
  }
  
  if (state.views.size) {
    out.push('-- VIEWS');
    for (const [, sql] of state.views) out.push(sql + ';');
    out.push('');
  }
  
  if (state.triggers.size) {
    out.push('-- TRIGGERS');
    for (const [, sql] of state.triggers) out.push(sql + ';');
    out.push('');
  }
  
  if (state.comments.size) {
    out.push('-- COMMENTS');
    for (const c of state.comments) out.push(c + ';');
    out.push('');
  }
  
  if (state.grants.size) {
    out.push('-- GRANTS');
    for (const g of state.grants) out.push(g + ';');
    out.push('');
  }
  
  if (state.seedInserts.size) {
    out.push('-- SEED DATA');
    const sorted = [...state.seedInserts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [table, sql] of sorted) out.push(sql);
    out.push('');
  }
  
  out.push('-- ADMIN ACCOUNT SETUP');
  out.push(`
-- Grant necessary permissions to service_role
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Create admin auth user (run via Supabase Auth UI or this SQL)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT 
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'falcoxcorp@admin.com',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"username":"falcoxcorp"}',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'falcoxcorp@admin.com');

-- Create admin profile with ZERO progress
INSERT INTO profiles (id, username, email, dark_matter, points_total, points_buildings, points_research, points_fleet, points_defense, is_admin, is_banned, vacation_mode, last_activity, created_at, updated_at)
SELECT 
  id, 'falcoxcorp', 'falcoxcorp@admin.com',
  0, 0, 0, 0, 0, 0,
  true, false, false,
  now(), now(), now()
FROM auth.users
WHERE email = 'falcoxcorp@admin.com'
  AND NOT EXISTS (SELECT 1 FROM profiles WHERE username = 'falcoxcorp');

-- Create admin main planet
INSERT INTO planets (user_id, name, galaxy, solar_system, position, planet_type, diameter, fields_used, fields_max, temp_min, temp_max, is_main_planet)
SELECT id, 'Planeta Admin', 1, 1, 1, 'planet', 16300, 0, 163, -40, 30, true
FROM profiles
WHERE username = 'falcoxcorp'
  AND NOT EXISTS (SELECT 1 FROM planets WHERE user_id = (SELECT id FROM profiles WHERE username = 'falcoxcorp') AND is_main_planet = true);

-- Create admin planet resources
INSERT INTO planet_resources (planet_id, metal, crystal, deuterium, energy, last_update)
SELECT id, 10000, 10000, 10000, 0, now()
FROM planets
WHERE user_id = (SELECT id FROM profiles WHERE username = 'falcoxcorp') AND is_main_planet = true
  AND NOT EXISTS (SELECT 1 FROM planet_resources WHERE planet_id = planets.id);
`);
  out.push('');
  
  out.push('COMMIT;');
  return out.join('\n');
}

// ========================================================
// Main
// ========================================================

function main() {
  console.log('Reading migration files...');
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  console.log('Found ' + files.length + ' migration files');
  
  let totalStmts = 0;
  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    processFile(content);
  }
  
  console.log('Tables: ' + state.tables.size);
  console.log('Functions: ' + state.functions.size);
  console.log('Triggers: ' + state.triggers.size);
  console.log('Policies: ' + state.policies.length);
  console.log('Indexes: ' + state.indexes.size);
  console.log('Views: ' + state.views.size);
  console.log('Grants: ' + state.grants.size);
  console.log('Constraints: ' + state.constraints.size);
  console.log('RLS enables: ' + state.rlsEnables.size);
  console.log('Seed inserts: ' + state.seedInserts.size);
  console.log('Enums: ' + state.enums.size);
  console.log('Sequences: ' + state.sequences.size);
  
  const output = generateBackup();
  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
  
  const size = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log('Generated: ' + OUTPUT_FILE + ' (' + size + ' MB)');
}

main();
