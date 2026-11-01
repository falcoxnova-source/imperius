import bcrypt from 'bcryptjs';
import { writeFileSync } from 'fs';

const password = 'Chang3M3-2024';
const email = 'falcoxcorp@gmail.com';
const hash = bcrypt.hashSync(password, 10);

console.log('Generated hash:', hash);

// Verify
const match = bcrypt.compareSync(password, hash);
console.log('Self-verify:', match);

const sql = `UPDATE auth.users SET encrypted_password = '${hash}' WHERE email = '${email}';`;
writeFileSync('tmp_update_pwd.sql', sql);
console.log('SQL written to tmp_update_pwd.sql');
