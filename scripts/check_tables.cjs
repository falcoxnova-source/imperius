const fs = require('fs');
const path = require('path');
const dir = 'supabase/migrations';

const searchTables = [
  'espionage_reports', 'forum_topics', 'forum_posts', 'forum_categories',
  'p2p_transactions', 'p2p_chat_messages', 'p2p_evidence',
  'daily_mission_types', 'autopilot_events', 'cosmetic_purchases',
  'hall_of_fame_entries', 'jackpot_contributions',
  'moon_buildings', 'referral_links', 'fleet_acceleration_log',
];

for (const table of searchTables) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  let found = false;

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes(table)) {
      const idx = content.indexOf(table);
      const start = Math.max(0, idx - 60);
      const ctx = content.substring(start, idx + table.length + 60);
      if (/CREATE\s+TABLE/i.test(ctx) || /ALTER\s+TABLE/i.test(ctx)) {
        const line = ctx.substring(0, 120).replace(/\n/g, ' ');
        console.log(table + ': IN ' + file + ' -> ' + line);
        found = true;
      }
    }
  }

  if (!found) {
    const singular = table.endsWith('s') ? table.slice(0, -1) : table;
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      if (content.includes(singular)) {
        const idx = content.indexOf(singular);
        const start = Math.max(0, idx - 60);
        const ctx = content.substring(start, idx + singular.length + 60);
        if (/CREATE\s+TABLE/i.test(ctx) || /ALTER\s+TABLE/i.test(ctx)) {
          const line = ctx.replace(/\n/g, ' ').substring(0, 120);
          console.log(table + ': found as "' + singular + '" in ' + file + ' -> ' + line);
          found = true;
          break;
        }
      }
    }
  }

  if (!found) {
    console.log(table + ': NOT FOUND anywhere');
  }
}
