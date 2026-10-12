'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.cjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400).end(); return; }
  if (url === '/') url = '/src/index.html';
  if (!url.startsWith('/src/') && !url.startsWith('/assets/pet/')) { res.writeHead(404).end(); return; }
  const filename = path.resolve(root, `.${url}`);
  if (!filename.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
  fs.readFile(filename, (error, data) => { if (error) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
});
server.listen(47832, '127.0.0.1', () => console.log('咪咪动作预览：http://127.0.0.1:47832/src/index.html'));
