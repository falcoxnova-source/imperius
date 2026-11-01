#!/usr/bin/env python3
"""
XNova Email Service
Listens on port 9002. Replaces the Supabase Edge Functions that this
self-hosted VPS cannot run (no Deno runtime). Sends transactional email
through the Resend HTTP API (verified domain falcox.net).

Endpoints (proxied by nginx under /functions/v1/...):
  POST /send-verification-email    {email, user_id, username, redirect_url}
  POST /resend-verification-email  {email, redirect_url}
  POST /send-password-reset-email  {email, redirect_url}
  POST /update-user-password       {token, new_password}
  POST /send-test-email            {recipient_email}          (admin Bearer)
  POST /send-broadcast-email       {subject, body}            (admin Bearer)
  POST /send-telegram-broadcast    {subject, body}            (admin Bearer)
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib import request, error, parse


def load_env(env_file="/root/xnova/.env"):
    if os.path.exists(env_file):
        with open(env_file, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and value and key not in os.environ:
                        os.environ[key] = value


load_env()

LISTEN_PORT = int(os.environ.get("EMAIL_SERVICE_PORT", "9002"))
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_CONTAINER = os.environ.get("DB_CONTAINER", "xnova-database")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_URL = "https://api.resend.com/emails"
JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
DEFAULT_REDIRECT = os.environ.get("EMAIL_DEFAULT_REDIRECT", "https://xnova.xyz")
RESET_TTL_HOURS = int(os.environ.get("EMAIL_RESET_TTL_HOURS", "2"))
BROADCAST_MAX = int(os.environ.get("EMAIL_BROADCAST_MAX", "500"))
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = "https://api.telegram.org"
CODE_TTL_MINUTES = int(os.environ.get("EMAIL_2FA_TTL_MINUTES", "10"))
NOTIFY_POLL_SECONDS = int(os.environ.get("NOTIFY_POLL_SECONDS", "5"))

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"


def log(*a):
    print("[email]", *a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# DB helpers (via docker exec psql, same pattern as deposit_service.py)
# ---------------------------------------------------------------------------
def db_query(sql):
    cmd = ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
           "-t", "-A", "-c", sql]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log("DB error:", result.stderr.strip())
        return None
    return result.stdout.strip()


def sql_lit(s):
    """Quote a python string as a safe SQL literal."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def gen_token():
    return "".join(secrets.choice(_TOKEN_CHARS) for _ in range(64))


def gen_code():
    """6-digit numeric code (as string, zero-padded)."""
    return f"{secrets.randbelow(1000000):06d}"


def get_user_from_bearer(auth_header):
    """Return user_id for a valid (signature-verified) GoTrue bearer token, else None."""
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    payload = verify_jwt(auth_header[7:])
    if not payload:
        return None
    uid = payload.get("sub")
    if not uid or not _UUID_RE.match(uid):
        return None
    return uid


def get_email_and_name(user_id):
    """Return (email, username) for a user_id, or (None, None)."""
    out = db_query(
        "SELECT u.email, COALESCE(p.username,'Comandante') "
        "FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id "
        f"WHERE u.id = {sql_lit(user_id)} LIMIT 1;"
    )
    if not out:
        return None, None
    parts = out.split("|")
    if len(parts) < 2 or not parts[0]:
        return None, None
    return parts[0].strip(), parts[1].strip()


def get_telegram_id(user_id):
    """Return the linked telegram_id (str) for a user, or None."""
    out = db_query(
        f"SELECT telegram_id FROM public.telegram_links WHERE user_id = {sql_lit(user_id)} "
        "AND telegram_id IS NOT NULL ORDER BY linked_at DESC NULLS LAST LIMIT 1;"
    )
    if out and out.strip():
        return out.strip()
    return None


def get_setting(key):
    """Return a game_settings value as plain text, or None."""
    out = db_query(
        f"SELECT value FROM public.game_settings WHERE key = {sql_lit(key)} LIMIT 1;"
    )
    if out is None:
        return None
    out = out.strip()
    return out if out != "" else None


def store_2fa_code(user_id, purpose, code, payload_obj, ttl_minutes):
    """Replace any prior code for this user+purpose and insert a fresh one."""
    db_query(
        f"DELETE FROM public.email_2fa_codes WHERE user_id = {sql_lit(user_id)} "
        f"AND purpose = {sql_lit(purpose)};"
    )
    payload_json = json.dumps(payload_obj or {})
    res = db_query(
        "INSERT INTO public.email_2fa_codes (user_id, purpose, code, payload, expires_at) VALUES ("
        f"{sql_lit(user_id)}, {sql_lit(purpose)}, {sql_lit(code)}, {sql_lit(payload_json)}::jsonb, "
        f"now() + interval '{int(ttl_minutes)} minutes') RETURNING id;"
    )
    return res is not None and res.strip() != ""


def telegram_send(chat_id, text):
    """Send a Telegram DM via the bot API. Returns (ok, detail)."""
    if not TELEGRAM_BOT_TOKEN:
        return False, "TELEGRAM_BOT_TOKEN no configurado"
    url = f"{TELEGRAM_API}/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode()
    req = request.Request(url, data=data, method="POST",
                          headers={"Content-Type": "application/json"})
    try:
        with request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode())
            return bool(body.get("ok")), body.get("description", "")
    except error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode()).get("description", str(e))
        except Exception:
            detail = str(e)
        log("telegram HTTPError:", detail)
        return False, detail
    except Exception as e:
        log("telegram error:", e)
        return False, str(e)


# ---------------------------------------------------------------------------
# Auth: verify a GoTrue-issued HS256 JWT and check admin flag
# ---------------------------------------------------------------------------
def _b64url_decode(s):
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


def verify_jwt(token):
    if not JWT_SECRET or not token:
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        signing_input = (parts[0] + "." + parts[1]).encode()
        sig = _b64url_decode(parts[2])
        expected = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64url_decode(parts[1]))
        exp = payload.get("exp")
        if exp and float(exp) < time.time():
            return None
        return payload
    except Exception as e:
        log("jwt verify error:", e)
        return None


def require_admin(auth_header):
    """Return user_id if the bearer token belongs to an admin, else None."""
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    payload = verify_jwt(auth_header[7:])
    if not payload:
        return None
    uid = payload.get("sub")
    if not uid or not _UUID_RE.match(uid):
        return None
    out = db_query(f"SELECT is_admin FROM public.profiles WHERE id = {sql_lit(uid)};")
    if out and out.strip() == "t":
        return uid
    return None


# ---------------------------------------------------------------------------
# Email sending via Resend
# ---------------------------------------------------------------------------
def get_sender():
    out = db_query(
        "SELECT COALESCE(NULLIF(smtp_from_name,''),'Falco-X Universo') || '|' || "
        "COALESCE(NULLIF(smtp_from_email,''),'noreply@falcox.net'), is_enabled "
        "FROM public.admin_smtp_settings WHERE id = 1;"
    )
    from_name, from_email, is_enabled = "Falco-X Universo", "noreply@falcox.net", True
    if out:
        # psql returns "Name|email|t" (columns joined with '|')
        fields = out.split("|")
        if len(fields) >= 3 and fields[0] and fields[1]:
            from_name = fields[0]
            from_email = fields[1]
            is_enabled = fields[2].strip() == "t"
    return from_name, from_email, is_enabled


def resend_send(to, subject, html, text=None):
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY no configurada"
    from_name, from_email, _ = get_sender()
    payload = {
        "from": f"{from_name} <{from_email}>",
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    data = json.dumps(payload).encode()
    req = request.Request(
        RESEND_URL, data=data, method="POST",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}",
                 "Content-Type": "application/json",
                 "Accept": "application/json",
                 # Resend is behind Cloudflare which blocks the default
                 # python-urllib User-Agent (403 error 1010).
                 "User-Agent": "Xnova/1.0"},
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
            return True, body.get("id", "")
    except error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode()).get("message", str(e))
        except Exception:
            detail = str(e)
        log("resend HTTPError:", detail)
        return False, detail
    except Exception as e:
        log("resend error:", e)
        return False, str(e)


# ---------------------------------------------------------------------------
# HTML templates (mirror the original edge-function branding)
# ---------------------------------------------------------------------------
BANNER = "https://photos.pinksale.finance/file/pinksale-logo-upload/1768087759296-101b69e5b11592c274998ca8b9b37290.jpg"


def tpl_verification(username, url):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a 0%,#1a1a2e 100%);"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="text-align:center;padding-bottom:20px;"><img src="{BANNER}" alt="Falco-X" style="max-width:100%;height:auto;border-radius:16px;"></td></tr>
<tr><td style="background:linear-gradient(135deg,rgba(15,23,42,.95),rgba(30,41,59,.95));border-radius:16px;border:1px solid rgba(34,211,238,.2);">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:40px 40px 20px;text-align:center;"><h1 style="color:#22d3ee;margin:0 0 8px;font-size:32px;font-weight:700;">Falco-X Universo</h1><p style="color:#94a3b8;margin:0;font-size:16px;">Tu aventura espacial comienza aqui</p></td></tr>
<tr><td style="padding:0 40px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.25);border-radius:12px;"><tr><td style="padding:30px;text-align:center;">
<h2 style="color:#f8fafc;margin:0 0 12px;font-size:24px;">Bienvenido, {username}!</h2>
<p style="color:#cbd5e1;margin:0 0 24px;font-size:16px;line-height:1.6;">Gracias por unirte a Falco-X Universo. Para comenzar tu conquista del cosmos, confirma tu cuenta.</p>
<a href="{url}" style="display:inline-block;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#0f172a;text-decoration:none;padding:16px 40px;border-radius:8px;font-weight:700;font-size:16px;">Confirmar mi Cuenta</a>
</td></tr></table></td></tr>
<tr><td style="padding:20px 40px;text-align:center;"><p style="color:#64748b;font-size:14px;margin:0;">Este enlace expira en <strong style="color:#f59e0b;">24 horas</strong></p></td></tr>
</table></td></tr>
<tr><td style="padding:30px 20px;text-align:center;"><p style="color:#475569;font-size:12px;margin:0;">Si no creaste esta cuenta, ignora este mensaje.</p></td></tr>
</table></td></tr></table></body></html>"""


def tpl_account_verified(username):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a 0%,#1a1a2e 100%);"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="text-align:center;padding-bottom:20px;"><img src="{BANNER}" alt="Falco-X" style="max-width:100%;height:auto;border-radius:16px;"></td></tr>
<tr><td style="background:linear-gradient(135deg,rgba(15,23,42,.95),rgba(30,41,59,.95));border-radius:16px;border:1px solid rgba(34,197,94,.3);">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:40px 40px 10px;text-align:center;"><h1 style="color:#22c55e;margin:0 0 8px;font-size:30px;font-weight:700;">Cuenta Verificada!</h1><p style="color:#94a3b8;margin:0;font-size:15px;">Tu cuenta ha sido activada exitosamente</p></td></tr>
<tr><td style="padding:10px 40px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:12px;"><tr><td style="padding:30px;text-align:center;">
<h2 style="color:#f8fafc;margin:0 0 12px;font-size:22px;">Bienvenido, {username}!</h2>
<p style="color:#cbd5e1;margin:0 0 24px;font-size:16px;line-height:1.6;">Tu cuenta en Falco-X Universo ha sido verificada por nuestro equipo. Ya puedes acceder al juego y comenzar tu conquista del cosmos!</p>
<a href="https://falco-x.com" style="display:inline-block;background:linear-gradient(135deg,#22c55e,#16a34a);color:#0f172a;text-decoration:none;padding:16px 40px;border-radius:8px;font-weight:700;font-size:16px;">Entrar al Juego</a>
</td></tr></table></td></tr>
</table></td></tr>
<tr><td style="padding:30px 20px;text-align:center;"><p style="color:#475569;font-size:12px;margin:0;">Gracias por unirte a Falco-X Universo!</p></td></tr>
</table></td></tr></table></body></html>"""


def tpl_reset(username, url):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
<div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:30px;border-radius:12px;text-align:center;">
<h1 style="color:#22d3ee;margin:0 0 20px;font-size:28px;">Falco-X Universo</h1>
<div style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);border-radius:8px;padding:20px;margin:20px 0;">
<h2 style="color:#fbbf24;margin:0 0 10px;">Recuperar Contrasena</h2>
<p style="color:#94a3b8;margin:0 0 20px;font-size:16px;">Hola {username}, recibimos una solicitud para restablecer tu contrasena.</p>
<a href="{url}" style="display:inline-block;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#0f172a;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:16px;">Restablecer Contrasena</a>
</div>
<p style="color:#64748b;font-size:14px;margin-top:20px;">Este enlace expira en {RESET_TTL_HOURS} horas.</p>
<p style="color:#475569;font-size:12px;margin-top:30px;">Si no solicitaste este cambio, ignora este mensaje.</p>
</div></body></html>"""


def tpl_test():
    now = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
<div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:30px;border-radius:12px;text-align:center;">
<h1 style="color:#22d3ee;margin:0 0 20px;font-size:28px;">Falco-X Universo</h1>
<div style="background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);border-radius:8px;padding:20px;margin:20px 0;">
<h2 style="color:#10b981;margin:0 0 10px;">Configuracion de correo exitosa!</h2>
<p style="color:#94a3b8;margin:0;font-size:16px;">El envio de correos esta funcionando correctamente (Resend).</p>
</div>
<p style="color:#64748b;font-size:14px;margin-top:20px;">Fecha de prueba: {now}</p>
</div></body></html>"""


def tpl_broadcast(from_name, subject, body):
    body_html = (body or "").replace("<", "&lt;").replace(">", "&gt;")
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a 0%,#1a1a2e 100%);"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="text-align:center;padding-bottom:20px;"><img src="{BANNER}" alt="Falco-X" style="max-width:100%;height:auto;border-radius:16px;"></td></tr>
<tr><td style="background:linear-gradient(135deg,rgba(15,23,42,.95),rgba(30,41,59,.95));border-radius:16px;border:1px solid rgba(34,211,238,.2);">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:40px 40px 20px;text-align:center;"><h1 style="color:#22d3ee;margin:0 0 8px;font-size:32px;font-weight:700;">{from_name}</h1><p style="color:#94a3b8;margin:0;font-size:16px;">Comunicado Oficial</p></td></tr>
<tr><td style="padding:0 40px 30px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.25);border-radius:12px;"><tr><td style="padding:30px;text-align:center;">
<h2 style="color:#f8fafc;margin:0 0 16px;font-size:24px;">{subject}</h2>
<p style="color:#cbd5e1;margin:0;font-size:16px;line-height:1.8;text-align:left;white-space:pre-wrap;">{body_html}</p>
</td></tr></table></td></tr>
</table></td></tr>
</table></td></tr></table></body></html>"""


def tpl_code_generic(title, intro, code, footer):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a 0%,#1a1a2e 100%);"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="text-align:center;padding-bottom:20px;"><img src="{BANNER}" alt="Falco-X" style="max-width:100%;height:auto;border-radius:16px;"></td></tr>
<tr><td style="background:linear-gradient(135deg,rgba(15,23,42,.95),rgba(30,41,59,.95));border-radius:16px;border:1px solid rgba(34,211,238,.2);">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:40px 40px 10px;text-align:center;"><h1 style="color:#22d3ee;margin:0 0 8px;font-size:30px;font-weight:700;">Falco-X Universo</h1><p style="color:#94a3b8;margin:0;font-size:15px;">{title}</p></td></tr>
<tr><td style="padding:10px 40px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.25);border-radius:12px;"><tr><td style="padding:30px;text-align:center;">
<p style="color:#cbd5e1;margin:0 0 20px;font-size:16px;line-height:1.6;">{intro}</p>
<div style="display:inline-block;background:#0f172a;border:2px dashed #22d3ee;border-radius:10px;padding:18px 34px;margin:6px 0;">
<span style="color:#22d3ee;font-size:38px;font-weight:800;letter-spacing:10px;font-family:'Courier New',monospace;">{code}</span>
</div>
<p style="color:#f59e0b;margin:20px 0 0;font-size:13px;">Este codigo expira en {CODE_TTL_MINUTES} minutos.</p>
</td></tr></table></td></tr>
<tr><td style="padding:16px 40px 30px;text-align:center;"><p style="color:#64748b;font-size:13px;margin:0;">{footer}</p></td></tr>
</table></td></tr>
</table></td></tr></table></body></html>"""


def tpl_withdrawal_code(username, code, amount, token, wallet):
    short = (wallet[:8] + "..." + wallet[-6:]) if wallet and len(wallet) > 16 else wallet
    intro = (f"Hola <strong style='color:#f8fafc'>{username}</strong>, para confirmar tu retiro de "
             f"<strong style='color:#22d3ee'>{amount} {token}</strong> a <strong style='color:#cbd5e1'>{short}</strong> "
             f"introduce este codigo de seguridad:")
    footer = "Si tu no solicitaste este retiro, cambia tu contrasena de inmediato y NO compartas este codigo con nadie."
    return tpl_code_generic("Confirmacion de retiro", intro, code, footer)


def tpl_login_code(username, code):
    intro = (f"Hola <strong style='color:#f8fafc'>{username}</strong>, usa este codigo para completar "
             f"el inicio de sesion en tu cuenta:")
    footer = "Si no intentaste iniciar sesion, alguien podria conocer tu contrasena. Cambiala cuanto antes."
    return tpl_code_generic("Verificacion de inicio de sesion", intro, code, footer)


def tpl_p2p_order(owner_name, taker_name, side, asset, asset_amount, fiat_amount, fiat_currency):
    # Desde la perspectiva del DUENO de la oferta:
    # side='sell' => el dueno vende asset y recibe fiat (el taker compra).
    # side='buy'  => el dueno compra asset y paga fiat (el taker vende).
    if (side or "").lower() == "sell":
        action = f"<strong style='color:#22d3ee'>{taker_name}</strong> quiere comprar <strong style='color:#f8fafc'>{asset_amount} {asset}</strong> de tu oferta"
    else:
        action = f"<strong style='color:#22d3ee'>{taker_name}</strong> quiere vender <strong style='color:#f8fafc'>{asset_amount} {asset}</strong> en tu oferta"
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a 0%,#1a1a2e 100%);"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="text-align:center;padding-bottom:20px;"><img src="{BANNER}" alt="Falco-X" style="max-width:100%;height:auto;border-radius:16px;"></td></tr>
<tr><td style="background:linear-gradient(135deg,rgba(15,23,42,.95),rgba(30,41,59,.95));border-radius:16px;border:1px solid rgba(16,185,129,.25);">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:36px 40px 10px;text-align:center;"><h1 style="color:#10b981;margin:0 0 6px;font-size:28px;font-weight:700;">Nueva orden P2P</h1><p style="color:#94a3b8;margin:0;font-size:15px;">Mercado P2P - Falco-X Universo</p></td></tr>
<tr><td style="padding:10px 40px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:12px;"><tr><td style="padding:26px;text-align:center;">
<p style="color:#cbd5e1;margin:0 0 14px;font-size:16px;line-height:1.6;">Hola {owner_name}, {action}.</p>
<div style="text-align:left;display:inline-block;color:#cbd5e1;font-size:15px;line-height:1.9;">
<div>Cantidad: <strong style="color:#f8fafc">{asset_amount} {asset}</strong></div>
<div>Total: <strong style="color:#10b981">{fiat_amount} {fiat_currency}</strong></div>
</div>
<p style="color:#f59e0b;margin:18px 0 0;font-size:13px;">Entra al mercado P2P para coordinar el pago y liberar los fondos a tiempo.</p>
</td></tr></table></td></tr>
<tr><td style="padding:16px 40px 30px;text-align:center;"><p style="color:#64748b;font-size:12px;margin:0;">Recibes este correo porque alguien tomo una de tus ofertas P2P.</p></td></tr>
</table></td></tr>
</table></td></tr></table></body></html>"""


# ---------------------------------------------------------------------------
# Endpoint handlers
# ---------------------------------------------------------------------------
def find_user_by_email(email):
    """Return (user_id, username, confirmed_bool) or (None, None, None)."""
    e = sql_lit(email.lower())
    out = db_query(
        "SELECT p.id, COALESCE(p.username,'Comandante'), "
        "(u.email_confirmed_at IS NOT NULL) "
        "FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id "
        f"WHERE lower(u.email) = {e} LIMIT 1;"
    )
    if not out:
        return None, None, None
    parts = out.split("|")
    if len(parts) < 3 or not parts[0]:
        return None, None, None
    return parts[0], parts[1], parts[2].strip() == "t"


def create_token(user_id, email, ttype, hours):
    tok = gen_token()
    db_query(
        f"DELETE FROM public.email_verification_tokens WHERE user_id = {sql_lit(user_id)} "
        f"AND type = {sql_lit(ttype)};"
    )
    res = db_query(
        "INSERT INTO public.email_verification_tokens "
        "(user_id, email, token, type, expires_at) VALUES ("
        f"{sql_lit(user_id)}, {sql_lit(email)}, {sql_lit(tok)}, {sql_lit(ttype)}, "
        f"now() + interval '{int(hours)} hours') RETURNING id;"
    )
    if res is None:
        return None
    return tok


def handle_send_verification(body):
    email = (body.get("email") or "").strip()
    user_id = (body.get("user_id") or "").strip()
    username = (body.get("username") or "Comandante").strip() or "Comandante"
    redirect = (body.get("redirect_url") or DEFAULT_REDIRECT).rstrip("/")
    if not email or not user_id:
        return 400, {"success": False, "error": "Email y user_id son requeridos"}
    if not _UUID_RE.match(user_id):
        return 400, {"success": False, "error": "user_id invalido"}

    _, _, is_enabled = get_sender()
    if not is_enabled:
        # Email disabled -> auto verify (parity with original behaviour)
        db_query(f"UPDATE public.profiles SET email_verified = true WHERE id = {sql_lit(user_id)};")
        db_query(f"UPDATE auth.users SET email_confirmed_at = now(), updated_at = now() "
                 f"WHERE id = {sql_lit(user_id)} AND email_confirmed_at IS NULL;")
        return 200, {"success": True, "auto_verified": True}

    tok = create_token(user_id, email, "verification", 24)
    if not tok:
        return 500, {"success": False, "error": "Error al crear token de verificacion"}
    url = f"{redirect}/verify-email?token={tok}"
    ok, err = resend_send(
        email, "Confirma tu cuenta - Falco-X Universo",
        tpl_verification(username, url),
        text=f"Hola {username}, confirma tu cuenta: {url} (expira en 24 horas)")
    if not ok:
        return 500, {"success": False, "error": err}
    return 200, {"success": True, "message": "Correo de verificacion enviado"}


def handle_resend_verification(body):
    email = (body.get("email") or "").strip()
    redirect = (body.get("redirect_url") or DEFAULT_REDIRECT).rstrip("/")
    if not email:
        return 400, {"success": False, "error": "Email es requerido"}
    uid, username, confirmed = find_user_by_email(email)
    if not uid:
        return 404, {"success": False, "error": "Usuario no encontrado"}
    if confirmed:
        return 400, {"success": False, "error": "El email ya esta verificado"}
    _, _, is_enabled = get_sender()
    if not is_enabled:
        return 400, {"success": False, "error": "El envio de correos no esta habilitado"}
    tok = create_token(uid, email, "verification", 24)
    if not tok:
        return 500, {"success": False, "error": "Error al crear token"}
    url = f"{redirect}/verify-email?token={tok}"
    ok, err = resend_send(
        email, "Confirma tu cuenta - Falco-X Universo",
        tpl_verification(username, url),
        text=f"Hola {username}, confirma tu cuenta: {url}")
    if not ok:
        return 500, {"success": False, "error": err}
    return 200, {"success": True, "message": "Correo de verificacion reenviado"}


def handle_password_reset(body):
    email = (body.get("email") or "").strip()
    redirect = (body.get("redirect_url") or DEFAULT_REDIRECT).rstrip("/")
    if not email:
        return 400, {"success": False, "error": "Email es requerido"}
    uid, username, _ = find_user_by_email(email)
    # Anti-enumeration: always report success when the user is missing.
    if not uid:
        return 200, {"success": True, "message": "Si el correo existe, recibiras instrucciones"}
    _, _, is_enabled = get_sender()
    if not is_enabled:
        return 400, {"success": False, "error": "El envio de correos no esta habilitado"}
    tok = create_token(uid, email, "password_reset", RESET_TTL_HOURS)
    if not tok:
        return 500, {"success": False, "error": "Error al crear token"}
    url = f"{redirect}/reset-password?token={tok}"
    ok, err = resend_send(
        email, "Recupera tu contrasena - Falco-X Universo",
        tpl_reset(username, url),
        text=f"Hola {username}, restablece tu contrasena: {url} (expira en {RESET_TTL_HOURS} horas)")
    if not ok:
        return 500, {"success": False, "error": err}
    return 200, {"success": True, "message": "Correo de recuperacion enviado"}


def handle_update_password(body):
    token = (body.get("token") or "").strip()
    new_password = body.get("new_password") or ""
    if not token or not new_password:
        return 400, {"success": False, "error": "token y new_password son requeridos"}
    if len(new_password) < 6:
        return 400, {"success": False, "error": "La contrasena debe tener al menos 6 caracteres"}
    out = db_query(
        f"SELECT public.reset_user_password_by_token({sql_lit(token)}, {sql_lit(new_password)});"
    )
    if out is None:
        return 500, {"success": False, "error": "Error interno del servidor"}
    try:
        res = json.loads(out)
    except Exception:
        return 500, {"success": False, "error": "Respuesta invalida del servidor"}
    status = 200 if res.get("success") else 400
    return status, res


def handle_test_email(body, auth_header):
    if not require_admin(auth_header):
        return 403, {"success": False, "error": "No tienes permisos de administrador"}
    recipient = (body.get("recipient_email") or "").strip()
    if not recipient or not _EMAIL_RE.match(recipient):
        return 400, {"success": False, "error": "Email de destino invalido"}
    ok, err = resend_send(
        recipient, "Prueba de correo - Falco-X Universo", tpl_test(),
        text="Correo de prueba de Falco-X Universo (Resend).")
    if not ok:
        return 500, {"success": False, "error": err}
    return 200, {"success": True, "message": f"Correo de prueba enviado a {recipient}"}


def handle_broadcast(body, auth_header):
    admin_id = require_admin(auth_header)
    if not admin_id:
        return 403, {"success": False, "error": "Admin access required"}
    subject = (body.get("subject") or "").strip()
    text_body = body.get("body") or ""
    if not subject or not text_body:
        return 400, {"success": False, "error": "Subject and body are required"}
    _, _, is_enabled = get_sender()
    if not is_enabled:
        return 400, {"success": False, "error": "El envio de correos no esta habilitado"}
    from_name, _, _ = get_sender()
    out = db_query(
        "SELECT u.email FROM auth.users u JOIN public.profiles p ON p.id = u.id "
        f"WHERE u.email IS NOT NULL AND u.id <> {sql_lit(admin_id)} "
        f"ORDER BY u.created_at LIMIT {BROADCAST_MAX};"
    )
    emails = [e.strip() for e in (out or "").splitlines() if e.strip()]
    html = tpl_broadcast(from_name, subject, text_body)
    sent = 0
    for em in emails:
        ok, _ = resend_send(em, subject, html, text=text_body)
        if ok:
            sent += 1
        time.sleep(0.6)  # stay under Resend rate limits
    return 200, {"success": True, "emails_sent": sent, "total": len(emails)}


def _tg_html_escape(s):
    """Escape text for Telegram HTML parse mode."""
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _do_telegram_broadcast(subject, text_body):
    """Core: envia subject/body a todos los grupos de Telegram habilitados.

    Paridad con la edge function send-telegram-broadcast (que este VPS no puede
    ejecutar por no tener runtime Deno).
    """
    subject = (subject or "").strip()
    text_body = text_body or ""
    if not subject or not text_body:
        return 400, {"success": False, "error": "Subject and body are required"}

    out = db_query(
        "SELECT id || '|' || chat_id || '|' || COALESCE(title,'') "
        "FROM public.telegram_groups WHERE is_enabled = true;"
    )
    rows = [r for r in (out or "").splitlines() if r.strip()]
    if not rows:
        return 200, {"success": True, "groups_sent": 0, "groups_failed": 0,
                     "total_groups": 0,
                     "error": "No hay grupos de Telegram habilitados"}

    message = f"<b>{_tg_html_escape(subject)}</b>\n\n{_tg_html_escape(text_body)}"
    # Telegram limita a 4096 caracteres: si no cabe, se trocea por lineas y
    # las partes se envian EN ORDEN al mismo grupo.
    if len(message) <= 4000:
        messages = [message]
    else:
        messages = []
        chunk = ""
        for line in text_body.split("\n"):
            esc = _tg_html_escape(line)[:3500]
            if chunk and len(chunk) + len(esc) + 1 > 3500:
                messages.append(chunk)
                chunk = ""
            chunk = f"{chunk}\n{esc}" if chunk else esc
        if chunk:
            messages.append(chunk)
        total = len(messages)
        messages = [
            f"<b>{_tg_html_escape(subject)}</b>"
            + (f" ({i + 1}/{total})" if total > 1 else "") + f"\n\n{m}"
            for i, m in enumerate(messages)
        ]
    sent = 0
    failed = 0
    errors = []
    for row in rows:
        parts = row.split("|", 2)
        if len(parts) < 2:
            continue
        gid, chat_id = parts[0], parts[1]
        title = parts[2] if len(parts) > 2 and parts[2] else chat_id
        ok, detail = True, ""
        for idx, msg in enumerate(messages):
            if idx:
                time.sleep(1.0)
            ok, detail = telegram_send(chat_id, msg)
            if not ok:
                break
        if ok:
            sent += 1
            db_query(
                "UPDATE public.telegram_groups SET last_message_at = now() "
                f"WHERE id = {sql_lit(gid)};"
            )
        else:
            failed += 1
            if len(errors) < 3:
                errors.append(f"{title}: {detail}")
        time.sleep(0.15)

    return 200, {
        "success": sent > 0,
        "groups_sent": sent,
        "groups_failed": failed,
        "total_groups": len(rows),
        "error": "; ".join(errors) if errors else None,
    }


def handle_telegram_broadcast(body, auth_header):
    """Comunicado Telegram disparado desde el panel admin (Bearer de admin)."""
    admin_id = require_admin(auth_header)
    if not admin_id:
        return 403, {"success": False, "error": "Admin access required"}
    return _do_telegram_broadcast(body.get("subject"), body.get("body"))


def handle_internal_telegram_broadcast(body):
    """Comunicado Telegram para procesos internos del servidor (p.ej. el reparto
    de la pool de destruccion via net.http_post desde la base de datos).

    No usa JWT de admin (el proceso interno no tiene sesion de usuario). Se
    autentica con un token compartido guardado en
    market_notification_config.internal_broadcast_token.
    """
    provided = (body.get("token") or "").strip()
    if not provided:
        return 403, {"success": False, "error": "Token required"}
    expected = db_query(
        "SELECT COALESCE(internal_broadcast_token, '') "
        "FROM public.market_notification_config WHERE id = 1;"
    )
    expected = (expected or "").strip()
    if not expected or not hmac.compare_digest(provided, expected):
        return 403, {"success": False, "error": "Invalid token"}
    return _do_telegram_broadcast(body.get("subject"), body.get("body"))


def handle_admin_verify_user(body, auth_header):
    """Marca una cuenta como verificada (email confirmado). Solo admins.

    Paridad con la edge function admin-verify-user:
      - auth.users.email_confirmed_at = now()
      - public.profiles.email_verified = true
      - borra tokens de verificacion pendientes
      - envia (best-effort) el correo de bienvenida/verificacion.
    """
    if not require_admin(auth_header):
        return 403, {"success": False, "error": "Solo administradores pueden verificar usuarios"}

    user_id = (body.get("user_id") or "").strip()
    if not user_id:
        return 400, {"success": False, "error": "user_id es requerido"}
    if not _UUID_RE.match(user_id):
        return 400, {"success": False, "error": "user_id invalido"}

    # Verificar que el usuario exista
    exists = db_query(f"SELECT 1 FROM auth.users WHERE id = {sql_lit(user_id)} LIMIT 1;")
    if not exists or not exists.strip():
        return 404, {"success": False, "error": "Usuario no encontrado"}

    # Confirmar email en auth.users (si aun no estaba confirmado)
    db_query(
        "UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()), "
        f"updated_at = now() WHERE id = {sql_lit(user_id)};"
    )
    # Marcar perfil como verificado
    db_query(f"UPDATE public.profiles SET email_verified = true WHERE id = {sql_lit(user_id)};")
    # Borrar tokens de verificacion pendientes
    db_query(
        f"DELETE FROM public.email_verification_tokens WHERE user_id = {sql_lit(user_id)} "
        "AND type = 'verification';"
    )

    # Notificacion por correo (best-effort, no bloquea la verificacion)
    email_sent = False
    try:
        email, username = get_email_and_name(user_id)
        _, _, is_enabled = get_sender()
        if email and is_enabled:
            username = username or "Comandante"
            html = tpl_account_verified(username)
            ok, _ = resend_send(
                email, "Tu cuenta ha sido verificada - Falco-X Universo", html,
                text=(f"Hola {username}, tu cuenta en Falco-X Universo ha sido verificada. "
                      "Ya puedes acceder al juego: https://falco-x.com"))
            email_sent = bool(ok)
    except Exception as e:
        log("admin_verify_user notification error:", e)

    return 200, {
        "success": True,
        "message": ("Usuario verificado y notificado por correo" if email_sent
                    else "Usuario verificado correctamente"),
    }


_ADDR_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


def handle_send_withdrawal_code(body, user_id):
    """Genera y envia por correo un codigo de 6 digitos para confirmar un retiro."""
    amount = body.get("amount")
    wallet = (body.get("wallet_address") or "").strip()
    token_type = (body.get("tokenType") or body.get("token_type") or "TUNG").upper()
    if token_type not in ("TUNG", "USDT"):
        return 400, {"success": False, "error": "Tipo de token no soportado"}
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return 400, {"success": False, "error": "Monto invalido"}
    if amount <= 0:
        return 400, {"success": False, "error": "Monto invalido"}
    if not _ADDR_RE.match(wallet):
        return 400, {"success": False, "error": "Direccion de wallet invalida"}

    email, username = get_email_and_name(user_id)
    if not email:
        return 404, {"success": False, "error": "No se encontro el correo de la cuenta"}

    code = gen_code()
    payload = {"amount": amount, "wallet_address": wallet, "token_type": token_type}
    if not store_2fa_code(user_id, "withdrawal", code, payload, CODE_TTL_MINUTES):
        return 500, {"success": False, "error": "No se pudo generar el codigo"}

    ok, err = resend_send(
        email, "Codigo de confirmacion de retiro - Falco-X Universo",
        tpl_withdrawal_code(username, code, amount, token_type, wallet),
        text=f"Tu codigo para confirmar el retiro de {amount} {token_type} es: {code} (expira en {CODE_TTL_MINUTES} minutos)")
    if not ok:
        return 500, {"success": False, "error": err}
    return 200, {"success": True, "message": "Codigo enviado a tu correo"}


def handle_send_login_code(body, user_id):
    """Genera y envia por correo un codigo de 6 digitos para 2FA de inicio de sesion."""
    email, username = get_email_and_name(user_id)
    if not email:
        return 404, {"success": False, "error": "No se encontro el correo de la cuenta"}
    code = gen_code()
    if not store_2fa_code(user_id, "login", code, {}, CODE_TTL_MINUTES):
        return 500, {"success": False, "error": "No se pudo generar el codigo"}
    ok, err = resend_send(
        email, "Codigo de inicio de sesion - Falco-X Universo",
        tpl_login_code(username, code),
        text=f"Tu codigo de inicio de sesion es: {code} (expira en {CODE_TTL_MINUTES} minutos)")
    if not ok:
        return 500, {"success": False, "error": err}
    return 200, {"success": True, "message": "Codigo enviado a tu correo"}


def handle_verify_login_code(body, user_id):
    """Verifica el codigo 2FA de login; lo marca como usado si es valido."""
    code = (body.get("code") or "").strip()
    if not re.match(r"^\d{6}$", code):
        return 400, {"success": False, "error": "Codigo invalido"}
    out = db_query(
        "WITH c AS ("
        "  SELECT id FROM public.email_2fa_codes "
        f"  WHERE user_id = {sql_lit(user_id)} AND purpose = 'login' AND code = {sql_lit(code)} "
        "    AND used_at IS NULL AND expires_at > now() "
        "  ORDER BY created_at DESC LIMIT 1) "
        "UPDATE public.email_2fa_codes e SET used_at = now() FROM c "
        "WHERE e.id = c.id RETURNING jsonb_build_object('success', true);"
    )
    if out and out.strip().startswith("{"):
        return 200, {"success": True, "message": "Codigo verificado"}
    return 400, {"success": False, "error": "Codigo incorrecto o expirado"}


def _google_siteverify(secret, token):
    """Call Google's reCAPTCHA siteverify. Returns parsed dict or raises."""
    data = parse.urlencode({"secret": secret, "response": token}).encode()
    req = request.Request(
        "https://www.google.com/recaptcha/api/siteverify",
        data=data, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "User-Agent": "Xnova/1.0"},
    )
    with request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def handle_verify_recaptcha(body):
    """Verifica un token de reCAPTCHA v3 con Google (paridad con la edge function).

    Politica: nunca bloquea a un usuario legitimo por un problema del servidor
    (clave secreta mal configurada, Google inalcanzable) -> en esos casos deja
    pasar (fail-open) y lo registra. Solo bloquea cuando Google confirma un
    token invalido/expirado o una puntuacion por debajo del minimo (bot).
    """
    token = (body.get("token") or "").strip()
    action = (body.get("action") or "").strip()

    enabled = (get_setting("recaptcha_enabled") or "").lower()
    if enabled not in ("true", "t", "1"):
        return 200, {"success": True, "score": 1.0, "bypassed": True}

    if not token:
        return 400, {"success": False, "error": "Missing reCAPTCHA token"}

    secret = (get_setting("recaptcha_secret_key") or "").strip().strip('"')
    if not secret:
        log("recaptcha: secret key no configurada -> fail-open")
        return 200, {"success": True, "score": 1.0, "degraded": True}

    try:
        min_score = float(get_setting("recaptcha_min_score") or 0.5)
    except (TypeError, ValueError):
        min_score = 0.5

    try:
        result = _google_siteverify(secret, token)
    except Exception as e:
        log("recaptcha siteverify error -> fail-open:", e)
        return 200, {"success": True, "score": 1.0, "degraded": True}

    if not result.get("success"):
        codes = result.get("error-codes", []) or []
        # Errores del lado del servidor -> no bloquear al usuario.
        server_side = {"invalid-input-secret", "missing-input-secret", "bad-request"}
        if any(c in server_side for c in codes):
            log("recaptcha server-side misconfig -> fail-open:", codes)
            return 200, {"success": True, "score": 1.0, "degraded": True}
        # Google desconfia del entorno del navegador (Android WebView,
        # Samsung Browser, modo privado) sin marcar al usuario como bot.
        # Se deja pasar para no bloquear a usuarios legitimos y se registra
        # con marcador propio para vigilancia de abuso.
        if "browser-error" in codes:
            log("recaptcha browser-error -> fail-open (vigilar):", codes)
            return 200, {"success": True, "score": 1.0, "degraded": True,
                         "degraded_reason": "browser-error"}
        # Token invalido/expirado/duplicado -> probablemente bot.
        log("recaptcha verification failed:", codes)
        return 403, {"success": False, "error": "reCAPTCHA verification failed",
                     "details": codes}

    if action and result.get("action") and result.get("action") != action:
        log("recaptcha action mismatch:", result.get("action"), "!=", action)
        return 403, {"success": False, "error": "reCAPTCHA action mismatch"}

    score = result.get("score", 1.0)
    try:
        if score is not None and float(score) < min_score:
            log("recaptcha score too low:", score, "<", min_score)
            return 403, {"success": False, "error": "reCAPTCHA score too low",
                         "score": score}
    except (TypeError, ValueError):
        pass

    return 200, {"success": True, "score": score}


# ---------------------------------------------------------------------------
# Notification worker: procesa notification_queue (email + telegram)
# ---------------------------------------------------------------------------
def render_notification(ntype, payload):
    """Return (subject, html, text, telegram_text) for a notification, or None."""
    if ntype == "p2p_order_created":
        owner = payload.get("owner_name", "Comandante")
        taker = payload.get("taker_name", "Un usuario")
        side = payload.get("side", "sell")
        asset = payload.get("asset", "")
        asset_amount = payload.get("asset_amount", "")
        fiat_amount = payload.get("fiat_amount", "")
        fiat_currency = payload.get("fiat_currency", "")
        subject = "Nueva orden en tu oferta P2P - Falco-X Universo"
        html = tpl_p2p_order(owner, taker, side, asset, asset_amount, fiat_amount, fiat_currency)
        verb = "comprar" if (side or "").lower() == "sell" else "vender"
        text = (f"{taker} quiere {verb} {asset_amount} {asset} en tu oferta P2P "
                f"(total {fiat_amount} {fiat_currency}). Entra al mercado P2P para coordinar el pago.")
        tg = (f"\U0001F7E2 <b>Nueva orden P2P</b>\n\n"
              f"{taker} quiere {verb} <b>{asset_amount} {asset}</b> en tu oferta.\n"
              f"Total: <b>{fiat_amount} {fiat_currency}</b>\n\n"
              f"Entra al mercado P2P para coordinar el pago a tiempo.")
        return subject, html, text, tg
    if ntype == "game_alert":
        return render_game_alert(payload)
    if ntype == "tg_text":
        # Texto plano generado en la BD (apuestas deportivas, batalla de naves...)
        title = str(payload.get("title") or "Falco-X Universe")
        body = str(payload.get("body") or "")
        tg = f"<b>{_tg_html_escape(title)}</b>\n\n{_tg_html_escape(body)}"
        return title, "", f"{title}\n\n{body}", tg
    return None


def _fmt_num(v):
    try:
        return f"{int(float(v)):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"


def render_game_alert(payload):
    """Alerta VIP por Telegram: flota hostil, combate o espionaje."""
    esc = _tg_html_escape
    mtype = payload.get("message_type", "")
    subject = str(payload.get("subject") or "")
    body = str(payload.get("body") or "")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else None

    if mtype == "fleet_warning":
        tg = f"\U0001F6A8 <b>{esc(subject or 'Flota hostil detectada')}</b>\n\n{esc(body)}"
    elif mtype == "battle":
        lines = [f"\u2694\ufe0f <b>{esc(subject or 'Reporte de combate')}</b>"]
        if data:
            coords = esc(str(data.get("coordinates") or ""))
            planet = esc(str(data.get("planet_name") or ""))
            att = esc(str(data.get("attacker") or "?"))
            dfn = esc(str(data.get("defender") or "?"))
            res = {"attacker_won": "Gana el atacante",
                   "defender_won": "Gana el defensor",
                   "draw": "Empate"}.get(data.get("result"), "")
            lines.append("")
            if planet or coords:
                lines.append(f"\U0001FA90 {planet} [{coords}]")
            lines.append(f"{att} vs {dfn}")
            if res:
                lines.append(f"Resultado: <b>{res}</b>")
            loot = data.get("loot") if isinstance(data.get("loot"), dict) else {}
            if any(float(loot.get(k) or 0) > 0 for k in ("metal", "crystal", "deuterium")):
                lines.append(f"Botin: M {_fmt_num(loot.get('metal'))} | "
                             f"C {_fmt_num(loot.get('crystal'))} | "
                             f"D {_fmt_num(loot.get('deuterium'))}")
            if data.get("moon_created"):
                lines.append("\U0001F315 Se ha creado una luna")
        elif body:
            lines.append("")
            lines.append(esc(body[:700]))
        tg = "\n".join(lines)
    elif mtype == "espionage":
        lines = [f"\U0001F575\ufe0f <b>{esc(subject or 'Espionaje')}</b>"]
        if data:
            coords = esc(str(data.get("coordinates") or ""))
            planet = esc(str(data.get("planet_name") or ""))
            lines.append("")
            if planet or coords:
                lines.append(f"\U0001FA90 {planet} {coords}")
            r = data.get("resources") if isinstance(data.get("resources"), dict) else {}
            if r:
                lines.append(f"Recursos: M {_fmt_num(r.get('metal'))} | "
                             f"C {_fmt_num(r.get('crystal'))} | "
                             f"D {_fmt_num(r.get('deuterium'))}")
            if data.get("ships_count") is not None:
                lines.append(f"Tipos de naves: {int(data.get('ships_count') or 0)} | "
                             f"Tipos de defensas: {int(data.get('defenses_count') or 0)}")
            if data.get("spy_detected"):
                lines.append("\u26a0\ufe0f Tu espionaje fue detectado")
        elif body:
            lines.append("")
            lines.append(esc(body[:700]))
        tg = "\n".join(lines)
    else:
        return None

    tg += "\n\n<i>Detalles en el juego. Puedes desactivar estas alertas en Ajustes.</i>"
    return subject, "", subject, tg


def process_one_notification(row):
    """row = dict with id, user_id, ntype, payload, channels."""
    nid = row["id"]
    rendered = render_notification(row["ntype"], row["payload"])
    if rendered is None:
        db_query(f"UPDATE public.notification_queue SET status='failed', "
                 f"last_error='unknown ntype', attempts=attempts+1 WHERE id={sql_lit(nid)};")
        return
    subject, html, text, tg = rendered
    channels = row.get("channels") or ["email", "telegram"]
    delivered = 0
    errors = []

    if "email" in channels:
        email, _ = get_email_and_name(row["user_id"])
        if email:
            ok, err = resend_send(email, subject, html, text=text)
            if ok:
                delivered += 1
            else:
                errors.append(f"email:{err}")

    if "telegram" in channels:
        chat_id = get_telegram_id(row["user_id"])
        if chat_id:
            ok, err = telegram_send(chat_id, tg)
            if ok:
                delivered += 1
            else:
                errors.append(f"tg:{err}")

    if delivered > 0:
        db_query(f"UPDATE public.notification_queue SET status='sent', sent_at=now(), "
                 f"attempts=attempts+1 WHERE id={sql_lit(nid)};")
    else:
        err_txt = sql_lit(("; ".join(errors))[:500] or "no delivery channel")
        # tras 5 intentos, marcar como failed para no reintentar por siempre
        db_query(
            "UPDATE public.notification_queue SET "
            "status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END, "
            f"attempts = attempts + 1, last_error = {err_txt} WHERE id={sql_lit(nid)};"
        )


def notification_worker():
    log("notification worker started")
    while True:
        try:
            # Reclama un lote atomico de pendientes
            out = db_query(
                "WITH claimed AS ("
                "  SELECT id FROM public.notification_queue "
                "  WHERE status='pending' AND attempts < 5 "
                "  ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) "
                "UPDATE public.notification_queue q SET status='processing' "
                "FROM claimed WHERE q.id = claimed.id "
                "RETURNING q.id, q.user_id, q.ntype, q.payload::text, q.channels::text;"
            )
            if out:
                for line in out.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split("|")
                    if len(parts) < 5:
                        continue
                    nid, uid, ntype, payload_txt, channels_txt = parts[0], parts[1], parts[2], parts[3], parts[4]
                    try:
                        payload = json.loads(payload_txt) if payload_txt else {}
                    except Exception:
                        payload = {}
                    # channels llega como {email,telegram}
                    channels = [c for c in channels_txt.strip("{}").split(",") if c]
                    try:
                        process_one_notification({
                            "id": nid, "user_id": uid, "ntype": ntype,
                            "payload": payload, "channels": channels})
                    except Exception as e:
                        log("notif process error:", e)
                        db_query(f"UPDATE public.notification_queue SET status='pending', "
                                 f"attempts=attempts+1, last_error={sql_lit(str(e)[:300])} "
                                 f"WHERE id={sql_lit(nid)};")
        except Exception as e:
            log("notification worker loop error:", e)
        time.sleep(NOTIFY_POLL_SECONDS)


ROUTES = {
    "/send-verification-email": ("public", handle_send_verification),
    "/resend-verification-email": ("public", handle_resend_verification),
    "/send-password-reset-email": ("public", handle_password_reset),
    "/update-user-password": ("public", handle_update_password),
    "/send-test-email": ("admin", handle_test_email),
    "/send-broadcast-email": ("admin", handle_broadcast),
    "/send-telegram-broadcast": ("admin", handle_telegram_broadcast),
    "/internal-telegram-broadcast": ("public", handle_internal_telegram_broadcast),
    "/admin-verify-user": ("admin", handle_admin_verify_user),
    "/send-withdrawal-code": ("bearer", handle_send_withdrawal_code),
    "/send-login-code": ("bearer", handle_send_login_code),
    "/verify-login-code": ("bearer", handle_verify_login_code),
    "/verify-recaptcha": ("public", handle_verify_recaptcha),
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, status, obj):
        payload = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers",
                         "Content-Type, Authorization, X-Client-Info, Apikey, apikey")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_GET(self):
        if self.path.rstrip("/") in ("/health", "/email-health"):
            self._send(200, {"ok": True, "service": "xnova-email"})
        else:
            self._send(404, {"success": False, "error": "Not found"})

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        # Allow both /xxx and /functions/v1/xxx just in case.
        for prefix in ("/functions/v1", ""):
            if path.startswith(prefix + "/"):
                key = path[len(prefix):]
                if key in ROUTES:
                    return self._dispatch(key)
        self._send(404, {"success": False, "error": "Not found"})

    def _dispatch(self, key):
        kind, fn = ROUTES[key]
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            body = json.loads(raw or b"{}")
        except Exception:
            return self._send(400, {"success": False, "error": "Cuerpo de solicitud invalido"})
        auth_header = self.headers.get("Authorization", "")
        try:
            if kind == "admin":
                status, obj = fn(body, auth_header)
            elif kind == "bearer":
                uid = get_user_from_bearer(auth_header)
                if not uid:
                    return self._send(401, {"success": False, "error": "Autenticacion requerida"})
                status, obj = fn(body, uid)
            else:
                status, obj = fn(body)
        except Exception as e:
            log("handler error:", key, e)
            return self._send(500, {"success": False, "error": "Error interno del servidor"})
        self._send(status, obj)

    def log_message(self, fmt, *args):
        pass


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def main():
    if not RESEND_API_KEY:
        log("WARNING: RESEND_API_KEY not set; emails will fail.")
    if not JWT_SECRET:
        log("WARNING: SUPABASE_JWT_SECRET not set; admin endpoints will reject all.")
    if not TELEGRAM_BOT_TOKEN:
        log("WARNING: TELEGRAM_BOT_TOKEN not set; telegram notifications will be skipped.")
    worker = threading.Thread(target=notification_worker, daemon=True)
    worker.start()
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    log(f"listening on 0.0.0.0:{LISTEN_PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
