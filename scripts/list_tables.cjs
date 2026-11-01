const fs = require('fs');
const content = fs.readFileSync('deploy_backup.sql', 'utf8');

// Extract table names from CREATE TABLE IF NOT EXISTS statements
const tableRegex = /CREATE TABLE IF NOT EXISTS "?(\w+)"?/gi;
const tables = new Set();
let m;
while ((m = tableRegex.exec(content)) !== null) {
  tables.add(m[1].toLowerCase());
}

const sorted = [...tables].sort();
console.log('Total tables: ' + sorted.length);
console.log('');
sorted.forEach(t => console.log('  ' + t));
