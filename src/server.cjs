'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { validateEvent } = require('./state.cjs');
const MAX_BYTES = 4096;

function createEventServer({ token, store, onState = () => {}, port = 47831 }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('需要安全的本机令牌');
  const expected = Buffer.from(token);
  const server = http.createServer((req, res) => {
    const send = (status, data) => { if (!res.writableEnded) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); } };
    const host = req.headers.host || '';
    // No browser origins are accepted. This endpoint is for local agent processes only.
    if (req.headers.origin || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return send(403, { error: '只接受本机进程请求' });
    if (req.url === '/health' && req.method === 'GET') return send(200, { ok: true, app: 'mimi-pet', version: 1 });
    const provided = Buffer.from(typeof req.headers['x-mimi-token'] === 'string' ? req.headers['x-mimi-token'] : '');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return send(401, { error: '本机令牌无效' });
    if (req.url !== '/events') return send(404, { error: '没有这个接口' });
    if (req.method !== 'POST') return send(405, { error: '需要 POST' });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: '需要 application/json' });
    if (Number(req.headers['content-length']) > MAX_BYTES) { req.resume(); return send(413, { error: '请求过大' }); }
    let bytes = 0; let body = ''; let oversized = false;
    req.setEncoding('utf8');
    req.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > MAX_BYTES) { oversized = true; body = ''; send(413, { error: '请求过大' }); } else if (!oversized) body += chunk; });
    req.on('end', () => {
      if (oversized) return;
      let input;
      try { input = JSON.parse(body); } catch { return send(400, { error: 'JSON 无效' }); }
      const error = validateEvent(input);
      if (error) return send(400, { error });
      const state = store.accept(input);
      onState(state);
      send(202, { ok: true, state: state.event });
    });
    req.on('error', () => send(400, { error: '请求中断' }));
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 20;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server); });
  });
}

module.exports = { createEventServer, MAX_BYTES };
