# =============================================================================
# XNOVA - SSL DIRECTORY
# =============================================================================
# Coloca aquí los certificados SSL para habilitar HTTPS:
#   fullchain.pem  → Certificado completo (incluye cadena de confianza)
#   privkey.pem    → Clave privada RSA
#
# Para generar certificados autofirmados (desarrollo):
#   docker run --rm -v "%cd%/nginx/ssl:/ssl" alpine sh -c "apk add openssl && openssl req -x509 -newkey rsa:2048 -keyout /ssl/privkey.pem -out /ssl/fullchain.pem -days 3650 -nodes -subj '/CN=localhost'"
#
# Luego habilita HTTPS renombrando:
#   cp nginx/default-ssl.conf.template nginx/default-ssl.conf
#
# Y reconstruye:
#   docker compose build frontend && docker compose up -d frontend
# =============================================================================
