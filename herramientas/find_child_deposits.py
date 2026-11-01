#!/usr/bin/env python3
"""Find & credit any TUNG/USDT deposits into ONE child address over a recent range.
Idempotent. Prints block numbers so we know if the main backfill will reach them.
"""
import sys
sys.argv = ["find_child"]
import deposit_service as ds

CHILD = "0x01697fe05f5ce57b508328dda064fdbc6f820acd"
uid = None
children = ds.load_children()
uid = children.get(CHILD)
print(f"child={CHILD} uid={uid}", flush=True)

bn = ds.rpc_call("eth_blockNumber", [])
head = int(bn, 16)
frm = head - 300000  # ~10 days
topic_child = ds._addr_topic(CHILD)
print(f"scanning {frm} -> {head} for transfers INTO child", flush=True)

start = frm
CHUNK = ds.LOGS_MAX_RANGE
found = []
while start <= head:
    end = min(start + CHUNK - 1, head)
    params = [{
        "fromBlock": hex(start), "toBlock": hex(end),
        "address": [ds.TUNG_CONTRACT, ds.USDT_CONTRACT],
        "topics": [ds.TRANSFER_TOPIC, None, [topic_child]],
    }]
    part = ds.logs_rpc_call("eth_getLogs", params)
    if part is None:
        start = end + 1
        continue
    for lg in part:
        token = "USDT" if (lg.get("address") or "").lower() == ds.USDT_CONTRACT.lower() else "TUNG"
        amt = int(lg.get("data", "0x0"), 16) / 1e18
        blk = int(lg.get("blockNumber", "0x0"), 16)
        txh = lg.get("transactionHash", "")
        found.append((blk, amt, token, txh))
    start = end + 1

found.sort()
print(f"=== {len(found)} incoming transfers found ===", flush=True)
for blk, amt, token, txh in found:
    if uid:
        sql = (f"SELECT public.credit_auto_deposit('{txh.lower()}','{uid}'::uuid,"
               f"{amt}::numeric,'{token}',{blk}::bigint,'{CHILD}');")
        res = ds.db_query(sql)
        print(f"block={blk} amt={amt} {token} tx={txh} -> {res}", flush=True)
    else:
        print(f"block={blk} amt={amt} {token} tx={txh} (NO uid!)", flush=True)
print("DONE", flush=True)
