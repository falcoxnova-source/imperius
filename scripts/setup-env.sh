#!/bin/bash
# =============================================================================
# XNOVA - ENVIRONMENT SETUP SCRIPT
# =============================================================================
#
# This script generates a complete .env file with secure random values
# for all required environment variables.
#
# Usage:
#   ./scripts/setup-env.sh [mode]
#
# Modes:
#   cloud       - Only frontend variables (uses Supabase Cloud)
#   self-hosted - All variables for local Supabase deployment
#   full        - All variables including optional ones (default)
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default mode
MODE="${1:-full}"
ENV_FILE=".env"

# -----------------------------------------------------------------------------
# HELPER FUNCTIONS
# -----------------------------------------------------------------------------

print_header() {
    echo ""
    echo -e "${BLUE}=============================================${NC}"
    echo -e "${BLUE}  XNOVA Environment Setup${NC}"
    echo -e "${BLUE}=============================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${CYAN}[i]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Generate a random string of specified length
generate_random() {
    local length="${1:-32}"
    openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c "$length"
}

# Generate a random hex string
generate_hex() {
    local length="${1:-32}"
    openssl rand -hex "$((length/2))"
}

# Generate JWT token for Supabase
generate_jwt() {
    local role="$1"
    local secret="$2"
    local iat=$(date +%s)
    local exp=$((iat + 315360000)) # 10 years

    # Header
    local header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

    # Payload
    local payload=$(echo -n "{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$iat,\"exp\":$exp}" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

    # Signature
    local signature=$(echo -n "$header.$payload" | openssl dgst -sha256 -hmac "$secret" -binary | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

    echo "$header.$payload.$signature"
}

# -----------------------------------------------------------------------------
# MAIN SCRIPT
# -----------------------------------------------------------------------------

print_header

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}WARNING: .env file already exists!${NC}"
    read -p "Do you want to overwrite it? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "Keeping existing .env file"
        exit 0
    fi
    # Backup existing file
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    print_info "Backup created: ${ENV_FILE}.backup.*"
fi

print_info "Generating secure environment variables..."
print_info "Mode: $MODE"
echo ""

# -----------------------------------------------------------------------------
# GENERATE SECURE VALUES
# -----------------------------------------------------------------------------

# Core secrets
JWT_SECRET=$(generate_random 64)
POSTGRES_PASSWORD=$(generate_random 32)
REALTIME_ENC_KEY=$(generate_hex 32)
REALTIME_SECRET_BASE=$(generate_random 64)

# Generate Supabase API keys
ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET")
SERVICE_ROLE_KEY=$(generate_jwt "service_role" "$JWT_SECRET")

# -----------------------------------------------------------------------------
# CREATE .ENV FILE
# -----------------------------------------------------------------------------

cat > "$ENV_FILE" << EOF
# =============================================================================
# XNOVA - ENVIRONMENT CONFIGURATION
# =============================================================================
# Generated on: $(date)
# Mode: $MODE
#
# IMPORTANT: Keep this file secure and never commit to version control!
# =============================================================================



# =============================================================================
# FRONTEND CONFIGURATION (REQUIRED)
# =============================================================================
# These variables are embedded into the React build.
# For Cloud mode: Get these from your Supabase Dashboard > Settings > API
# For Self-Hosted: These are auto-generated below
# =============================================================================

EOF

if [ "$MODE" = "cloud" ]; then
    cat >> "$ENV_FILE" << EOF
# TODO: Replace with your Supabase Cloud credentials
# Get from: https://supabase.com/dashboard/project/_/settings/api
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
EOF
else
    cat >> "$ENV_FILE" << EOF
# Self-hosted Supabase URL (Kong API Gateway)
VITE_SUPABASE_URL=http://localhost:8000

# Auto-generated anon key (matches JWT_SECRET below)
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF
fi

cat >> "$ENV_FILE" << EOF

# Site URL - Change to your actual domain in production
SITE_URL=http://localhost



# =============================================================================
# BLOCKCHAIN CONFIGURATION (BSC)
# =============================================================================
# FXU Token and Binance Smart Chain integration
# =============================================================================

# FXU Token contract address on BSC Mainnet
VITE_TOKEN_CONTRACT=0xd19C01DE3C379441c3F4e8af442E10a3EE440CdE

# BSC RPC endpoint (public, may have rate limits)
VITE_BSC_RPC_URL=https://bsc-dataseed1.binance.org

# BSC Chain ID (56 = Mainnet, 97 = Testnet)
VITE_BSC_CHAIN_ID=56

# BscScan API key (optional, for better rate limits)
# Get from: https://bscscan.com/myapikey
VITE_BSCSCAN_API_KEY=

EOF

if [ "$MODE" != "cloud" ]; then
    cat >> "$ENV_FILE" << EOF


# =============================================================================
# SELF-HOSTED SUPABASE (REQUIRED for self-hosted mode)
# =============================================================================
# These are auto-generated secure values for local Supabase deployment
# =============================================================================

# -----------------------------------------------------------------------------
# DATABASE
# -----------------------------------------------------------------------------
# PostgreSQL superuser password
# WARNING: Changing this after first run requires database reset!
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# PostgreSQL external port (change if 5432 is in use)
POSTGRES_PORT=5432



# -----------------------------------------------------------------------------
# JWT AUTHENTICATION
# -----------------------------------------------------------------------------
# Secret for signing JWT tokens - CRITICAL SECURITY VALUE
# WARNING: Changing this invalidates ALL existing sessions!
JWT_SECRET=$JWT_SECRET

# Token expiration in seconds (3600 = 1 hour)
JWT_EXPIRY=3600



# -----------------------------------------------------------------------------
# SUPABASE API KEYS
# -----------------------------------------------------------------------------
# These are derived from JWT_SECRET above
# ANON_KEY: Public key for client-side use (safe to expose)
SUPABASE_ANON_KEY=$ANON_KEY

# SERVICE_ROLE_KEY: Admin key - NEVER expose to frontend!
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY



# -----------------------------------------------------------------------------
# REALTIME SERVICE
# -----------------------------------------------------------------------------
# Encryption key for realtime connections (exactly 32 chars)
REALTIME_ENC_KEY=$REALTIME_ENC_KEY

# Phoenix framework secret key base
REALTIME_SECRET_KEY_BASE=$REALTIME_SECRET_BASE



# -----------------------------------------------------------------------------
# API GATEWAY (Kong)
# -----------------------------------------------------------------------------
# External URL for OAuth redirects
API_EXTERNAL_URL=http://localhost:8000

# Kong ports (change if defaults conflict)
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

EOF
fi

if [ "$MODE" = "full" ] || [ "$MODE" = "self-hosted" ]; then
    cat >> "$ENV_FILE" << EOF


# =============================================================================
# EMAIL CONFIGURATION (SMTP)
# =============================================================================
# Required for password reset, email verification, notifications
# Leave empty to disable email features
# =============================================================================

# SMTP server hostname
# Examples: smtp.gmail.com, smtp.sendgrid.net, smtp.mailgun.org
SMTP_HOST=

# SMTP port (587 = TLS recommended, 465 = SSL, 25 = plain)
SMTP_PORT=587

# SMTP authentication
SMTP_USER=
SMTP_PASS=

# Admin email for system notifications
SMTP_ADMIN_EMAIL=admin@localhost

# Sender name shown in emails
SMTP_SENDER_NAME=Xnova Game

# Auto-confirm emails without verification (true for dev, false for prod)
ENABLE_EMAIL_AUTOCONFIRM=true

# Email rate limit per hour
RATE_LIMIT_EMAIL=100



# =============================================================================
# STORAGE CONFIGURATION
# =============================================================================

# Maximum upload size in bytes (50MB default)
STORAGE_FILE_SIZE_LIMIT=52428800



# =============================================================================
# OPTIONAL SETTINGS
# =============================================================================

# Disable new user registration (true/false)
DISABLE_SIGNUP=false

# Additional OAuth redirect URLs (comma-separated)
ADDITIONAL_REDIRECT_URLS=

EOF
fi

cat >> "$ENV_FILE" << EOF


# =============================================================================
# EDGE FUNCTION SECRETS
# =============================================================================
# These should be configured in Supabase Dashboard > Edge Functions > Secrets
# DO NOT put sensitive keys here in production!
# =============================================================================

# Wallet private key for withdrawals (NEVER commit real key!)
# WALLET_PRIVATE_KEY=

# Telegram bot token
# TELEGRAM_BOT_TOKEN=

# OpenAI API key for AI assistant
# OPENAI_API_KEY=

# Resend API key for emails
# RESEND_API_KEY=
EOF

# -----------------------------------------------------------------------------
# SUCCESS MESSAGE
# -----------------------------------------------------------------------------

echo ""
print_success ".env file created successfully!"
echo ""

echo -e "${CYAN}Generated values:${NC}"
echo "  - JWT_SECRET:     ${JWT_SECRET:0:20}..."
echo "  - POSTGRES_PASS:  ${POSTGRES_PASSWORD:0:10}..."
echo "  - ANON_KEY:       ${ANON_KEY:0:30}..."
echo "  - SERVICE_KEY:    ${SERVICE_ROLE_KEY:0:30}..."
echo ""

if [ "$MODE" = "cloud" ]; then
    print_warning "Cloud mode: Update VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
    echo ""
    echo "Next steps:"
    echo "  1. Edit .env and add your Supabase Cloud credentials"
    echo "  2. Run: docker compose up -d"
else
    echo "Next steps:"
    echo "  1. (Optional) Edit .env for custom configuration"
    echo "  2. Generate SSL: ./scripts/generate-ssl.sh self-signed"
    echo "  3. Deploy: docker compose --profile self-hosted up -d"
fi
echo ""
echo "View logs: docker compose logs -f"
echo ""
