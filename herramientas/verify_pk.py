#!/usr/bin/env python3
from eth_account import Account
pk = "0x4a17700792cc7b903c2f27225f9f868e7054f7c1bada741292fec756d8a9f9bf"
exp = "0x387526aa3f94f5C41e6a47D8c98751273e2214A3"
a = Account.from_key(pk)
print("Derived :", a.address)
print("Expected:", exp)
print("MATCH   :", a.address.lower() == exp.lower())
