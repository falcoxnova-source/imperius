# Guia Completa de Instalacion - FALCO-X Universo

## INICIO RAPIDO (5 minutos)

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/xnova.git
cd xnova

# Generar configuracion automatica
./scripts/setup-env.sh self-hosted

# Generar certificados SSL (desarrollo)
./scripts/generate-ssl.sh self-signed

# Iniciar todos los servicios
docker compose --profile self-hosted up -d

# Ver logs
docker compose logs -f
```

**URLs disponibles:**
- Frontend: http://localhost (HTTP) / https://localhost (HTTPS)
- API Supabase: http://localhost:8000
- PostgreSQL: localhost:5432

**Valores por defecto (desarrollo):**
El sistema incluye valores por defecto que permiten iniciar sin configuracion adicional.
Para produccion, ejecuta `./scripts/setup-env.sh` para generar claves seguras.

---

## Tabla de Contenidos

1. [Requisitos Previos](#1-requisitos-previos)
2. [Configuracion de Supabase con Docker](#2-configuracion-de-supabase-con-docker)
3. [Variables de Entorno](#3-variables-de-entorno)
4. [Configuracion de la Base de Datos](#4-configuracion-de-la-base-de-datos)
5. [Despliegue de Edge Functions](#5-despliegue-de-edge-functions)
6. [Configuracion del Frontend](#6-configuracion-del-frontend)
7. [Configuracion de Telegram Bot](#7-configuracion-de-telegram-bot)
8. [Configuracion de Blockchain/Wallet](#8-configuracion-de-blockchainwallet)
9. [Configuracion de Email (SMTP)](#9-configuracion-de-email-smtp)
10. [Configuracion de AI Assistant](#10-configuracion-de-ai-assistant)
11. [Configuracion del Admin](#11-configuracion-del-admin)
12. [Verificacion Post-Instalacion](#12-verificacion-post-instalacion)
13. [Solucion de Problemas](#13-solucion-de-problemas)

---

## 1. Requisitos Previos

### Software Necesario

```bash
# Docker y Docker Compose
docker --version  # >= 20.10
docker-compose --version  # >= 2.0

# Node.js (para desarrollo local)
node --version  # >= 18.0

# Git
git --version
```

### Recursos del Servidor

- **CPU:** Minimo 2 cores (recomendado 4+)
- **RAM:** Minimo 4GB (recomendado 8GB+)
- **Almacenamiento:** Minimo 50GB SSD
- **Ancho de Banda:** Sin limite de transferencia recomendado

### Puertos Necesarios

| Puerto | Servicio | Descripcion |
|--------|----------|-------------|
| 80 | HTTP | Redireccion a HTTPS |
| 443 | HTTPS | Frontend y API |
| 5432 | PostgreSQL | Base de datos (interno) |
| 8000 | Kong API Gateway | API REST de Supabase |
| 9000 | Storage API | Almacenamiento de archivos |

---

## 2. Configuracion de Supabase con Docker

### 2.1 Clonar el Repositorio de Supabase

```bash
# Crear directorio para Supabase
mkdir -p /opt/supabase
cd /opt/supabase

# Clonar repositorio oficial
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
```

### 2.2 Configurar Variables de Entorno de Supabase

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar el archivo .env
nano .env
```

**Variables criticas a configurar en `/opt/supabase/supabase/docker/.env`:**

```env
############
# Secrets
############

# IMPORTANTE: Genera claves unicas y seguras
# Usar: openssl rand -base64 32

# Clave JWT para tokens de autenticacion (CAMBIA ESTO!)
JWT_SECRET=tu-super-secreto-jwt-de-al-menos-32-caracteres

# Clave para el servicio de autenticacion de Supabase
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Generar ANON_KEY y SERVICE_ROLE_KEY:
# Ir a: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys

############
# Database
############

POSTGRES_PASSWORD=tu-password-postgres-seguro
POSTGRES_DB=postgres
POSTGRES_PORT=5432

############
# API
############

# URL publica de tu servidor
SITE_URL=https://tu-dominio.com
API_EXTERNAL_URL=https://tu-dominio.com

# Configuracion de Studio (panel admin)
STUDIO_DEFAULT_ORGANIZATION=FALCO-X
STUDIO_DEFAULT_PROJECT=falco-x-universo

############
# Auth
############

# Deshabilitar confirmacion de email por defecto
GOTRUE_MAILER_AUTOCONFIRM=false
GOTRUE_SMTP_ADMIN_EMAIL=admin@tu-dominio.com

# Tiempo de expiracion de tokens (en segundos)
GOTRUE_JWT_EXP=3600

############
# Storage
############

# Limite de tamano de archivo (en bytes)
FILE_SIZE_LIMIT=52428800
```

### 2.3 Generar Claves JWT

Visita [https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys](https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys) o usa este script:

```bash
# Generar JWT_SECRET
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET: $JWT_SECRET"

# Generar claves (requiere Node.js)
npm install -g jwt-cli

# ANON_KEY (para clientes)
jwt encode --secret "$JWT_SECRET" '{"role":"anon","iss":"supabase","iat":1700000000,"exp":2000000000}'

# SERVICE_ROLE_KEY (para servidor - MANTENER SECRETO)
jwt encode --secret "$JWT_SECRET" '{"role":"service_role","iss":"supabase","iat":1700000000,"exp":2000000000}'
```

### 2.4 Iniciar Supabase

```bash
cd /opt/supabase/supabase/docker

# Descargar imagenes y iniciar servicios
docker-compose up -d

# Verificar que todos los servicios esten corriendo
docker-compose ps
```

**Servicios esperados:**

- `supabase-db` - PostgreSQL
- `supabase-kong` - API Gateway
- `supabase-auth` - GoTrue (autenticacion)
- `supabase-rest` - PostgREST
- `supabase-realtime` - Realtime subscriptions
- `supabase-storage` - Storage API
- `supabase-meta` - Postgres Meta
- `supabase-studio` - Dashboard web

### 2.5 Verificar Instalacion

```bash
# Verificar API
curl -I http://localhost:8000/rest/v1/

# Verificar Studio (panel admin)
# Acceder a: http://tu-servidor:3000
```

---

## 3. Variables de Entorno

### 3.1 Variables del Frontend (`.env`)

Crear archivo `.env` en la raiz del proyecto FALCO-X:

```env
# Supabase Connection
VITE_SUPABASE_URL=https://tu-dominio.com
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# BSC Web3 Configuration (informacion publica)
VITE_TOKEN_CONTRACT=0xd19C01DE3C379441c3F4e8af442E10a3EE440CdE
VITE_BSC_RPC_URL=https://bsc-dataseed1.binance.org
VITE_BSC_CHAIN_ID=56
VITE_BSCSCAN_API_KEY=TU_API_KEY_DE_BSCSCAN
```

### 3.2 Secretos de Edge Functions (Supabase Secrets)

Estos secretos se configuran en Supabase y estan disponibles automaticamente en las Edge Functions:

| Variable | Descripcion | Obligatorio |
|----------|-------------|-------------|
| `SUPABASE_URL` | URL de tu instancia Supabase | Auto |
| `SUPABASE_ANON_KEY` | Clave anonima para clientes | Auto |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (admin) | Auto |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram | Si |
| `WALLET_PRIVATE_KEY` | Clave privada de la wallet del servidor | Si |
| `DEEPSEEK_API_KEY` | API Key de DeepSeek para AI | Opcional |
| `DEEPSEEK_API_URL` | URL de la API DeepSeek | Opcional |

### 3.3 Configurar Secretos en Supabase

#### Opcion A: Via Supabase CLI

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login (si usas Supabase Cloud)
supabase login

# Configurar secretos
supabase secrets set TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
supabase secrets set WALLET_PRIVATE_KEY=0x1234567890abcdef...
supabase secrets set DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx
```

#### Opcion B: Via Docker (Self-hosted)

Agregar al archivo `docker-compose.yml` de Supabase en el servicio `functions`:

```yaml
services:
  functions:
    environment:
      - TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
      - WALLET_PRIVATE_KEY=0x1234567890abcdef...
      - DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx
      - DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
```

#### Opcion C: Via archivo `.env` para Functions

Crear `/opt/supabase/supabase/docker/volumes/functions/.env`:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
WALLET_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
```

---

## 4. Configuracion de la Base de Datos

### 4.1 Ejecutar Migraciones

Las migraciones estan en `supabase/migrations/`. Deben ejecutarse en orden numerico.

#### Opcion A: Via Supabase CLI

```bash
cd /ruta/al/proyecto/falco-x

# Vincular con tu proyecto
supabase link --project-ref tu-project-ref

# Ejecutar migraciones
supabase db push
```

#### Opcion B: Manualmente via psql

```bash
# Conectar a PostgreSQL
docker exec -it supabase-db psql -U postgres -d postgres

# Ejecutar cada migracion en orden
\i /ruta/a/migraciones/20260102224424_001_initial_schema.sql
\i /ruta/a/migraciones/20260102224535_002_seed_game_data.sql
# ... continuar con todas las migraciones
```

#### Opcion C: Script automatizado

Crear archivo `apply_migrations.sh`:

```bash
#!/bin/bash

# Configuracion
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
POSTGRES_DB="postgres"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="tu-password"

MIGRATIONS_DIR="./supabase/migrations"

# Aplicar migraciones en orden
for migration in $(ls -1 $MIGRATIONS_DIR/*.sql | sort); do
    echo "Aplicando: $migration"
    PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -f "$migration"
    if [ $? -ne 0 ]; then
        echo "ERROR en migracion: $migration"
        exit 1
    fi
    echo "OK: $migration"
done

echo "Todas las migraciones aplicadas correctamente!"
```

```bash
chmod +x apply_migrations.sh
./apply_migrations.sh
```

### 4.2 Verificar Migraciones

```sql
-- Conectar a la base de datos
-- Verificar tablas creadas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verificar que hay datos iniciales
SELECT COUNT(*) as buildings FROM building_types;
SELECT COUNT(*) as ships FROM ship_types;
SELECT COUNT(*) as defenses FROM defense_types;
SELECT COUNT(*) as technologies FROM technology_types;
```

### 4.3 Lista de Migraciones Importantes

| Migracion | Descripcion |
|-----------|-------------|
| 001_initial_schema | Esquema base, tablas principales |
| 002_seed_game_data | Datos iniciales (edificios, naves, etc) |
| 003-010 | RLS policies, colas, notificaciones |
| 011_officers_system | Sistema de oficiales |
| 015_debris_espionage | Sistema de escombros y espionaje |
| 041-050 | Sistema de wallet y FXU |
| 058-071 | Sistema de referidos |
| 075-093 | Sistema de admin y velocidad |
| 104-110 | Verificacion de email |
| 116-127 | Panel financiero admin |
| 149-154 | Oficiales con FXU |
| 163-168 | Anti-multicuenta |
| 172-175 | Soporte USDT y swap |
| 188-195 | Sistema de Jackpot |
| 198-203 | Tareas de Telegram |
| 217-220 | Hall of Fame |
| 222-228 | Chat publico y mercado |
| 229-251 | Sistema Plus y Supply Boxes |
| 252-266 | Seguridad de flotas y alianzas |

---

## 5. Despliegue de Edge Functions

### 5.1 Lista de Edge Functions

| Funcion | Proposito | Secretos Necesarios |
|---------|-----------|---------------------|
| `telegram-webhook` | Webhook para bot de Telegram | TELEGRAM_BOT_TOKEN |
| `send-verification-email` | Envio de emails de verificacion | - (usa SMTP de DB) |
| `send-password-reset-email` | Reset de password | - |
| `resend-verification-email` | Reenvio de verificacion | - |
| `process-withdrawal` | Procesar retiros de FXU | WALLET_PRIVATE_KEY |
| `auto-withdraw` | Retiros automaticos | WALLET_PRIVATE_KEY |
| `process-admin-withdrawal` | Retiros de admin | WALLET_PRIVATE_KEY |
| `verify-deposit` | Verificar depositos blockchain | - |
| `ai-assistant` | Asistente NOVA | DEEPSEEK_API_KEY |
| `token-price` | Obtener precio del token | - |
| `wallet-info` | Info de wallet del servidor | - |
| `send-telegram-broadcast` | Broadcast a Telegram | TELEGRAM_BOT_TOKEN |
| `sync-telegram-groups` | Sincronizar grupos | TELEGRAM_BOT_TOKEN |
| `verify-telegram-memberships` | Verificar membresias | TELEGRAM_BOT_TOKEN |
| `verify-my-telegram` | Verificar Telegram usuario | TELEGRAM_BOT_TOKEN |
| `notify-market-listing` | Notificar ventas mercado | TELEGRAM_BOT_TOKEN |
| `send-broadcast-email` | Email masivo | - |
| `admin-verify-user` | Admin verifica usuario | - |
| `admin-reset-password` | Admin reset password | - |
| `database-backup` | Backup de base de datos | - |
| `update-user-password` | Actualizar password | - |

### 5.2 Desplegar Edge Functions

#### Via Supabase CLI (Recomendado)

```bash
cd /ruta/al/proyecto/falco-x

# Desplegar todas las funciones
supabase functions deploy

# O desplegar una especifica
supabase functions deploy telegram-webhook
supabase functions deploy ai-assistant
```

#### Via Docker (Self-hosted)

1. Copiar funciones al volumen de Supabase:

```bash
cp -r supabase/functions/* /opt/supabase/supabase/docker/volumes/functions/
```

2. Reiniciar el servicio de functions:

```bash
cd /opt/supabase/supabase/docker
docker-compose restart functions
```

### 5.3 Configurar Webhook de Telegram

Despues de desplegar `telegram-webhook`, configurar el webhook:

```bash
# Reemplazar con tu token y URL
TELEGRAM_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
WEBHOOK_URL="https://tu-dominio.com/functions/v1/telegram-webhook"

curl -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${WEBHOOK_URL}\"}"
```

---

## 6. Configuracion del Frontend

### 6.1 Construir el Frontend

```bash
cd /ruta/al/proyecto/falco-x

# Instalar dependencias
npm install

# Construir para produccion
npm run build
```

### 6.2 Desplegar Frontend

Los archivos compilados estaran en `dist/`. Opciones de despliegue:

#### Opcion A: Nginx

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name tu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    root /var/www/falco-x/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy API requests to Supabase
    location /rest/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /functions/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### Opcion B: Docker

Crear `Dockerfile`:

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker build -t falco-x-frontend .
docker run -d -p 80:80 falco-x-frontend
```

---

## 7. Configuracion de Telegram Bot

### 7.1 Crear Bot en Telegram

1. Abrir Telegram y buscar `@BotFather`
2. Enviar `/newbot`
3. Seguir instrucciones para nombrar el bot
4. Guardar el **token** proporcionado

### 7.2 Configurar Permisos del Bot

Enviar a BotFather:

```
/setprivacy
```

Seleccionar tu bot y elegir `Disable` para que el bot pueda leer mensajes de grupo.

### 7.3 Configurar Comandos

```
/setcommands
```

Seleccionar tu bot y enviar:

```
start - Iniciar y obtener instrucciones
link - Vincular cuenta con codigo
status - Ver estado de vinculacion
verify - Verificar membresia de grupo
```

### 7.4 Agregar Bot a Grupo

1. Crear grupo de Telegram o usar existente
2. Agregar el bot como administrador
3. El bot automaticamente detectara el grupo

### 7.5 Configurar Webhook

```bash
TELEGRAM_TOKEN="TU_TOKEN"
WEBHOOK_URL="https://tu-dominio.com/functions/v1/telegram-webhook"

# Configurar webhook
curl -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${WEBHOOK_URL}\", \"allowed_updates\": [\"message\", \"chat_member\", \"my_chat_member\"]}"

# Verificar configuracion
curl "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getWebhookInfo"
```

---

## 8. Configuracion de Blockchain/Wallet

### 8.1 Crear Wallet del Servidor

La wallet del servidor es usada para enviar tokens FXU a los usuarios en retiros.

```bash
# Opcion 1: Usar ethers.js
node -e "
const { ethers } = require('ethers');
const wallet = ethers.Wallet.createRandom();
console.log('Address:', wallet.address);
console.log('Private Key:', wallet.privateKey);
console.log('Mnemonic:', wallet.mnemonic.phrase);
"

# IMPORTANTE: Guardar estos datos de forma segura!
```

### 8.2 Fondear la Wallet

La wallet del servidor necesita:

1. **BNB** - Para pagar gas de transacciones (~0.01 BNB minimo)
2. **FXU Tokens** - Los tokens a distribuir

### 8.3 Configurar Direccion de Deposito

En el panel de admin o directamente en la base de datos:

```sql
-- Configurar direccion de deposito
UPDATE wallet_config
SET deposit_wallet_address = '0xTuDireccionDeDeposito'
WHERE id = '00000000-0000-0000-0000-000000000001';
```

### 8.4 Variables de Blockchain

```env
# En el .env del frontend
VITE_TOKEN_CONTRACT=0xd19C01DE3C379441c3F4e8af442E10a3EE440CdE
VITE_BSC_RPC_URL=https://bsc-dataseed1.binance.org
VITE_BSC_CHAIN_ID=56
VITE_BSCSCAN_API_KEY=TU_API_KEY

# En secretos de Edge Functions
WALLET_PRIVATE_KEY=0x...tu-clave-privada-sin-el-0x-o-con-el-0x
```

---

## 9. Configuracion de Email (SMTP)

### 9.1 Configurar SMTP en Panel Admin

Acceder al juego como admin y ir a:
**Admin > Email > Configuracion SMTP**

Configurar:

| Campo | Ejemplo |
|-------|---------|
| SMTP Host | smtp.gmail.com |
| SMTP Port | 587 |
| SMTP User | tu-email@gmail.com |
| SMTP Password | tu-app-password |
| From Email | noreply@tu-dominio.com |
| From Name | FALCO-X Universo |
| Enabled | true |

### 9.2 Configuracion para Gmail

1. Ir a [Google Account Security](https://myaccount.google.com/security)
2. Activar "2-Step Verification"
3. Crear "App password" para email
4. Usar ese password en SMTP

### 9.3 Configuracion Alternativa via SQL

```sql
INSERT INTO admin_smtp_settings (
    id,
    smtp_host,
    smtp_port,
    smtp_user,
    smtp_password,
    smtp_from_email,
    smtp_from_name,
    is_enabled
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'smtp.gmail.com',
    587,
    'tu-email@gmail.com',
    'tu-app-password',
    'noreply@tu-dominio.com',
    'FALCO-X Universo',
    true
) ON CONFLICT (id) DO UPDATE SET
    smtp_host = EXCLUDED.smtp_host,
    smtp_port = EXCLUDED.smtp_port,
    smtp_user = EXCLUDED.smtp_user,
    smtp_password = EXCLUDED.smtp_password,
    smtp_from_email = EXCLUDED.smtp_from_email,
    smtp_from_name = EXCLUDED.smtp_from_name,
    is_enabled = EXCLUDED.is_enabled;
```

---

## 10. Configuracion de AI Assistant

### 10.1 Obtener API Key de DeepSeek

1. Ir a [DeepSeek Platform](https://platform.deepseek.com/)
2. Crear cuenta o iniciar sesion
3. Ir a API Keys
4. Crear nueva API Key
5. Copiar la key (empieza con `sk-`)

### 10.2 Configurar Secreto

```bash
# Via Supabase CLI
supabase secrets set DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx
supabase secrets set DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions

# O en docker-compose.yml / .env de functions
```

### 10.3 Verificar Funcionamiento

El AI Assistant (NOVA) funcionara automaticamente cuando los usuarios lo usen en el juego. Si no hay API key configurada, usara respuestas de fallback locales.

---

## 11. Configuracion del Admin

### 11.1 Crear Cuenta Admin

El sistema automaticamente marca como admin al usuario con email `angel@feitox.com`. Para cambiar esto, editar la migracion o ejecutar:

```sql
-- Hacer admin a un usuario existente
UPDATE profiles
SET is_admin = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'tu-email-admin@dominio.com');
```

### 11.2 Configuraciones de Juego (Admin Panel)

Una vez como admin, ir a **Admin** y configurar:

#### Velocidad del Juego

| Configuracion | Valor por Defecto | Descripcion |
|---------------|-------------------|-------------|
| Game Speed | 1 | Multiplicador de construccion/investigacion |
| Fleet Speed | 1 | Multiplicador de velocidad de flotas |
| Resource Speed | 1 | Multiplicador de produccion |

#### Tarifas y Comisiones

| Configuracion | Valor Recomendado | Descripcion |
|---------------|-------------------|-------------|
| Market Fee | 5% | Comision por ventas en mercado |
| Referral Commission | 10% | Comision para referidores |
| Expedition Fee | 1000 FXU | Costo extra por expedicion |

#### Wallet y Retiros

- Habilitar/deshabilitar depositos
- Habilitar/deshabilitar retiros
- Configurar monto minimo de retiro
- Ver transacciones pendientes

### 11.3 Comandos Utiles de Admin

```sql
-- Ver todos los admins
SELECT id, username, email, is_admin FROM profiles WHERE is_admin = true;

-- Ver estadisticas del servidor
SELECT * FROM get_server_stats();

-- Ver balance de FXU total en circulacion
SELECT SUM(fxu_balance) as total_fxu FROM profiles;

-- Ver transacciones pendientes
SELECT * FROM wallet_transactions WHERE status = 'pending';
```

---

## 12. Verificacion Post-Instalacion

### 12.1 Checklist de Verificacion

```bash
# 1. Verificar servicios de Docker
docker-compose ps
# Todos deben estar "Up"

# 2. Verificar API de Supabase
curl -I https://tu-dominio.com/rest/v1/
# Debe retornar 200 OK

# 3. Verificar Edge Functions
curl https://tu-dominio.com/functions/v1/token-price
# Debe retornar precio del token

# 4. Verificar webhook de Telegram
curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
# Debe mostrar la URL configurada

# 5. Verificar base de datos
docker exec -it supabase-db psql -U postgres -c "SELECT COUNT(*) FROM building_types;"
# Debe retornar > 0
```

### 12.2 Pruebas Funcionales

1. **Registro de Usuario**
   - Crear cuenta nueva
   - Verificar que recibe email de verificacion
   - Verificar que el planeta se crea correctamente

2. **Sistema de Juego**
   - Construir un edificio
   - Produccion de recursos funciona
   - Investigar tecnologia

3. **Telegram**
   - Enviar `/start` al bot
   - Vincular cuenta con codigo
   - Verificar membresia de grupo

4. **Wallet**
   - Ver balance de FXU
   - Solicitar retiro (como prueba)

5. **Admin**
   - Acceder al panel admin
   - Cambiar configuracion de juego
   - Ver estadisticas financieras

---

## 13. Solucion de Problemas

### Error: "Email not confirmed"

```sql
-- Verificar manualmente un usuario
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = 'usuario@email.com';
```

### Error: "CORS blocked"

Verificar que las Edge Functions tienen headers CORS:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
```

### Error: "Insufficient gas" en retiros

La wallet del servidor necesita BNB para gas:

```bash
# Verificar balance
curl "https://api.bscscan.com/api?module=account&action=balance&address=TU_WALLET_ADDRESS&apikey=TU_API_KEY"
```

### Error: "Database connection failed"

```bash
# Verificar que PostgreSQL esta corriendo
docker logs supabase-db

# Reiniciar servicio
docker-compose restart db
```

### Error: Edge Function no responde

```bash
# Ver logs de la funcion
supabase functions logs nombre-funcion

# O via Docker
docker logs supabase-functions
```

### Telegram no recibe updates

```bash
# Eliminar webhook actual
curl "https://api.telegram.org/bot${TOKEN}/deleteWebhook"

# Esperar 1 minuto y volver a configurar
curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -d "url=https://tu-dominio.com/functions/v1/telegram-webhook"
```

### Recursos no se producen

```sql
-- Verificar que el usuario no esta en modo vacaciones
SELECT vacation_mode FROM profiles WHERE username = 'nombre_usuario';

-- Forzar calculo de recursos
SELECT calculate_planet_resources(planet_id) FROM planets WHERE user_id = 'user_uuid';
```

---

## Resumen de Archivos Importantes

| Archivo | Ubicacion | Proposito |
|---------|-----------|-----------|
| `.env` | Raiz proyecto | Variables frontend |
| `docker-compose.yml` | /opt/supabase/.../docker/ | Servicios Supabase |
| `.env` | /opt/supabase/.../docker/ | Config Supabase |
| Migraciones | supabase/migrations/ | Esquema de DB |
| Edge Functions | supabase/functions/ | APIs del servidor |

---

## Contacto y Soporte

Para soporte adicional:
- Revisar logs: `docker-compose logs -f`
- Verificar estado de servicios: `docker-compose ps`
- Consultar documentacion de Supabase: https://supabase.com/docs

---

## 14. Despliegue Rapido con Docker Compose

Este metodo permite desplegar todo el frontend de Xnova con un solo comando.

### 14.1 Opcion A: Frontend con Supabase Cloud (Recomendado)

Usa esta opcion si ya tienes Supabase configurado en la nube.

```bash
# 1. Copiar archivo de ejemplo
cp .env.docker.example .env

# 2. Editar .env con tus credenciales
nano .env

# 3. Construir y ejecutar
docker-compose up -d --build

# 4. Ver logs
docker-compose logs -f
```

El frontend estara disponible en:
- HTTP: http://localhost:80
- HTTPS: https://localhost:443 (requiere certificados SSL)

**Configurar SSL:**

```bash
# Crear directorio para certificados
mkdir -p nginx/ssl

# Copiar tus certificados
cp /path/to/fullchain.pem nginx/ssl/
cp /path/to/privkey.pem nginx/ssl/
```

### 14.2 Opcion B: Todo Local (Supabase Self-Hosted)

Despliega tanto el frontend como Supabase localmente.

```bash
# 1. Configurar variables
cp .env.docker.example .env
nano .env

# 2. Iniciar todo el stack
docker-compose -f docker-compose.local.yml up -d --build

# 3. Verificar servicios
docker-compose -f docker-compose.local.yml ps
```

**Servicios disponibles:**

| Servicio | Puerto | URL |
|----------|--------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Supabase API | 8000 | http://localhost:8000 |
| PostgreSQL | 5432 | localhost:5432 |

### 14.3 Comandos Utiles

```bash
# Detener servicios
docker-compose down

# Ver logs de un servicio especifico
docker-compose logs -f xnova-frontend

# Reconstruir despues de cambios
docker-compose up -d --build

# Limpiar todo (incluyendo volumenes)
docker-compose down -v

# Escalar multiples instancias (load balancing)
docker-compose up -d --scale xnova-frontend=3
```

### 14.4 Estructura de Archivos Docker

```
proyecto/
├── docker-compose.yml          # Produccion con Supabase Cloud
├── docker-compose.local.yml    # Todo local (self-hosted)
├── Dockerfile                  # Imagen del frontend
├── .dockerignore               # Archivos excluidos
├── .env.docker.example         # Template de variables
├── nginx/
│   ├── nginx.conf              # Configuracion principal nginx
│   ├── default.conf            # Server blocks
│   └── ssl/                    # Certificados SSL
├── kong/
│   └── kong.yml                # API Gateway config (local)
└── DATABASE_BACKUP_FULL.sql    # Backup para restaurar BD
```

### 14.5 Restaurar Base de Datos

Si usas `docker-compose.local.yml`, el archivo `DATABASE_BACKUP_FULL.sql` se ejecuta automaticamente al iniciar PostgreSQL por primera vez.

Para restaurar manualmente:

```bash
# Copiar backup al contenedor
docker cp DATABASE_BACKUP_FULL.sql xnova-supabase-db:/tmp/

# Ejecutar restauracion
docker exec -it xnova-supabase-db psql -U postgres -d postgres -f /tmp/DATABASE_BACKUP_FULL.sql
```

---

*Documento generado para FALCO-X Universo v1.0*
*Ultima actualizacion: Enero 2026*
