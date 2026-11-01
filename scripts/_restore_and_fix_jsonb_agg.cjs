// Restore from snapshot before the bad fix, then apply jsonb_agg(x) -> jsonb_agg(obj) fix
// globally inside bot_ai_tick, aliasing each SELECT jsonb_build_object(...) with "AS obj".
const { Client } = require('pg');
const fs = require('fs');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Step 1: restore from snapshot (has the correct fleet_save block AND the precall debug log).
  const snapshotSql = fs.readFileSync('scripts/_bot_ai_tick_precall_debug.sql', 'utf8');
  console.log('Restoring from snapshot, size:', snapshotSql.length);
  await c.query(snapshotSql);
  console.log('✅ Snapshot restored');

  // Step 2: read back the function and transform it.
  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  let src = r.rows[0].prosrc;

  const before = (src.match(/jsonb_agg\(x\)/g) || []).length;
  console.log('jsonb_agg(x) occurrences before fix:', before);

  // Transform:
  //   SELECT jsonb_build_object(...)          ->   SELECT jsonb_build_object(...) AS obj
  //   SELECT jsonb_agg(x) FROM (...) x        ->   SELECT jsonb_agg(obj) FROM (...) sub
  //
  // Strategy: for each block "SELECT jsonb_agg(x) FROM (", find the matching closing ") x"
  // and transform inside.

  function findMatchingClose(s, openIdx) {
    // We know there's one top-level subquery. Find depth-balanced ')' then expect " x"
    let depth = 1;
    let i = openIdx + 1;
    while (i < s.length && depth > 0) {
      const ch = s[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth === 0) return i;
      i++;
    }
    return -1;
  }

  let idx = 0;
  let changed = 0;
  while (true) {
    const i = src.indexOf('jsonb_agg(x) FROM (', idx);
    if (i < 0) break;
    const parenStart = src.indexOf('(', i + 'jsonb_agg(x) FROM '.length - 1);
    const parenEnd = findMatchingClose(src, parenStart);
    if (parenEnd < 0) { console.error('no matching paren at', i); break; }
    // After parenEnd, expect whitespace + "x" (the alias)
    let afterEnd = parenEnd + 1;
    // skip whitespace
    while (afterEnd < src.length && /\s/.test(src[afterEnd])) afterEnd++;
    if (src[afterEnd] !== 'x') {
      console.error('expected x alias at', afterEnd, 'found:', src.substring(afterEnd, afterEnd + 10));
      idx = parenEnd + 1;
      continue;
    }
    const xEnd = afterEnd + 1;

    const inner = src.substring(parenStart + 1, parenEnd); // content inside (...)
    // Add "AS obj" to each SELECT jsonb_build_object(...). A simple & robust transform:
    // replace ")" immediately before "WHERE" or end-of-SELECT with ") AS obj". But simplest:
    // wrap each SELECT line: find "SELECT jsonb_build_object(" ... matching ")" and append " AS obj".
    const newInner = inner.replace(
      /SELECT\s+jsonb_build_object\s*\(/g,
      (match) => match // placeholder; real transform below
    );

    // Do proper paren-balanced replace:
    let out = '';
    let j = 0;
    while (j < inner.length) {
      const sel = inner.indexOf('SELECT', j);
      if (sel < 0) { out += inner.substring(j); break; }
      out += inner.substring(j, sel);
      // find jsonb_build_object(
      const jbo = inner.indexOf('jsonb_build_object(', sel);
      // find any ( after SELECT before next SELECT
      const nextSel = inner.indexOf('SELECT', sel + 6);
      if (jbo < 0 || (nextSel >= 0 && jbo > nextSel)) {
        // no jsonb_build_object in this SELECT, copy as-is up to nextSel
        if (nextSel < 0) { out += inner.substring(sel); break; }
        out += inner.substring(sel, nextSel);
        j = nextSel;
        continue;
      }
      // balanced close for jsonb_build_object(
      const openParen = jbo + 'jsonb_build_object'.length;
      let d = 1, k = openParen + 1;
      while (k < inner.length && d > 0) {
        if (inner[k] === '(') d++;
        else if (inner[k] === ')') d--;
        if (d === 0) break;
        k++;
      }
      const closeParen = k;
      // append "SELECT ... jsonb_build_object(...)" + " AS obj"
      out += inner.substring(sel, closeParen + 1) + ' AS obj';
      j = closeParen + 1;
    }

    const newBlock = 'jsonb_agg(obj) FROM (' + out + ') sub';
    const before2 = src.substring(0, i);
    const after2 = src.substring(xEnd);
    src = before2 + newBlock + after2;
    idx = before2.length + newBlock.length;
    changed++;
  }

  const after = (src.match(/jsonb_agg\(x\)/g) || []).length;
  const afterObj = (src.match(/jsonb_agg\(obj\)/g) || []).length;
  console.log('changed blocks:', changed, '| after: jsonb_agg(x)=', after, 'jsonb_agg(obj)=', afterObj);

  const sigRes = await c.query(`SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const { args, ret, lanname } = sigRes.rows[0];

  const sql = `CREATE OR REPLACE FUNCTION public.bot_ai_tick(${args}) RETURNS ${ret} LANGUAGE ${lanname} AS $BOTAITICK$\n${src}\n$BOTAITICK$;`;
  fs.writeFileSync('scripts/_bot_ai_tick_jsonb_alias_fix.sql', sql);
  console.log('Wrote SQL, size:', sql.length);

  try {
    await c.query(sql);
    console.log('✅ bot_ai_tick updated with jsonb alias fix on all blocks');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }

  await c.end();
})();
