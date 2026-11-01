#!/usr/bin/env python3
"""
XNova Backend Service
Listens on port 9001, handles /verify-deposit and /token-price
"""
import json
import os
import re
import subprocess
import sys
import time
import threading
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib import request, parse

# Load config from .env file if present, otherwise use defaults
def load_env(env_file="/root/xnova/.env"):
    """Load environment variables from .env file"""
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

BSC_RPC_URL = os.environ.get("BSC_RPC_URL", "https://bsc-dataseed1.binance.org")
# Failover list for general JSON-RPC calls (balances, gas, nonce, broadcast,
# receipts). A single slow/unreachable public node must NOT stall or fail a
# withdrawal, so rpc_call() rotates through these on timeout/error. Broadcasting
# the same signed tx to several nodes is safe (idempotent by tx hash).
BSC_RPC_URLS = [u.strip() for u in os.environ.get(
    "BSC_RPC_URLS",
    "https://bsc-dataseed1.binance.org,"
    "https://bsc-dataseed2.binance.org,"
    "https://bsc-dataseed3.binance.org,"
    "https://bsc-dataseed4.binance.org,"
    "https://bsc-rpc.publicnode.com,"
    "https://binance.llamarpc.com,"
    "https://1rpc.io/bnb"
).split(",") if u.strip()]
if BSC_RPC_URL not in BSC_RPC_URLS:
    BSC_RPC_URLS.insert(0, BSC_RPC_URL)
RPC_TIMEOUT = int(os.environ.get("RPC_TIMEOUT", "8"))  # seconds per RPC attempt
# Public dataseed RPCs disable/limit eth_getLogs, so the deposit worker uses
# dedicated logs-capable endpoints. NOTE: free endpoints keep dying/limiting:
# nodies went paid-only in Jul 2026 (this FROZE the scanner ~861k blocks and
# deposits stopped crediting), publicnode rejects historical getLogs, 1rpc caps
# at 50 blocks, blastapi at 10. bloXroute (bsc.rpc.blxrbdn.com) reliably serves
# eth_getLogs at ~2000-block ranges. We keep a FAILOVER LIST so a single dead
# endpoint can never freeze deposits again (see logs_rpc_call()).
LOGS_RPC_URL = os.environ.get("LOGS_RPC_URL", "https://bsc.rpc.blxrbdn.com")
LOGS_RPC_URLS = [u.strip() for u in os.environ.get(
    "LOGS_RPC_URLS",
    "https://bsc.rpc.blxrbdn.com,"
    "https://bsc.meowrpc.com"
).split(",") if u.strip()]
if LOGS_RPC_URL not in LOGS_RPC_URLS:
    LOGS_RPC_URLS.insert(0, LOGS_RPC_URL)
LOGS_MAX_RANGE = int(os.environ.get("LOGS_MAX_RANGE", "2000"))  # max blocks per getLogs sub-request
DEPOSIT_WALLET = os.environ.get("DEPOSIT_WALLET", "0x387526aa3f94f5C41e6a47D8c98751273e2214A3")
TUNG_CONTRACT = os.environ.get("TUNG_CONTRACT", "0x09514EcF8270C12101D077B5e8B034B164F71C5f")
USDT_CONTRACT = os.environ.get("USDT_CONTRACT", "0x55d398326f99059fF775485246999027B3197955")
REQUIRED_CONFIRMATIONS = int(os.environ.get("REQUIRED_CONFIRMATIONS", "3"))
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_USER = os.environ.get("DB_USER", "postgres")
PRIVATE_KEY = os.environ.get("PRIVATE_KEY", "")  # Only needed for withdrawals
CHAIN_ID = int(os.environ.get("CHAIN_ID", "56"))

# --- HD child-wallet deposit system ---
import hmac
import hashlib
# BNB sent to a child wallet so it can pay gas to forward its tokens to the main wallet.
GAS_TOPUP_BNB = float(os.environ.get("GAS_TOPUP_BNB", "0.000015"))
DEPOSIT_WORKER_ENABLED = os.environ.get("DEPOSIT_WORKER_ENABLED", "true").lower() in ("1", "true", "yes")
DEPOSIT_SCAN_INTERVAL = int(os.environ.get("DEPOSIT_SCAN_INTERVAL", "15"))   # seconds
DEPOSIT_CONFIRMATIONS = int(os.environ.get("DEPOSIT_CONFIRMATIONS", "3"))    # blocks before crediting
DEPOSIT_STATE_FILE = os.environ.get("DEPOSIT_STATE_FILE", "/root/xnova/.deposit_scan_state.json")
DEPOSIT_MAX_RANGE = int(os.environ.get("DEPOSIT_MAX_RANGE", "2000"))         # max blocks per getLogs
# How far behind the chain head the scanner currently is (updated each scan).
# Used to skip the (slow) child-wallet sweep during a big historical catch-up so
# missed deposits get CREDITED fast; funds are already safe in the house wallet
# and crediting is idempotent, so sweeping can wait until we're near the head.
_deposit_behind = 0
# ERC-20 Transfer(address,address,uint256) topic
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
# secp256k1 curve order (child private key must be in [1, n-1])
_SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

# eth-account is only needed for withdrawals. Don't crash the deposit service if missing.
try:
    from eth_account import Account as _EthAccount
    _ETH_ACCOUNT_AVAILABLE = True
except Exception as _e:
    _EthAccount = None
    _ETH_ACCOUNT_AVAILABLE = False
    print(f"[WARN] eth-account not available, withdrawals will be disabled: {_e}", file=sys.stderr)

# UUID regex for safe interpolation in SQL (we still validate user-supplied data strictly)
_UUID_RE = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
_HEX_TX_RE = re.compile(r'^0x[0-9a-fA-F]{64}$')
_ADDR_RE = re.compile(r'^0x[0-9a-fA-F]{40}$')

# Price cache (DexScreener rate limit: 300/min, we refresh every 30s = 2/min)
_price_cache = {"data": None, "timestamp": 0}
_price_cache_lock = threading.Lock()
PRICE_CACHE_TTL = 30  # seconds

# Hot wallet on-chain balance cache (avoid hammering public RPCs on every dashboard poll)
_wallet_info_cache = {"data": None, "timestamp": 0}
_wallet_info_cache_lock = threading.Lock()
WALLET_INFO_CACHE_TTL = 20  # seconds

def _fetch_gecko_price():
    """Fallback: TUNG price from GeckoTerminal (DexScreener stopped indexing the token)."""
    url = f"https://api.geckoterminal.com/api/v2/networks/bsc/tokens/{TUNG_CONTRACT}?include=top_pools"
    req = request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
    attrs = (data.get("data") or {}).get("attributes") or {}
    price = float(attrs.get("price_usd") or 0)
    if price <= 0:
        return None
    change = 0.0
    pool_addr = ""
    token_id = f"bsc_{TUNG_CONTRACT.lower()}"
    for pool in data.get("included") or []:
        if pool.get("type") != "pool":
            continue
        base = (((pool.get("relationships") or {}).get("base_token") or {}).get("data") or {}).get("id", "")
        if base.lower() == token_id:
            pa = pool.get("attributes") or {}
            change = float((pa.get("price_change_percentage") or {}).get("h24") or 0)
            pool_addr = pa.get("address", "")
            break
    return {
        "priceUsd": price,
        "volume24h": float((attrs.get("volume_usd") or {}).get("h24") or 0),
        "liquidity": float(attrs.get("total_reserve_in_usd") or 0),
        "marketCap": float(attrs.get("fdv_usd") or 0),
        "priceChange24h": change,
        "pairAddress": pool_addr,
        "dexUrl": f"https://www.geckoterminal.com/bsc/pools/{pool_addr}" if pool_addr else "",
    }

def fetch_token_price():
    """Fetch TUNG price from DexScreener with caching"""
    with _price_cache_lock:
        now = time.time()
        if _price_cache["data"] is not None and (now - _price_cache["timestamp"]) < PRICE_CACHE_TTL:
            return _price_cache["data"]
    
    # DexScreener API - free, 300 req/min
    url = f"https://api.dexscreener.com/latest/dex/tokens/{TUNG_CONTRACT}"
    
    try:
        req = request.Request(url, headers={"User-Agent": "XNova/1.0"})
        with request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print(f"DexScreener error: {e}", file=sys.stderr)
        try:
            gecko = _fetch_gecko_price()
            if gecko:
                with _price_cache_lock:
                    _price_cache["data"] = gecko
                    _price_cache["timestamp"] = time.time()
                return gecko
        except Exception as ge:
            print(f"GeckoTerminal error: {ge}", file=sys.stderr)
        # Return cached data if available, otherwise fallback
        with _price_cache_lock:
            if _price_cache["data"] is not None:
                return _price_cache["data"]
        return {"priceUsd": 0, "volume24h": 0, "liquidity": 0, "marketCap": 0, "priceChange24h": 0}
    
    try:
        pairs = data.get("pairs", [])
        if not pairs:
            # Try search endpoint as fallback
            url2 = f"https://api.dexscreener.com/latest/dex/search?q={TUNG_CONTRACT}"
            req2 = request.Request(url2, headers={"User-Agent": "XNova/1.0"})
            with request.urlopen(req2, timeout=10) as resp2:
                data2 = json.loads(resp2.read().decode())
            pairs = data2.get("pairs", [])
        
        # Find best BSC pair (highest liquidity)
        bsc_pairs = [p for p in pairs if p.get("chainId") == "bsc"]
        if not bsc_pairs:
            bsc_pairs = pairs  # fallback to any chain
        
        if bsc_pairs:
            best = max(bsc_pairs, key=lambda p: float(p.get("liquidity", {}).get("usd", 0) or 0))
            result = {
                "priceUsd": float(best.get("priceUsd", 0) or 0),
                "volume24h": float(best.get("volume", {}).get("h24", 0) or 0),
                "liquidity": float(best.get("liquidity", {}).get("usd", 0) or 0),
                "marketCap": float(best.get("fdv", 0) or 0),
                "priceChange24h": float(best.get("priceChange", {}).get("h24", 0) or 0),
                "pairAddress": best.get("pairAddress", ""),
                "dexUrl": best.get("url", "")
            }
        else:
            result = {"priceUsd": 0, "volume24h": 0, "liquidity": 0, "marketCap": 0, "priceChange24h": 0}
        if not result.get("priceUsd"):
            try:
                gecko = _fetch_gecko_price()
                if gecko:
                    result = gecko
            except Exception as ge:
                print(f"GeckoTerminal error: {ge}", file=sys.stderr)
    except Exception as e:
        print(f"Price parse error: {e}", file=sys.stderr)
        with _price_cache_lock:
            if _price_cache["data"] is not None:
                return _price_cache["data"]
        result = {"priceUsd": 0, "volume24h": 0, "liquidity": 0, "marketCap": 0, "priceChange24h": 0}
    
    with _price_cache_lock:
        _price_cache["data"] = result
        _price_cache["timestamp"] = time.time()
    
    return result

def db_query(sql):
    """Execute SQL via docker exec and return results"""
    cmd = [
        "docker", "exec", "xnova-database",
        "psql", "-U", DB_USER, "-d", DB_NAME,
        "-t", "-A", "-c", sql
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"DB Error: {result.stderr}", file=sys.stderr)
        return None
    return result.stdout.strip()

def get_user_id_from_token(auth_header):
    """Extract user_id from JWT by calling the database"""
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    # Query the database to find the user from auth.users
    # The JWT contains the user ID in sub claim, but we can verify via auth schema
    # For simplicity, query auth.users with the token
    sql = f"""
    SELECT id FROM auth.users 
    WHERE id = (
        SELECT auth.uid() 
    )
    LIMIT 1;
    """
    # Actually, we need to decode the JWT or use a simpler approach
    # Let's just get the user from the auth schema directly
    return None  # We'll handle this differently

def rpc_call(method, params, url=None):
    """Make a JSON-RPC call to BSC with retry + endpoint failover.

    - If `url` is given (e.g. the logs endpoint) only that endpoint is used
      (with retries), since not every endpoint supports eth_getLogs.
    - Otherwise rpc_call rotates through BSC_RPC_URLS so a single slow or
      unreachable node can't stall or fail a withdrawal's balance/broadcast
      calls. Re-broadcasting the same signed tx to several nodes is safe
      (idempotent by tx hash), so failover on eth_sendRawTransaction is fine.
    Returns the JSON-RPC `result`, or None if every attempt failed.
    """
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    }).encode()

    endpoints = [url] if url else list(BSC_RPC_URLS)
    # Two bounded passes over the endpoints = fast, capped retries.
    for _attempt in range(2):
        for endpoint in endpoints:
            req = request.Request(
                endpoint,
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
            )
            try:
                with request.urlopen(req, timeout=RPC_TIMEOUT) as resp:
                    data = json.loads(resp.read().decode())
                if isinstance(data, dict) and data.get("error"):
                    print(f"RPC error ({method}) via {endpoint}: {data['error']}", file=sys.stderr)
                    continue
                return data.get("result")
            except Exception as e:
                print(f"RPC error ({method}) via {endpoint}: {e}", file=sys.stderr)
                continue
    return None

def logs_rpc_call(method, params):
    """Logs-endpoint call (eth_getLogs / eth_blockNumber) with failover across
    LOGS_RPC_URLS. Returns the first successful result (an empty list [] is a
    valid result and short-circuits), or None only if EVERY logs endpoint failed.
    This prevents one dead endpoint (e.g. nodies going paid) from freezing the
    deposit scanner."""
    for endpoint in LOGS_RPC_URLS:
        res = rpc_call(method, params, url=endpoint)
        if res is not None:
            return res
    return None

def verify_bsc_transaction(tx_hash):
    """Verify a transaction on BSC using JSON-RPC"""
    tx = rpc_call("eth_getTransactionByHash", [tx_hash])
    
    if not tx:
        return {"success": False, "error": "Transaction not found on BSC. Check the hash and try again."}
    
    to_addr = (tx.get("to") or "").lower()
    our_wallet = DEPOSIT_WALLET.lower()
    input_data = tx.get("input", "")
    
    # Check if it's a direct BNB transfer to our wallet
    if to_addr == our_wallet:
        amount_wei = int(tx.get("value", "0x0"), 16)
        amount_bnb = amount_wei / 1e18
        if amount_bnb > 0:
            return {
                "success": True,
                "type": "BNB",
                "amount": amount_bnb,
                "from": tx.get("from", ""),
                "to": to_addr,
                "blockNumber": int(tx.get("blockNumber", "0x0"), 16) if tx.get("blockNumber") else 0
            }
    
    # Check if it's a token transfer (BEP-20)
    # Standard BEP-20 transfer: method ID 0xa9059cbb + to_address (32 bytes) + amount (32 bytes)
    if input_data.startswith("0xa9059cbb") and to_addr.lower() == TUNG_CONTRACT.lower():
        if len(input_data) >= 138:
            recipient = "0x" + input_data[34:74]
            amount_hex = input_data[74:138]
            amount_raw = int(amount_hex, 16) if amount_hex.strip("0") else 0
            amount_tung = amount_raw / 1e18  # Assuming 18 decimals
            
            if recipient.lower() == our_wallet and amount_tung > 0:
                return {
                    "success": True,
                    "type": "TUNG",
                    "amount": amount_tung,
                    "from": tx.get("from", ""),
                    "to": recipient,
                    "blockNumber": int(tx.get("blockNumber", "0x0"), 16) if tx.get("blockNumber") else 0
                }
    
    # Check if it's a USDT (BEP-20) transfer to our wallet
    if input_data.startswith("0xa9059cbb") and to_addr.lower() == USDT_CONTRACT.lower():
        if len(input_data) >= 138:
            recipient = "0x" + input_data[34:74]
            amount_hex = input_data[74:138]
            amount_raw = int(amount_hex, 16) if amount_hex.strip("0") else 0
            usdt_decimals = get_token_decimals(USDT_CONTRACT)  # BSC USDT = 18
            amount_usdt = amount_raw / (10 ** usdt_decimals)

            if recipient.lower() == our_wallet and amount_usdt > 0:
                return {
                    "success": True,
                    "type": "USDT",
                    "amount": amount_usdt,
                    "from": tx.get("from", ""),
                    "to": recipient,
                    "blockNumber": int(tx.get("blockNumber", "0x0"), 16) if tx.get("blockNumber") else 0
                }
    
    # If we get here, it's not a valid deposit
    return {
        "success": False, 
        "error": "Transaction found but it's not a valid deposit to our wallet. Make sure you sent TUNG or USDT tokens to the correct deposit address."
    }

def get_transaction_receipt(tx_hash):
    """Get transaction receipt to check confirmations"""
    return rpc_call("eth_getTransactionReceipt", [tx_hash])

def get_block_number():
    """Get current block number"""
    result = rpc_call("eth_blockNumber", [])
    if result:
        return int(result, 16)
    return 0

def confirm_deposit_in_db(tx_hash, user_id, amount, block_number, confirmations, token_type):
    """Call the appropriate confirm_deposit database function based on token type."""
    if token_type == "USDT":
        sql = f"""
        SELECT public.confirm_deposit_usdt(
            '{tx_hash.lower()}',
            '{user_id}',
            {amount},
            {block_number},
            {confirmations}
        );
        """
    else:
        sql = f"""
        SELECT public.confirm_deposit(
            '{tx_hash}',
            '{user_id}',
            {amount},
            {block_number},
            {confirmations},
            '{token_type}'
        );
        """
    result = db_query(sql)
    if result:
        try:
            return json.loads(result)
        except:
            pass
    return {"success": False, "error": "Database error"}

def verify_deposit_for_user(tx_hash, user_id):
    """Full verification flow"""
    # Check if transaction was already processed
    check_sql = f"""
    SELECT status FROM public.wallet_transactions 
    WHERE tx_hash = '{tx_hash.lower()}' 
    LIMIT 1;
    """
    existing = db_query(check_sql)
    if existing and "confirmed" in existing:
        return {"success": False, "error": "This transaction has already been verified and credited."}
    
    # Verify transaction on BSC
    tx_result = verify_bsc_transaction(tx_hash)
    if not tx_result["success"]:
        return tx_result
    
    # Check confirmations
    receipt = get_transaction_receipt(tx_hash)
    current_block = get_block_number()
    tx_block = tx_result.get("blockNumber", 0)
    
    if receipt and current_block > 0:
        confirmations = current_block - tx_block + 1 if tx_block > 0 else 0
    else:
        confirmations = 0
    
    if confirmations < REQUIRED_CONFIRMATIONS:
        return {
            "success": False,
            "error": f"Transaction needs {REQUIRED_CONFIRMATIONS} confirmations. Currently has {confirmations}. Please wait and try again."
        }
    
    # Confirm deposit in DB
    amount = tx_result["amount"]
    token_type = tx_result.get("type", "TUNG")
    db_result = confirm_deposit_in_db(tx_hash, user_id, amount, tx_block, confirmations, token_type)
    
    if db_result.get("success"):
        return {
            "success": True,
            "amount": amount,
            "tokenType": tx_result["type"],
            "message": f"Deposit confirmed! {amount} {tx_result['type']} credited to your account."
        }
    else:
        return {
            "success": False,
            "error": db_result.get("error", "Failed to credit deposit. Contact support.")
        }


# =====================================================================
# WITHDRAWAL SUPPORT
# Implements /auto-withdraw equivalent to the Supabase edge function.
# Reuses existing DB RPCs:
#   - request_withdrawal(p_amount, p_wallet_address)   [as user]
#   - complete_withdrawal(p_tx_id, p_tx_hash, p_block_number)  [as service_role]
#   - fail_withdrawal(p_tx_id, p_error_message)                 [as service_role]
# =====================================================================

def _extract_last_json(output):
    """Extract the last JSON object line from psql output (skips BEGIN/SET/COMMIT lines)."""
    if not output:
        return None
    for line in reversed(output.strip().split("\n")):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except Exception:
                continue
    return None


def db_call_as_user(user_id, sql):
    """Run a SELECT in a tx with auth.uid() = user_id. Returns the parsed JSON result."""
    if not _UUID_RE.match(user_id or ""):
        return {"success": False, "error": "Invalid user id"}
    wrapped = (
        "BEGIN;"
        f"SET LOCAL \"request.jwt.claim.sub\" TO '{user_id}';"
        f"SET LOCAL \"request.jwt.claims\" TO '{{\"sub\":\"{user_id}\",\"role\":\"authenticated\"}}';"
        f"{sql}"
        "COMMIT;"
    )
    out = db_query(wrapped)
    if out is None:
        return {"success": False, "error": "Database error"}
    parsed = _extract_last_json(out)
    return parsed if parsed is not None else {"success": False, "error": "Unexpected DB output", "raw": out[:200]}


def db_call_as_service_role(sql):
    """Run a SELECT as service_role (for complete_withdrawal / fail_withdrawal)."""
    wrapped = f"BEGIN; SET LOCAL ROLE service_role; {sql} COMMIT;"
    out = db_query(wrapped)
    if out is None:
        return {"success": False, "error": "Database error"}
    parsed = _extract_last_json(out)
    return parsed if parsed is not None else {"success": False, "error": "Unexpected DB output", "raw": out[:200]}


def _sql_escape(s):
    """Escape single quotes for SQL literal (used for already-validated short fields)."""
    return s.replace("'", "''")


def verify_withdrawal_code(user_id, amount, wallet_address, token_type, code):
    """Verifica (y consume) el codigo 2FA de retiro emitido por el email service.
    Debe coincidir user_id + purpose + monto + wallet + token, sin usar y sin expirar."""
    if not code or not re.match(r'^\d{6}$', str(code)):
        return False, "Codigo de confirmacion requerido"
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return False, "Monto invalido"
    wallet = (wallet_address or "").strip()
    tok = (token_type or "TUNG").upper()
    sql = (
        "WITH c AS ("
        "  SELECT id FROM public.email_2fa_codes "
        f"  WHERE user_id = '{user_id}' AND purpose = 'withdrawal' AND code = '{_sql_escape(str(code))}' "
        "    AND used_at IS NULL AND expires_at > now() "
        f"    AND lower(payload->>'wallet_address') = lower('{_sql_escape(wallet)}') "
        f"    AND upper(payload->>'token_type') = '{_sql_escape(tok)}' "
        f"    AND round((payload->>'amount')::numeric, 8) = round({amt}::numeric, 8) "
        "  ORDER BY created_at DESC LIMIT 1) "
        "UPDATE public.email_2fa_codes e SET used_at = now() FROM c "
        "WHERE e.id = c.id RETURNING 'ok';"
    )
    out = db_query(sql)
    if out and "ok" in out:
        return True, None
    return False, "Codigo incorrecto o expirado"


def encode_erc20_transfer(to_addr, amount_wei):
    """Encode ERC20 transfer(address,uint256) call data."""
    addr = to_addr.lower().replace("0x", "").zfill(64)
    amt = format(amount_wei, "x").zfill(64)
    return "0x" + "a9059cbb" + addr + amt


def get_token_balance(token, holder):
    """ERC20 balanceOf(address) → int."""
    data = "0x70a08231" + holder.lower().replace("0x", "").zfill(64)
    result = rpc_call("eth_call", [{"to": token, "data": data}, "latest"])
    if not result or result == "0x":
        return 0
    try:
        return int(result, 16)
    except Exception:
        return 0


def get_token_decimals(token):
    """ERC20 decimals() → int (cached)."""
    if not hasattr(get_token_decimals, "_cache"):
        get_token_decimals._cache = {}
    if token in get_token_decimals._cache:
        return get_token_decimals._cache[token]
    result = rpc_call("eth_call", [{"to": token, "data": "0x313ce567"}, "latest"])
    try:
        dec = int(result, 16) if result and result != "0x" else 18
    except Exception:
        dec = 18
    get_token_decimals._cache[token] = dec
    return dec


def get_native_balance(addr):
    result = rpc_call("eth_getBalance", [addr, "latest"])
    try:
        return int(result, 16) if result else 0
    except Exception:
        return 0


def get_nonce(addr):
    result = rpc_call("eth_getTransactionCount", [addr, "pending"])
    return int(result, 16) if result else 0


def get_gas_price():
    result = rpc_call("eth_gasPrice", [])
    return int(result, 16) if result else int(3e9)  # fallback 3 gwei


def fetch_wallet_info():
    """Real on-chain balances (TUNG/USDT/BNB) of the hot wallet (DEPOSIT_WALLET),
    used by the admin Dashboard Financiero. Cached briefly to avoid hammering
    public RPCs on every dashboard poll."""
    with _wallet_info_cache_lock:
        now = time.time()
        if _wallet_info_cache["data"] is not None and (now - _wallet_info_cache["timestamp"]) < WALLET_INFO_CACHE_TTL:
            return _wallet_info_cache["data"]

    base = {
        "success": True,
        "depositAddress": DEPOSIT_WALLET,
        "tokenContract": TUNG_CONTRACT,
        "usdtContract": USDT_CONTRACT,
        "chainId": CHAIN_ID,
        "depositsEnabled": True,
        "usdtDepositsEnabled": True,
        "config": {"requiredConfirmations": REQUIRED_CONFIRMATIONS},
    }
    try:
        tung_dec = get_token_decimals(TUNG_CONTRACT)
        usdt_dec = get_token_decimals(USDT_CONTRACT)
        tung_bal = get_token_balance(TUNG_CONTRACT, DEPOSIT_WALLET) / (10 ** tung_dec)
        usdt_bal = get_token_balance(USDT_CONTRACT, DEPOSIT_WALLET) / (10 ** usdt_dec)
        bnb_bal = get_native_balance(DEPOSIT_WALLET) / 1e18
        result = {
            **base,
            "tokenBalance": str(tung_bal),
            "usdtBalance": str(usdt_bal),
            "bnbBalance": str(bnb_bal),
        }
    except Exception as e:
        print(f"wallet-info error: {e}", file=sys.stderr)
        result = {**base, "tokenBalance": "0", "usdtBalance": "0", "bnbBalance": "0"}

    with _wallet_info_cache_lock:
        _wallet_info_cache["data"] = result
        _wallet_info_cache["timestamp"] = time.time()
    return result


def estimate_gas(from_addr, to_addr, data):
    """Estimate gas for a call, with a safety buffer. Falls back to 250000.
    TUNG is a fee/reflection token whose transfer needs ~187k gas, well above
    the standard ERC20 ~50k, so a fixed low limit causes out-of-gas reverts."""
    result = rpc_call("eth_estimateGas", [{"from": from_addr, "to": to_addr, "data": data}])
    try:
        est = int(result, 16) if result and result != "0x" else 0
    except Exception:
        est = 0
    if est <= 0:
        return 250000  # safe fallback
    buffered = int(est * 1.3)  # +30% headroom
    return max(buffered, 250000)


def send_raw(signed_hex):
    return rpc_call("eth_sendRawTransaction", [signed_hex])


def wait_for_receipt(tx_hash, max_wait=150, poll=3):
    start = time.time()
    while time.time() - start < max_wait:
        r = rpc_call("eth_getTransactionReceipt", [tx_hash])
        if r:
            return r
        time.sleep(poll)
    return None


# Serializes nonce fetch + sign + broadcast so concurrent withdrawals (now that
# the HTTP server is multi-threaded) can't grab the same nonce and collide.
_withdraw_lock = threading.Lock()


def sign_and_send_tung(to_addr, amount_wei, token_contract=None):
    """Sign & broadcast an ERC20 transfer (TUNG by default, or any token_contract).
    Returns (tx_hash, sender_address) or raises."""
    if token_contract is None:
        token_contract = TUNG_CONTRACT
    if not _ETH_ACCOUNT_AVAILABLE:
        raise RuntimeError("eth-account library not installed on server")
    if not PRIVATE_KEY:
        raise RuntimeError("PRIVATE_KEY not configured")
    pk = PRIVATE_KEY if PRIVATE_KEY.startswith("0x") else ("0x" + PRIVATE_KEY)
    acct = _EthAccount.from_key(pk)
    sender = acct.address

    # Hold the lock across nonce->sign->broadcast so parallel withdrawals get
    # sequential nonces (get_nonce uses the 'pending' count, which only advances
    # once the previous tx has actually been broadcast).
    with _withdraw_lock:
        nonce = get_nonce(sender)
        gas_price = int(get_gas_price() * 1.1)  # +10% bump
        data = encode_erc20_transfer(to_addr, amount_wei)
        gas_limit = estimate_gas(sender, token_contract, data)
        tx = {
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": gas_limit,
            "to": token_contract,
            "value": 0,
            "data": data,
            "chainId": CHAIN_ID,
        }
        signed = _EthAccount.sign_transaction(tx, pk)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
        if raw is None:
            raise RuntimeError("Could not get raw signed transaction")
        raw_hex = raw.hex() if isinstance(raw, (bytes, bytearray)) else str(raw)
        if not raw_hex.startswith("0x"):
            raw_hex = "0x" + raw_hex

        tx_hash = send_raw(raw_hex)
        if not tx_hash:
            raise RuntimeError("BSC RPC rejected the transaction")
        return tx_hash, sender


def process_withdrawal_for_user(user_id, amount, wallet_address, token_type="TUNG"):
    """Full withdrawal flow: request → sign → broadcast → complete/fail."""
    token_type = (token_type or "TUNG").upper()
    if token_type not in ("TUNG", "USDT"):
        return {"success": False, "error": "Unsupported token type"}, 400
    token_contract = USDT_CONTRACT if token_type == "USDT" else TUNG_CONTRACT
    request_rpc = "request_withdrawal_usdt" if token_type == "USDT" else "request_withdrawal"
    fail_rpc = "fail_withdrawal_usdt" if token_type == "USDT" else "fail_withdrawal"

    # Basic validation
    if not isinstance(amount, (int, float)) or amount <= 0:
        return {"success": False, "error": "Invalid amount"}, 400
    if not _ADDR_RE.match(wallet_address or ""):
        return {"success": False, "error": "Invalid wallet address"}, 400
    if not _ETH_ACCOUNT_AVAILABLE:
        return {"success": False, "error": "Server wallet signer not available"}, 500
    if not PRIVATE_KEY:
        return {"success": False, "error": "Server wallet not configured"}, 500

    # Step 1: create the withdrawal request (deducts balance, returns tx_id + net amount)
    req_sql = f"SELECT public.{request_rpc}({float(amount)}::numeric, '{_sql_escape(wallet_address)}'::text);"
    req_result = db_call_as_user(user_id, req_sql)
    if not isinstance(req_result, dict) or not req_result.get("success"):
        err = (req_result or {}).get("error", "Failed to create withdrawal request")
        return {"success": False, "error": err}, 400

    tx_id = req_result.get("transaction_id")
    net_amount = req_result.get("amount")
    if not tx_id or net_amount is None:
        return {"success": False, "error": "Withdrawal RPC returned incomplete data"}, 500

    print(f"[withdraw] user={user_id} token={token_type} tx_id={tx_id} net={net_amount} to={wallet_address}", flush=True)

    def _fail(msg):
        try:
            db_call_as_service_role(
                f"SELECT public.{fail_rpc}('{_sql_escape(str(tx_id))}'::uuid, '{_sql_escape(msg)[:500]}'::text);"
            )
        except Exception as e:
            print(f"[withdraw] {fail_rpc} RPC error: {e}", flush=True)

    # Step 2: mark as processing
    db_call_as_service_role(
        f"UPDATE public.wallet_transactions SET status='processing', updated_at=now() "
        f"WHERE id='{_sql_escape(str(tx_id))}'::uuid; SELECT jsonb_build_object('success', true);"
    )

    try:
        # Step 3: pre-flight balance checks
        decimals = get_token_decimals(token_contract)
        amount_wei = int(round(float(net_amount) * (10 ** decimals)))

        # derive sender from PK
        pk = PRIVATE_KEY if PRIVATE_KEY.startswith("0x") else ("0x" + PRIVATE_KEY)
        sender = _EthAccount.from_key(pk).address

        token_bal = get_token_balance(token_contract, sender)
        if token_bal < amount_wei:
            avail = token_bal / (10 ** decimals)
            msg = f"Insufficient {token_type}: {avail} available, {net_amount} needed"
            _fail(msg)
            return {"success": False, "error": msg + ". Balance refunded."}, 500

        bnb_bal = get_native_balance(sender)
        # Compute the real gas cost for the token transfer
        gas_price = int(get_gas_price() * 1.1)
        gas_limit = estimate_gas(sender, token_contract, encode_erc20_transfer(wallet_address, amount_wei))
        gas_cost = gas_limit * gas_price
        if bnb_bal < gas_cost:
            needed = gas_cost / 1e18
            avail = bnb_bal / 1e18
            msg = f"Insufficient BNB for gas: {avail:.6f} available, {needed:.6f} needed"
            _fail(msg)
            return {"success": False, "error": msg + ". Balance refunded."}, 500

        # Step 4: sign & broadcast
        tx_hash, _ = sign_and_send_tung(wallet_address, amount_wei, token_contract)
        print(f"[withdraw] broadcast tx={tx_hash}", flush=True)

        # store the tx_hash early (so admin sees it even if confirmation hangs)
        db_call_as_service_role(
            f"UPDATE public.wallet_transactions SET tx_hash='{_sql_escape(tx_hash)}', updated_at=now() "
            f"WHERE id='{_sql_escape(str(tx_id))}'::uuid; SELECT jsonb_build_object('success', true);"
        )

        # Step 5: wait for receipt (~2 confirmations equivalent)
        receipt = wait_for_receipt(tx_hash, max_wait=150, poll=3)
        if not receipt:
            # Don't fail - the tx may still confirm. Leave in 'processing' so admin can verify.
            return {
                "success": True,
                "amount": net_amount,
                "tokenType": token_type,
                "txHash": tx_hash,
                "pending": True,
                "message": f"Withdrawal broadcast. Confirmation pending. Tx: {tx_hash}"
            }, 200

        status = receipt.get("status")
        if status == "0x1":
            block_num = int(receipt.get("blockNumber", "0x0"), 16)
            db_call_as_service_role(
                f"SELECT public.complete_withdrawal('{_sql_escape(str(tx_id))}'::uuid, "
                f"'{_sql_escape(tx_hash)}'::text, {block_num}::bigint);"
            )
            return {
                "success": True,
                "amount": net_amount,
                "tokenType": token_type,
                "txHash": tx_hash,
                "blockNumber": block_num,
                "message": f"Withdrawal of {net_amount} {token_type} completed successfully"
            }, 200
        else:
            msg = "Transaction reverted on-chain"
            _fail(msg)
            return {"success": False, "error": msg + ". Balance refunded."}, 500

    except Exception as e:
        err_msg = str(e)[:300]
        print(f"[withdraw] blockchain error: {err_msg}", flush=True)
        _fail(f"Blockchain error: {err_msg}")
        return {"success": False, "error": f"Blockchain error: {err_msg}. Balance refunded."}, 500


# =====================================================================
# HD CHILD-WALLET DEPOSIT SYSTEM
# =====================================================================
# Each user gets a deterministic per-user deposit address derived from the
# main wallet private key via HMAC-SHA256(master_priv, "xnova-deposit:<uuid>").
# A background worker:
#   1) scans BSC Transfer logs to the child addresses (TUNG + USDT) and credits
#      the user via credit_auto_deposit() (idempotent by tx_hash, admin keeps a
#      small gas buffer);
#   2) sweeps any token balance sitting in a child wallet back to the main wallet
#      (topping the child up with a little BNB for gas first).
# The master private key never leaves the server; child keys are re-derived on
# demand and never stored.

def _pk_norm(pk):
    return pk if pk.startswith("0x") else ("0x" + pk)


def _master_pk_bytes():
    if not PRIVATE_KEY:
        raise RuntimeError("PRIVATE_KEY not configured")
    return bytes.fromhex(_pk_norm(PRIVATE_KEY)[2:])


def derive_child(user_id):
    """Deterministically derive (address, private_key_hex) for a user from the
    master private key. Server-only, reproducible, never stored on disk."""
    if not _ETH_ACCOUNT_AVAILABLE:
        raise RuntimeError("eth-account library not installed on server")
    master = _master_pk_bytes()
    msg = ("xnova-deposit:" + str(user_id)).encode()
    counter = 0
    while True:
        digest = hmac.new(master, msg + bytes([counter]), hashlib.sha256).digest()
        k = int.from_bytes(digest, "big")
        if 1 <= k < _SECP256K1_N:
            child_pk = "0x" + digest.hex()
            acct = _EthAccount.from_key(child_pk)
            return acct.address, child_pk
        counter += 1


def get_or_register_child(user_id):
    """Derive the user's child deposit address and persist it (idempotent)."""
    if not _UUID_RE.match(user_id or ""):
        raise RuntimeError("invalid user id")
    addr, child_pk = derive_child(user_id)
    db_query(f"SELECT public.register_deposit_address('{user_id}'::uuid, '{addr}', NULL);")
    return addr, child_pk


def get_deposit_config():
    """Read deposit buffers / session length from game_settings (with fallbacks)."""
    cfg = {"gasBufferTung": 100.0, "gasBufferUsdt": 0.05, "sessionMinutes": 30}
    out = db_query(
        "SELECT key, value FROM public.game_settings WHERE key IN "
        "('deposit_gas_buffer_tung','deposit_gas_buffer_usdt','deposit_session_minutes');"
    )
    if out:
        for line in out.split("\n"):
            if "|" not in line:
                continue
            k, _, v = line.partition("|")
            k, v = k.strip(), v.strip()
            try:
                if k == "deposit_gas_buffer_tung":
                    cfg["gasBufferTung"] = float(v)
                elif k == "deposit_gas_buffer_usdt":
                    cfg["gasBufferUsdt"] = float(v)
                elif k == "deposit_session_minutes":
                    cfg["sessionMinutes"] = int(float(v))
            except Exception:
                pass
    # Dynamic TUNG buffer: charge the USD value of the USDT buffer worth of TUNG,
    # based on the live price. Falls back to the fixed gasBufferTung when the price
    # is unavailable/stale.
    try:
        price_out = db_query("SELECT public.get_live_tung_price_usd();")
        price = float((price_out or "").strip()) if (price_out or "").strip() else None
        if price and price > 0:
            cfg["gasBufferTung"] = cfg["gasBufferUsdt"] / price
    except Exception:
        pass
    return cfg


def _addr_topic(addr):
    return "0x" + addr.lower().replace("0x", "").zfill(64)


def load_children():
    """Return {lower_address: user_id} from deposit_addresses."""
    out = db_query("SELECT user_id, address FROM public.deposit_addresses;")
    children = {}
    if out:
        for line in out.split("\n"):
            line = line.strip()
            if not line or "|" not in line:
                continue
            uid, _, addr = line.partition("|")
            uid, addr = uid.strip(), addr.strip()
            if _UUID_RE.match(uid) and _ADDR_RE.match(addr):
                children[addr.lower()] = uid
    return children


def _load_scan_state():
    try:
        with open(DEPOSIT_STATE_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_scan_state(state):
    try:
        with open(DEPOSIT_STATE_FILE, "w") as f:
            json.dump(state, f)
    except Exception as e:
        print(f"[deposit-worker] state save error: {e}", flush=True)


def sign_native_transfer(pk, to_addr, value_wei):
    """Sign & broadcast a native BNB transfer from the given private key."""
    acct = _EthAccount.from_key(_pk_norm(pk))
    sender = acct.address
    nonce = get_nonce(sender)
    gas_price = int(get_gas_price() * 1.1)
    tx = {
        "nonce": nonce,
        "gasPrice": gas_price,
        "gas": 21000,
        "to": to_addr,
        "value": int(value_wei),
        "chainId": CHAIN_ID,
    }
    signed = _EthAccount.sign_transaction(tx, _pk_norm(pk))
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
    raw_hex = raw.hex() if isinstance(raw, (bytes, bytearray)) else str(raw)
    if not raw_hex.startswith("0x"):
        raw_hex = "0x" + raw_hex
    return send_raw(raw_hex)


def sign_erc20_transfer(pk, to_addr, amount_wei, token_contract):
    """Sign & broadcast an ERC20 transfer from the given private key."""
    acct = _EthAccount.from_key(_pk_norm(pk))
    sender = acct.address
    nonce = get_nonce(sender)
    gas_price = int(get_gas_price() * 1.1)
    data = encode_erc20_transfer(to_addr, int(amount_wei))
    gas_limit = estimate_gas(sender, token_contract, data)
    tx = {
        "nonce": nonce,
        "gasPrice": gas_price,
        "gas": gas_limit,
        "to": token_contract,
        "value": 0,
        "data": data,
        "chainId": CHAIN_ID,
    }
    signed = _EthAccount.sign_transaction(tx, _pk_norm(pk))
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
    raw_hex = raw.hex() if isinstance(raw, (bytes, bytearray)) else str(raw)
    if not raw_hex.startswith("0x"):
        raw_hex = "0x" + raw_hex
    return send_raw(raw_hex)


def scan_and_credit(children):
    """Scan new BSC Transfer logs to child addresses and credit the users."""
    global _deposit_behind
    if not children:
        return
    state = _load_scan_state()
    # Current head from the general (dataseed) RPC with failover - reliable and
    # cheap; do NOT depend on the logs endpoint for the block number.
    _bn = rpc_call("eth_blockNumber", [])
    current = int(_bn, 16) if _bn else 0
    if current <= 0:
        return
    safe_to = current - DEPOSIT_CONFIRMATIONS
    if safe_to <= 0:
        return
    last = state.get("last_block")
    if last is None:
        last = safe_to - 5  # first run: only look a few blocks back
    _deposit_behind = safe_to - last
    if (safe_to - last) > 5000:
        print(f"[deposit-worker] catching up: {safe_to - last} blocks behind "
              f"(last={last} head={current})", flush=True)
    from_block = last + 1
    if from_block > safe_to:
        return
    if safe_to - from_block > DEPOSIT_MAX_RANGE:
        safe_to = from_block + DEPOSIT_MAX_RANGE

    topic_children = [_addr_topic(a) for a in children.keys()]
    logs = []
    last_ok = last  # highest block fully fetched this cycle
    chunk_start = from_block
    while chunk_start <= safe_to:
        chunk_end = min(chunk_start + LOGS_MAX_RANGE - 1, safe_to)
        params = [{
            "fromBlock": hex(chunk_start),
            "toBlock": hex(chunk_end),
            "address": [TUNG_CONTRACT, USDT_CONTRACT],
            "topics": [TRANSFER_TOPIC, None, topic_children],
        }]
        part = logs_rpc_call("eth_getLogs", params)
        if part is None:
            # Every logs endpoint failed: stop here, keep progress up to last_ok,
            # retry the rest next cycle. We never advance past an unscanned range,
            # so no deposit is silently skipped.
            print("[deposit-worker] all logs endpoints failed this cycle; will retry", flush=True)
            break
        logs.extend(part)
        last_ok = chunk_end
        chunk_start = chunk_end + 1

    for lg in logs:
        try:
            log_addr = (lg.get("address") or "").lower()
            if log_addr == USDT_CONTRACT.lower():
                token, token_contract = "USDT", USDT_CONTRACT
            else:
                token, token_contract = "TUNG", TUNG_CONTRACT
            topics = lg.get("topics") or []
            if len(topics) < 3:
                continue
            to_addr = "0x" + topics[2][-40:]
            uid = children.get(to_addr.lower())
            if not uid:
                continue
            amount_raw = int(lg.get("data", "0x0"), 16)
            if amount_raw <= 0:
                continue
            decimals = get_token_decimals(token_contract)
            amount = amount_raw / (10 ** decimals)
            tx_hash = lg.get("transactionHash", "")
            if not _HEX_TX_RE.match(tx_hash or ""):
                continue
            block = int(lg.get("blockNumber", "0x0"), 16)
            sql = (
                f"SELECT public.credit_auto_deposit('{tx_hash.lower()}','{uid}'::uuid,"
                f"{amount}::numeric,'{token}',{block}::bigint,'{to_addr}');"
            )
            res = db_query(sql)
            print(f"[deposit] credit {amount} {token} user={uid} tx={tx_hash} -> {res}", flush=True)
        except Exception as e:
            print(f"[deposit] log parse error: {e}", flush=True)

    if last_ok > last:
        state["last_block"] = last_ok
        _save_scan_state(state)


def sweep_child(child_addr, child_pk):
    """Move any TUNG/USDT sitting in a child wallet back to the main wallet."""
    for token_contract in (TUNG_CONTRACT, USDT_CONTRACT):
        try:
            bal = get_token_balance(token_contract, child_addr)
            if bal <= 0:
                continue
            gas_price = int(get_gas_price() * 1.1)
            gas_limit = estimate_gas(child_addr, token_contract,
                                     encode_erc20_transfer(DEPOSIT_WALLET, bal))
            needed = gas_limit * gas_price
            child_bnb = get_native_balance(child_addr)
            if child_bnb < needed:
                topup_wei = int(GAS_TOPUP_BNB * 1e18)
                th = sign_native_transfer(PRIVATE_KEY, child_addr, topup_wei)
                if th:
                    wait_for_receipt(th, max_wait=90, poll=3)
                child_bnb = get_native_balance(child_addr)
                if child_bnb < needed:
                    print(f"[sweep] {child_addr} insufficient gas "
                          f"({child_bnb/1e18:.6f} < {needed/1e18:.6f} BNB) after top-up; "
                          f"retrying next cycle", flush=True)
                    continue
            tx_hash = sign_erc20_transfer(child_pk, DEPOSIT_WALLET, bal, token_contract)
            token = "USDT" if token_contract.lower() == USDT_CONTRACT.lower() else "TUNG"
            print(f"[sweep] {child_addr} -> main {bal/1e18} {token} tx={tx_hash}", flush=True)
        except Exception as e:
            print(f"[sweep] {child_addr} token {token_contract} error: {e}", flush=True)


def sweep_all(children):
    for uid in list(children.values()):
        try:
            child_addr, child_pk = derive_child(uid)
            sweep_child(child_addr, child_pk)
        except Exception as e:
            print(f"[sweep] user {uid} error: {e}", flush=True)


def deposit_worker():
    """Background loop: credit incoming deposits + sweep child wallets."""
    print("[deposit-worker] started", flush=True)
    while True:
        try:
            children = load_children()
            scan_and_credit(children)
            # During a big historical catch-up, skip the slow per-child sweep so
            # deposits get credited fast (funds already in house wallet; credit
            # is idempotent). Sweep runs normally once we're near the head.
            if _deposit_behind <= DEPOSIT_MAX_RANGE:
                sweep_all(children)
            else:
                print(f"[deposit-worker] catching up ({_deposit_behind} behind); "
                      f"sweep deferred", flush=True)
        except Exception as e:
            print(f"[deposit-worker] loop error: {e}", flush=True)
        # While backfilling a big gap, loop fast; return to normal cadence once
        # we're within one scan window of the chain head.
        if _deposit_behind > DEPOSIT_MAX_RANGE:
            time.sleep(1)
        else:
            time.sleep(DEPOSIT_SCAN_INTERVAL)


class DepositHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_OPTIONS(self):
        self._send_json({})
    
    def do_POST(self):
        if self.path == "/verify-deposit":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            body_str = body.decode("utf-8", errors="replace")
            print(f"DEBUG POST body ({content_length}b): {repr(body_str[:500])}", flush=True)
            
            try:
                data = json.loads(body_str)
            except Exception as e:
                print(f"DEBUG JSON parse error: {e} body={repr(body_str[:200])}", flush=True)
                self._send_json({"success": False, "error": f"Invalid JSON: {str(e)}"}, 400)
                return
            
            tx_hash = data.get("txHash", "").strip()
            if not tx_hash:
                self._send_json({"success": False, "error": "Transaction hash required"}, 400)
                return
            
            # Get user from Authorization header
            auth_header = self.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                self._send_json({"success": False, "error": "Authentication required"}, 401)
                return
            
            token = auth_header[7:]
            # Extract user_id from JWT (decode the payload)
            try:
                import base64
                parts = token.split(".")
                if len(parts) >= 2:
                    payload = parts[1]
                    # Add padding
                    payload += "=" * (4 - len(payload) % 4)
                    decoded = base64.urlsafe_b64decode(payload)
                    jwt_data = json.loads(decoded)
                    user_id = jwt_data.get("sub")
                else:
                    self._send_json({"success": False, "error": "Invalid token"}, 401)
                    return
            except Exception as e:
                self._send_json({"success": False, "error": f"Token decode error: {str(e)}"}, 401)
                return
            
            if not user_id:
                self._send_json({"success": False, "error": "User not found in token"}, 401)
                return
            
            print(f"Verifying deposit: tx={tx_hash}, user={user_id}")
            result = verify_deposit_for_user(tx_hash, user_id)
            self._send_json(result)
        elif self.path == "/auto-withdraw":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            body_str = body.decode("utf-8", errors="replace")
            try:
                data = json.loads(body_str)
            except Exception as e:
                self._send_json({"success": False, "error": f"Invalid JSON: {str(e)}"}, 400)
                return

            # Auth: extract user_id from JWT
            auth_header = self.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                self._send_json({"success": False, "error": "Authentication required"}, 401)
                return
            token = auth_header[7:]
            try:
                import base64
                parts = token.split(".")
                if len(parts) < 2:
                    self._send_json({"success": False, "error": "Invalid token"}, 401)
                    return
                payload = parts[1] + "=" * (4 - len(parts[1]) % 4)
                jwt_data = json.loads(base64.urlsafe_b64decode(payload))
                user_id = jwt_data.get("sub")
            except Exception as e:
                self._send_json({"success": False, "error": f"Token decode error: {str(e)}"}, 401)
                return
            if not user_id or not _UUID_RE.match(user_id):
                self._send_json({"success": False, "error": "Invalid user in token"}, 401)
                return

            # Token type: TUNG (default) or USDT
            token_type = (data.get("tokenType") or "TUNG").upper()
            if token_type not in ("TUNG", "USDT"):
                self._send_json({"success": False, "error": "Unsupported token type"}, 400)
                return

            amount = data.get("amount")
            wallet_address = (data.get("wallet_address") or "").strip()
            print(f"[withdraw] request user={user_id} token={token_type} amount={amount} to={wallet_address}", flush=True)

            # 2FA: exige y consume el codigo de confirmacion enviado por correo
            code = (data.get("code") or "").strip()
            code_ok, code_err = verify_withdrawal_code(user_id, amount, wallet_address, token_type, code)
            if not code_ok:
                self._send_json({"success": False, "error": code_err, "requires_code": True}, 403)
                return

            try:
                result, status = process_withdrawal_for_user(user_id, amount, wallet_address, token_type)
            except Exception as e:
                print(f"[withdraw] unexpected error: {e}", flush=True)
                result, status = {"success": False, "error": str(e)[:200]}, 500
            self._send_json(result, status)
        elif self.path == "/deposit-address":
            # Return (creating if needed) the user's deterministic child deposit address.
            auth_header = self.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                self._send_json({"success": False, "error": "Authentication required"}, 401)
                return
            token = auth_header[7:]
            try:
                import base64
                parts = token.split(".")
                if len(parts) < 2:
                    self._send_json({"success": False, "error": "Invalid token"}, 401)
                    return
                payload = parts[1] + "=" * (4 - len(parts[1]) % 4)
                jwt_data = json.loads(base64.urlsafe_b64decode(payload))
                user_id = jwt_data.get("sub")
            except Exception as e:
                self._send_json({"success": False, "error": f"Token decode error: {str(e)}"}, 401)
                return
            if not user_id or not _UUID_RE.match(user_id):
                self._send_json({"success": False, "error": "Invalid user in token"}, 401)
                return
            try:
                addr, _ = get_or_register_child(user_id)
                cfg = get_deposit_config()
                self._send_json({
                    "success": True,
                    "address": addr,
                    "tungContract": TUNG_CONTRACT,
                    "usdtContract": USDT_CONTRACT,
                    "chainId": CHAIN_ID,
                    "gasBufferTung": cfg["gasBufferTung"],
                    "gasBufferUsdt": cfg["gasBufferUsdt"],
                    "sessionMinutes": cfg["sessionMinutes"],
                })
            except Exception as e:
                print(f"[deposit-address] error: {e}", flush=True)
                self._send_json({"success": False, "error": str(e)[:200]}, 500)
        else:
            self._send_json({"success": False, "error": "Not found"}, 404)
    
    def do_GET(self):
        if self.path == "/health":
            self._send_json({"status": "ok"})
        elif self.path == "/wallet-info":
            try:
                self._send_json(fetch_wallet_info())
            except Exception as e:
                self._send_json({"success": False, "error": str(e)}, 500)
        elif self.path == "/token-price":
            try:
                price_data = fetch_token_price()
                result = {
                    "success": True,
                    "priceUsd": price_data.get("priceUsd", 0),
                    "tokenSymbol": "TUNG",
                    "volume24h": price_data.get("volume24h", 0),
                    "liquidity": price_data.get("liquidity", 0),
                    "marketCap": price_data.get("marketCap", 0),
                    "priceChange24h": price_data.get("priceChange24h", 0)
                }
                self._send_json(result)
            except Exception as e:
                self._send_json({"success": True, "priceUsd": 0, "tokenSymbol": "TUNG", "volume24h": 0, "liquidity": 0, "marketCap": 0})
        else:
            self._send_json({"success": False, "error": "Not found"}, 404)
    
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9001
    # Start the background deposit worker (log scanning + child-wallet sweeping).
    if DEPOSIT_WORKER_ENABLED and _ETH_ACCOUNT_AVAILABLE and PRIVATE_KEY:
        threading.Thread(target=deposit_worker, daemon=True).start()
    else:
        print("[deposit-worker] disabled (needs eth-account + PRIVATE_KEY + DEPOSIT_WORKER_ENABLED)", flush=True)
    # Multi-threaded so a slow/stuck request (e.g. a withdrawal waiting on BSC)
    # never blocks health checks, price, deposits, or other users' withdrawals.
    server = ThreadingHTTPServer(("0.0.0.0", port), DepositHandler)
    server.daemon_threads = True
    print(f"XNova Deposit Service running on port {port} (threaded)")
    sys.stdout.flush()
    server.serve_forever()
