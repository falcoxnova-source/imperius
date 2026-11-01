#!/usr/bin/env python3
"""One-shot backfill: re-scan the frozen gap and credit ALL missed deposits.
Reuses deposit_service's own helpers so logic/idempotency match exactly.
Safe to run alongside the worker (credit_auto_deposit is idempotent by tx_hash).
"""
import sys, time
sys.argv = ["backfill"]  # avoid the module treating extra args as a port
import deposit_service as ds

FROM_BLOCK = 111688260  # a bit before the freeze point (111688269)

bn = ds.rpc_call("eth_blockNumber", [])
head = int(bn, 16) if bn else 0
if head <= 0:
    print("ERROR: could not get head block")
    sys.exit(1)
safe_to = head - ds.DEPOSIT_CONFIRMATIONS
print(f"[backfill] scanning {FROM_BLOCK} -> {safe_to} ({safe_to-FROM_BLOCK} blocks)", flush=True)

children = ds.load_children()
print(f"[backfill] {len(children)} child addresses", flush=True)
topic_children = [ds._addr_topic(a) for a in children.keys()]

credited = 0
duplicates = 0
errors = 0
CHUNK = ds.LOGS_MAX_RANGE
# Scan NEWEST->OLDEST so recent deposits (users waiting right now) get credited
# first. Order doesn't matter for correctness (credit is idempotent by tx_hash).
end = safe_to
while end >= FROM_BLOCK:
    start = max(end - CHUNK + 1, FROM_BLOCK)
    params = [{
        "fromBlock": hex(start),
        "toBlock": hex(end),
        "address": [ds.TUNG_CONTRACT, ds.USDT_CONTRACT],
        "topics": [ds.TRANSFER_TOPIC, None, topic_children],
    }]
    part = ds.logs_rpc_call("eth_getLogs", params)
    if part is None:
        print(f"[backfill] logs failed {start}-{end}, retrying in 3s", flush=True)
        time.sleep(3)
        continue
    for lg in part:
        try:
            log_addr = (lg.get("address") or "").lower()
            if log_addr == ds.USDT_CONTRACT.lower():
                token, token_contract = "USDT", ds.USDT_CONTRACT
            else:
                token, token_contract = "TUNG", ds.TUNG_CONTRACT
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
            decimals = ds.get_token_decimals(token_contract)
            amount = amount_raw / (10 ** decimals)
            tx_hash = lg.get("transactionHash", "")
            if not ds._HEX_TX_RE.match(tx_hash or ""):
                continue
            block = int(lg.get("blockNumber", "0x0"), 16)
            sql = (
                f"SELECT public.credit_auto_deposit('{tx_hash.lower()}','{uid}'::uuid,"
                f"{amount}::numeric,'{token}',{block}::bigint,'{to_addr}');"
            )
            res = ds.db_query(sql)
            rs = str(res)
            if "duplicate" in rs and "true" in rs:
                duplicates += 1
            else:
                credited += 1
                print(f"[backfill] CREDIT {amount} {token} user={uid} block={block} tx={tx_hash} -> {res}", flush=True)
        except Exception as e:
            errors += 1
            print(f"[backfill] parse error: {e}", flush=True)
    end = start - 1
    if (end // CHUNK) % 20 == 0:
        print(f"[backfill] progress at block {end} (credited={credited} dup={duplicates})", flush=True)

print(f"[backfill] DONE. new_credits={credited} duplicates={duplicates} errors={errors}", flush=True)
