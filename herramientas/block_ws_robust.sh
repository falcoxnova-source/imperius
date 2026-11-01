#!/bin/sh
echo "=== Robust fix: Monkey-patch WebSocket in index.html ==="

cd /root/xnova/frontend-html/

# Backup
cp index.html index.html.bak4

# Add a script right after <head> that blocks realtime WebSocket connections
python3 << 'PYEOF'
import re

with open('/root/xnova/frontend-html/index.html', 'r') as f:
    html = f.read()

# Script to inject: blocks WebSocket connections to /realtime/ endpoints
block_script = '''<script>
// Block Supabase realtime WebSocket connections (no realtime server available)
(function(){
  var OrigWS = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    if (typeof url === 'string' && url.indexOf('/realtime/') !== -1) {
      console.log('[Xnova] Realtime WebSocket blocked - not available');
      // Return a mock that immediately closes, preventing reconnect loops
      var dummy = { url: url, readyState: 3, close: function(){}, send: function(){}, addEventListener: function(e,f){ if(e==="open"||e==="close") setTimeout(f,0); } };
      setTimeout(function(){ if(dummy.onclose) dummy.onclose({code:1000}); }, 0);
      return dummy;
    }
    return new OrigWS(url, protocols);
  };
  window.WebSocket.prototype = OrigWS.prototype;
  window.WebSocket.CONNECTING = 0;
  window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2;
  window.WebSocket.CLOSED = 3;
})();
</script>
'''

# Insert after <head> or before first <script>
if '<head>' in html:
    html = html.replace('<head>', '<head>\n' + block_script)
    print("Inserted after <head>")
elif '<body>' in html:
    html = html.replace('<body>', '<body>\n' + block_script)
    print("Inserted after <body>")
else:
    html = block_script + html
    print("Prepended to document")

with open('/root/xnova/frontend-html/index.html', 'w') as f:
    f.write(html)

print("index.html patched successfully")
PYEOF

echo ""
echo "=== Verify patch ==="
grep -o 'Realtime WebSocket blocked' /root/xnova/frontend-html/index.html

echo ""
echo "=== Done ==="
