/**
 * XNOVA - SSL Certificate Generator (Node.js)
 *
 * Genera certificados SSL autofirmados para desarrollo local.
 * Compatible con Windows, Linux y macOS.
 *
 * Uso: node scripts/generate-ssl.mjs
 *
 * Requiere: OpenSSL instalado en el sistema
 *   - Windows: https://slproweb.com/products/Win32OpenSSL.html
 *     o usar: winget install OpenSSL.Light
 *   - Linux:   sudo apt install openssl
 *   - macOS:   brew install openssl
 *
 * Alternativa sin OpenSSL: usar Docker (ver nginx/ssl/README.txt)
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sslDir = join(__dirname, '..', 'nginx', 'ssl');

if (!existsSync(sslDir)) {
  mkdirSync(sslDir, { recursive: true });
}

console.log('🔐 XNOVA - Generando certificados SSL para desarrollo...\n');

const keyPath = join(sslDir, 'privkey.pem');
const certPath = join(sslDir, 'fullchain.pem');

try {
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/CN=localhost/O=Xnova Development" -addext "subjectAltName=DNS:localhost,DNS:xnova.xyz,IP:127.0.0.1"`,
    { stdio: 'inherit', timeout: 30000 }
  );

  console.log('✅ Certificados generados exitosamente!');
  console.log(`   ${certPath}`);
  console.log(`   ${keyPath}`);
  console.log('');
  console.log('📝 Para habilitar HTTPS en nginx:');
  console.log('   1. cp nginx/default-ssl.conf.template nginx/default-ssl.conf');
  console.log('   2. docker compose build frontend');
  console.log('   3. docker compose up -d frontend');
  console.log('');
} catch {
  console.log('❌ OpenSSL no encontrado en el sistema.');
  console.log('');
  console.log('💡 Opciones para generar los certificados:');
  console.log('');
  console.log('   A) Instalar OpenSSL:');
  console.log('      winget install OpenSSL.Light');
  console.log('');
  console.log('   B) Usar Docker (recomendado):');
  console.log('      docker run --rm -v "%cd%/nginx/ssl:/ssl" alpine sh -c "apk add openssl && openssl req -x509 -newkey rsa:2048 -keyout /ssl/privkey.pem -out /ssl/fullchain.pem -days 3650 -nodes -subj \'/CN=localhost\'"');
  console.log('');
  console.log('   C) Usar Git Bash (si tienes Git instalado):');
  console.log('      bash scripts/generate-ssl.sh self-signed');
  console.log('');
  console.log('⚠️  HTTPS NO se habilitará hasta que generes los certificados.');
  console.log('   El juego funciona perfectamente en HTTP (puerto 80) sin SSL.\n');
}
