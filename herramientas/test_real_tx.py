import json, urllib.request

url = 'http://localhost:9001/verify-deposit'
payload = json.dumps({'txHash': '0xd3554cd835147e3a81c2a6a4d1375cab803803ea6c8afad42f7839ba29cb267d'}).encode()
headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.test'
}
req = urllib.request.Request(url, data=payload, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode())
except urllib.error.HTTPError as e:
    print(e.read().decode())
