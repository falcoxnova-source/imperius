#!/bin/bash
# =============================================================================
# XNOVA - SSL CERTIFICATE GENERATOR
# =============================================================================
#
# This script generates SSL certificates for the Xnova game.
# It supports two modes:
#   1. Self-signed certificates (for development/testing)
#   2. Let's Encrypt certificates (for production)
#
# Usage:
#   ./scripts/generate-ssl.sh [mode] [domain]
#
# Examples:
#   ./scripts/generate-ssl.sh self-signed              # Development
#   ./scripts/generate-ssl.sh letsencrypt xnova.com    # Production
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MODE="${1:-self-signed}"
DOMAIN="${2:-localhost}"
SSL_DIR="./nginx/ssl"
CERT_DAYS=365

# -----------------------------------------------------------------------------
# HELPER FUNCTIONS
# -----------------------------------------------------------------------------

print_header() {
    echo -e "\n${BLUE}=============================================${NC}"
    echo -e "${BLUE}  XNOVA SSL Certificate Generator${NC}"
    echo -e "${BLUE}=============================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# -----------------------------------------------------------------------------
# SELF-SIGNED CERTIFICATE GENERATION
# For development and testing only
# -----------------------------------------------------------------------------

generate_self_signed() {
    print_info "Generating self-signed certificate for: $DOMAIN"
    print_warning "Self-signed certificates are for DEVELOPMENT ONLY!"
    print_warning "Browsers will show security warnings."

    # Create SSL directory
    mkdir -p "$SSL_DIR"

    # Generate private key
    print_info "Generating RSA private key (2048 bits)..."
    openssl genrsa -out "$SSL_DIR/privkey.pem" 2048

    # Create certificate signing request configuration
    cat > "$SSL_DIR/csr.conf" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C = US
ST = State
L = City
O = Xnova Development
OU = Development Team
CN = $DOMAIN

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = www.$DOMAIN
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF

    # Create certificate extensions configuration
    cat > "$SSL_DIR/cert.conf" << EOF
authorityKeyIdentifier = keyid,issuer
basicConstraints = CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = www.$DOMAIN
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF

    # Generate certificate signing request
    print_info "Generating Certificate Signing Request (CSR)..."
    openssl req -new \
        -key "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/csr.pem" \
        -config "$SSL_DIR/csr.conf"

    # Generate self-signed certificate
    print_info "Generating self-signed certificate (valid for $CERT_DAYS days)..."
    openssl x509 -req \
        -days $CERT_DAYS \
        -in "$SSL_DIR/csr.pem" \
        -signkey "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem" \
        -extfile "$SSL_DIR/cert.conf"

    # Clean up temporary files
    rm -f "$SSL_DIR/csr.pem" "$SSL_DIR/csr.conf" "$SSL_DIR/cert.conf"

    # Set permissions
    chmod 600 "$SSL_DIR/privkey.pem"
    chmod 644 "$SSL_DIR/fullchain.pem"

    print_success "Self-signed certificate generated successfully!"
    echo ""
    echo "Certificate files:"
    echo "  - Certificate: $SSL_DIR/fullchain.pem"
    echo "  - Private Key: $SSL_DIR/privkey.pem"
    echo ""
    echo "To use, run: docker compose up -d"
}

# -----------------------------------------------------------------------------
# LET'S ENCRYPT CERTIFICATE (PRODUCTION)
# Uses Certbot to obtain free SSL certificates
# -----------------------------------------------------------------------------

generate_letsencrypt() {
    if [ "$DOMAIN" = "localhost" ]; then
        print_error "Let's Encrypt requires a real domain name!"
    fi

    print_info "Setting up Let's Encrypt certificate for: $DOMAIN"

    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        print_error "Certbot is not installed. Please install it first:

        Ubuntu/Debian: sudo apt install certbot
        CentOS/RHEL:   sudo yum install certbot
        macOS:         brew install certbot"
    fi

    # Create SSL directory
    mkdir -p "$SSL_DIR"

    # Stop nginx temporarily if running
    print_info "Stopping nginx if running..."
    docker compose down 2>/dev/null || true

    # Obtain certificate using standalone mode
    print_info "Obtaining certificate from Let's Encrypt..."
    sudo certbot certonly \
        --standalone \
        --preferred-challenges http \
        --agree-tos \
        --no-eff-email \
        --email "admin@$DOMAIN" \
        -d "$DOMAIN" \
        -d "www.$DOMAIN"

    # Copy certificates to nginx ssl directory
    LETSENCRYPT_DIR="/etc/letsencrypt/live/$DOMAIN"

    if [ -d "$LETSENCRYPT_DIR" ]; then
        print_info "Copying certificates to $SSL_DIR..."
        sudo cp "$LETSENCRYPT_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
        sudo cp "$LETSENCRYPT_DIR/privkey.pem" "$SSL_DIR/privkey.pem"

        # Fix ownership
        sudo chown $(whoami):$(whoami) "$SSL_DIR/fullchain.pem" "$SSL_DIR/privkey.pem"
        chmod 644 "$SSL_DIR/fullchain.pem"
        chmod 600 "$SSL_DIR/privkey.pem"

        print_success "Let's Encrypt certificate obtained successfully!"
    else
        print_error "Certificate not found at $LETSENCRYPT_DIR"
    fi

    echo ""
    echo "Certificate files:"
    echo "  - Certificate: $SSL_DIR/fullchain.pem"
    echo "  - Private Key: $SSL_DIR/privkey.pem"
    echo ""
    echo "IMPORTANT: Set up automatic renewal with:"
    echo "  sudo certbot renew --dry-run"
    echo ""
    echo "Add to crontab (runs twice daily):"
    echo "  0 0,12 * * * certbot renew --quiet && docker compose restart frontend"
}

# -----------------------------------------------------------------------------
# CERTIFICATE RENEWAL SCRIPT
# Creates a script for automatic certificate renewal
# -----------------------------------------------------------------------------

create_renewal_script() {
    cat > "$SSL_DIR/renew-cert.sh" << 'EOF'
#!/bin/bash
# =============================================================================
# SSL CERTIFICATE AUTO-RENEWAL SCRIPT
# =============================================================================
# Run this script via cron to automatically renew Let's Encrypt certificates
#
# Crontab entry (run twice daily at midnight and noon):
#   0 0,12 * * * /path/to/nginx/ssl/renew-cert.sh >> /var/log/cert-renewal.log 2>&1
# =============================================================================

set -e

DOMAIN="$1"
SSL_DIR="$(dirname "$0")"
PROJECT_DIR="$(dirname "$(dirname "$SSL_DIR")")"

if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <domain>"
    exit 1
fi

echo "[$(date)] Starting certificate renewal check for $DOMAIN"

# Attempt to renew
certbot renew --quiet

# Check if certificate was renewed
LETSENCRYPT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ -f "$LETSENCRYPT_DIR/fullchain.pem" ]; then
    # Copy new certificates
    cp "$LETSENCRYPT_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
    cp "$LETSENCRYPT_DIR/privkey.pem" "$SSL_DIR/privkey.pem"

    # Restart nginx to pick up new certificate
    cd "$PROJECT_DIR"
    docker compose restart frontend

    echo "[$(date)] Certificate renewed and nginx restarted"
else
    echo "[$(date)] Certificate renewal not needed or failed"
fi
EOF
    chmod +x "$SSL_DIR/renew-cert.sh"
    print_info "Created renewal script: $SSL_DIR/renew-cert.sh"
}

# -----------------------------------------------------------------------------
# MAIN EXECUTION
# -----------------------------------------------------------------------------

print_header

case "$MODE" in
    "self-signed"|"dev"|"development")
        generate_self_signed
        ;;
    "letsencrypt"|"le"|"production"|"prod")
        generate_letsencrypt
        create_renewal_script
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [mode] [domain]"
        echo ""
        echo "Modes:"
        echo "  self-signed   Generate self-signed certificate (default)"
        echo "  letsencrypt   Generate Let's Encrypt certificate (requires domain)"
        echo ""
        echo "Examples:"
        echo "  $0 self-signed              # For development"
        echo "  $0 letsencrypt xnova.com    # For production"
        echo ""
        ;;
    *)
        print_error "Unknown mode: $MODE. Use 'self-signed' or 'letsencrypt'"
        ;;
esac
