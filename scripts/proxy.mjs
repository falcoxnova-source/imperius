// Simple reverse proxy to replace Kong
// Proxies :8000 -> auth:9999 and rest:3000
import http from 'http';
import httpProxy from 'http-proxy';

const PORT = 8000;

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
});

// Routes:
//   /auth/v1/*  -> http://xnova-auth:9999/*
//   /rest/v1/*  -> http://xnova-rest:3000/*
const ROUTES = {
  '/auth/v1/': 'http://xnova-auth:9999',
  '/rest/v1/': 'http://xnova-rest:3000',
};

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info, prefer, x-request-id');
  res.setHeader('Access-Control-Expose-Headers', 'content-range, x-total-count');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let target = null;
  let targetPath = req.url;

  for (const [prefix, upstream] of Object.entries(ROUTES)) {
    if (req.url.startsWith(prefix)) {
      target = upstream;
      targetPath = req.url; // keep full path
      break;
    }
  }

  if (!target) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  console.log(`[proxy] ${req.method} ${req.url} -> ${target}${targetPath}`);
  proxy.web(req, res, { target });
});

server.listen(PORT, () => {
  console.log(`Simple proxy running on port ${PORT}`);
  console.log('Routes:');
  for (const [prefix, upstream] of Object.entries(ROUTES)) {
    console.log(`  ${prefix} -> ${upstream}`);
  }
});

proxy.on('error', (err, req, res) => {
  console.error('[proxy error]', err.message);
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad gateway', details: err.message }));
  }
});
