const fs = require('fs');
const f = fs.readFileSync('deploy_backup.sql', 'utf8');

const s = f.indexOf('SET session_replication_role = replica');
const e = f.indexOf('SET session_replication_role = origin');
const section = f.substring(s, e);

const m = section.match(/TRUNCATE TABLE "(\w+)"/g);
if (m) {
  const names = [...new Set(m.map(x => x.match(/"(\w+)"/)[1]))];
  console.log('Tables truncated (' + names.length + '):');
  names.sort().forEach(n => {
    // Check if this table has seed data
    const seedRegex = new RegExp('INSERT INTO ' + n + '.*ON CONFLICT', 'is');
    const hasSeed = seedRegex.test(f);
    const marker = hasSeed ? ' *** HAS SEED DATA! ***' : '';
    console.log('  ' + n + marker);
  });
}
